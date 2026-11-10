import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { countdown } from "../../src/lib/timer/countdown.svelte";
import { pomodoro } from "../../src/lib/timer/pomodoro.svelte";
import { chrono } from "../../src/lib/timer/chrono.svelte";
import { ringer } from "../../src/lib/timer/ringer.svelte";
import { onTimerChange, quietly, setTimerOwner } from "../../src/lib/timer/bus";

vi.mock("../../src/lib/timer/bell", () => ({ playBell: () => {} }));
vi.mock("../../src/lib/platform/window", () => ({ bringWindowToFront: () => {} }));

// Every window has its own copy of the timers; these tests play two windows with one copy by
// taking a snapshot ("sent") and applying it again ("received").
describe("timers shared between windows", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setTimerOwner(() => true);
    countdown.reset();
    chrono.reset();
    pomodoro.reset();
    ringer.stop();
  });
  afterEach(() => {
    onTimerChange(null);
    vi.useRealTimers();
  });

  it("reports this window's changes, not the ones received", () => {
    const changes = vi.fn();
    onTimerChange(changes);
    countdown.start();
    expect(changes).toHaveBeenCalledTimes(1);
    const sent = countdown.snapshot();
    quietly(() => countdown.apply(sent));
    expect(changes).toHaveBeenCalledTimes(1);
  });

  it("a received running countdown keeps counting to the same end", () => {
    countdown.start();
    vi.advanceTimersByTime(60_000);
    const sent = countdown.snapshot();
    countdown.reset();
    countdown.apply(sent);
    expect(countdown.running).toBe(true);
    vi.advanceTimersByTime(1_000);
    expect(countdown.remainingMs).toBe(sent.endsAt - Date.now());
  });

  it("only the primary window rings", () => {
    setTimerOwner(() => false);
    countdown.start();
    vi.advanceTimersByTime(countdown.totalMs + 1_000);
    expect(ringer.ringing).toBeNull();
    expect(countdown.remainingMs).toBe(0);
    setTimerOwner(() => true);
    countdown.apply({ ...countdown.snapshot(), running: true }); // the primary's state
    vi.advanceTimersByTime(500);
    expect(ringer.ringing).toBe("timer");
  });

  it("a waiting window doesn't move the Pomodoro on by itself", () => {
    setTimerOwner(() => false);
    pomodoro.start();
    vi.advanceTimersByTime(pomodoro.totalMs + 1_000);
    expect(pomodoro.phase).toBe("focus");
    setTimerOwner(() => true);
    pomodoro.apply({ ...pomodoro.snapshot(), running: true });
    vi.advanceTimersByTime(500);
    expect(pomodoro.phase).toBe("short");
  });

  it("the stopwatch and its laps carry over", () => {
    chrono.start();
    vi.advanceTimersByTime(5_000);
    chrono.lap();
    const sent = chrono.snapshot();
    chrono.reset();
    chrono.apply(sent);
    vi.advanceTimersByTime(1_000);
    expect(chrono.laps).toEqual(sent.laps);
    expect(chrono.elapsedMs).toBeGreaterThanOrEqual(6_000);
  });
});
