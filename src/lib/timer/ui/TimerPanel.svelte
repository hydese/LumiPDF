<script lang="ts">
  /** The timer popover: four modes on top (Timer, Pomodoro, Alarm, Chrono). */
  import { formatDuration, t, tn, type MessageKey } from "../../i18n";
  import { settings } from "../../settings/store.svelte";
  import type { TimerMode, TimerSettings } from "../../settings/schema";
  import { TIMER_LIMITS } from "../../settings/schema";
  import { library } from "../../library/library.svelte";
  import { studyStreak } from "../../app/dates";
  import { countdown } from "../countdown.svelte";
  import { pomodoro } from "../pomodoro.svelte";
  import { alarm } from "../alarm.svelte";
  import { chrono } from "../chrono.svelte";
  import { timers } from "../timers.svelte";
  import { studyClock } from "../study.svelte";
  import { formatClock, formatStopwatch } from "../format";
  import DurationField from "./DurationField.svelte";
  import Ring from "./Ring.svelte";
  import Stepper from "./Stepper.svelte";
  import Icon from "../../ui/Icon.svelte";

  const MODES: TimerMode[] = ["timer", "pomodoro", "alarm", "chrono"];
  const PHASE = { focus: "timer.focus", short: "timer.shortBreak", long: "timer.longBreak" } as const;
  const PRESETS = [5, 10, 15, 25, 45, 60];

  const mode = $derived(settings.value.timer.mode);
  const opts = $derived(settings.value.timer);
  const streak = $derived(studyStreak(library.view?.studyDays ?? {}, new Date()));
  const [alarmH, alarmM] = $derived(opts.alarm.split(":").map(Number) as [number, number]);

  function set<K extends keyof TimerSettings>(key: K, value: TimerSettings[K]) {
    settings.update((s) => (s.timer[key] = value));
    timers.syncWithSettings();
  }
  function setAlarm(h: number, m: number) {
    set("alarm", `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
  }
  /** Mode tabs show a dot when that mode is running in the background. */
  const runningIn = $derived<Record<TimerMode, boolean>>({
    timer: countdown.active,
    pomodoro: pomodoro.active,
    alarm: alarm.armed,
    chrono: chrono.active,
  });
</script>

<section class="panel">
  <div class="modes" role="tablist" aria-label={t("timer.modes")}>
    {#each MODES as m (m)}
      <button role="tab" aria-selected={mode === m} onclick={() => set("mode", m)}>
        {t(`timer.mode.${m}` as MessageKey)}
        {#if runningIn[m] && mode !== m}<span class="dot"></span>{/if}
      </button>
    {/each}
  </div>

  {#if mode === "timer"}
    <Ring progress={countdown.active ? countdown.progress : null} label={formatClock(countdown.shownMs)}>
      {#if countdown.active}
        <span class="big">{formatClock(countdown.remainingMs)}</span>
        <span class="small">{t("timer.mode.timer")} · {opts.countdown} {t("timer.minutes")}</span>
      {:else}
        <Stepper
          value={opts.countdown}
          min={TIMER_LIMITS.minMinutes}
          max={TIMER_LIMITS.maxMinutes}
          step={5}
          label={t("timer.minutesLabel", { label: t("timer.mode.timer") })}
          upLabel={t("timer.more", { label: t("timer.mode.timer") })}
          downLabel={t("timer.less", { label: t("timer.mode.timer") })}
          onChange={(v) => set("countdown", v)}
        />
        <span class="small">{t("timer.minutes")}</span>
      {/if}
    </Ring>
    {#if !countdown.active}
      <div class="presets" aria-label={t("timer.presets")}>
        {#each PRESETS as p (p)}
          <button class:on={opts.countdown === p} onclick={() => set("countdown", p)}>{p}</button>
        {/each}
      </div>
    {/if}
    <div class="controls">
      <button class="round" aria-label={t("timer.reset")} title={t("timer.reset")} disabled={!countdown.active} onclick={() => countdown.reset()}>
        <Icon name="reset" size={17} stroke={2} />
      </button>
      <button class="main" data-autofocus onclick={() => countdown.toggle()}>
        {countdown.running ? t("timer.pause") : countdown.active ? t("timer.resume") : t("timer.start")}
      </button>
      <button class="round text" title={t("timer.plus5")} disabled={!countdown.active} onclick={() => countdown.extend(5)}>{t("timer.plus5")}</button>
    </div>
  {:else if mode === "pomodoro"}
    <div class="fields">
      <DurationField label={t("timer.focus")} value={opts.focus} highlighted={pomodoro.phase === "focus"} onChange={(m) => set("focus", m)} />
      <DurationField label={t("timer.shortBreak")} value={opts.shortBreak} highlighted={pomodoro.phase === "short"} onChange={(m) => set("shortBreak", m)} />
      <DurationField label={t("timer.longBreak")} value={opts.longBreak} highlighted={pomodoro.phase === "long"} onChange={(m) => set("longBreak", m)} />
    </div>
    <Ring progress={pomodoro.progress} colour={pomodoro.phase === "focus" ? "var(--timer)" : "var(--ok)"} label={formatClock(pomodoro.remainingMs)}>
      <span class="big">{formatClock(pomodoro.remainingMs)}</span>
      <span class="small">{t(PHASE[pomodoro.phase])} · {t("timer.session", { n: pomodoro.session, total: opts.sessionsBeforeLong })}</span>
    </Ring>
    <div class="controls">
      <button class="round" aria-label={t("timer.reset")} title={t("timer.reset")} onclick={() => pomodoro.reset()}>
        <Icon name="reset" size={17} stroke={2} />
      </button>
      <button class="main pomodoro" class:break={pomodoro.phase !== "focus"} data-autofocus onclick={() => pomodoro.toggle()}>
        {pomodoro.running ? t("timer.pause") : pomodoro.remainingMs < pomodoro.totalMs ? t("timer.resume") : t("timer.start")}
      </button>
      <button class="round" aria-label={t("timer.skip")} title={t("timer.skip")} onclick={() => pomodoro.skip()}>
        <Icon name="skip" size={17} stroke={2} />
      </button>
    </div>
    <div class="sessions">
      <span>{t("timer.longAfterLabel")}</span>
      <span class="mini-stepper">
        <button aria-label={t("timer.longAfterLess")} disabled={opts.sessionsBeforeLong <= TIMER_LIMITS.minSessions} onclick={() => set("sessionsBeforeLong", opts.sessionsBeforeLong - 1)}>
          <Icon name="minus" size={13} stroke={2.2} />
        </button>
        <strong>{opts.sessionsBeforeLong}</strong>
        <button aria-label={t("timer.longAfterMore")} disabled={opts.sessionsBeforeLong >= TIMER_LIMITS.maxSessions} onclick={() => set("sessionsBeforeLong", opts.sessionsBeforeLong + 1)}>
          <Icon name="plus" size={13} stroke={2.2} />
        </button>
      </span>
    </div>
  {:else if mode === "alarm"}
    <Ring progress={null} label={opts.alarm}>
      <div class="clock-set">
        <Stepper value={alarmH} min={0} max={23} step={1} wrap pad={2} label={t("timer.hours")} upLabel={t("timer.hourUp")} downLabel={t("timer.hourDown")} onChange={(h) => setAlarm(h, alarmM)} />
        <span class="big colon">:</span>
        <Stepper value={alarmM} min={0} max={59} step={5} wrap pad={2} label={t("timer.minutesShort")} upLabel={t("timer.minuteUp")} downLabel={t("timer.minuteDown")} onChange={(m) => setAlarm(alarmH, m)} />
      </div>
    </Ring>
    <p class="alarm-status">{alarm.armed ? t("timer.alarmIn", { time: formatDuration(alarm.remainingMs / 1000 + 59) }) : t("timer.alarmIdle")}</p>
    <div class="controls">
      <button class="main" class:off={alarm.armed} data-autofocus onclick={() => alarm.toggle()}>
        {alarm.armed ? t("timer.alarmOff") : t("timer.alarmSet")}
      </button>
    </div>
    <p class="note">{t("timer.alarmNote")}</p>
  {:else}
    <Ring progress={null} label={formatStopwatch(chrono.elapsedMs)}>
      <span class="big">{formatStopwatch(chrono.elapsedMs)}</span>
      <span class="small">{t("timer.mode.chrono")}</span>
    </Ring>
    <div class="controls">
      <button class="round text" disabled={!chrono.active} onclick={() => (chrono.running ? chrono.lap() : chrono.reset())}>
        {chrono.running ? t("timer.lap") : t("timer.reset")}
      </button>
      <button class="main" data-autofocus onclick={() => chrono.toggle()}>
        {chrono.running ? t("timer.pause") : chrono.active ? t("timer.resume") : t("timer.start")}
      </button>
    </div>
    {#if chrono.laps.length}
      <ol class="laps">
        {#each [...chrono.laps].reverse() as split, i (split)}
          {@const n = chrono.laps.length - i}
          {@const previous = chrono.laps[n - 2] ?? 0}
          <li>
            <span>{t("timer.lapN", { n })}</span>
            <span class="lap-time">{formatStopwatch(split - previous)}</span>
            <span class="lap-total">{formatStopwatch(split)}</span>
          </li>
        {/each}
      </ol>
    {/if}
  {/if}

  <footer>
    <span>{t("timer.today")} <strong>{formatDuration(studyClock.todaySeconds)}</strong></span>
    <span>{t("timer.streak")} <strong>{tn("timer.streakDays", streak)}</strong></span>
  </footer>
</section>

<style>
  .panel {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16px;
    padding: 14px 18px 16px;
  }
  .modes {
    align-self: stretch;
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 2px;
    padding: 3px;
    border-radius: 9px;
    background: var(--segment);
  }
  .modes button {
    position: relative;
    height: 28px;
    border: none;
    border-radius: 7px;
    background: transparent;
    color: var(--text-muted);
    font-size: 12.5px;
  }
  .modes button[aria-selected="true"] {
    background: var(--segment-on);
    color: var(--text);
    font-weight: 600;
    box-shadow: var(--segment-shadow);
  }
  .dot {
    position: absolute;
    top: 5px;
    right: 7px;
    width: 6px;
    height: 6px;
    border-radius: 3px;
    background: var(--timer);
  }
  .fields {
    align-self: stretch;
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
  }
  .presets {
    display: flex;
    gap: 6px;
    margin-top: -6px;
  }
  .presets button {
    min-width: 36px;
    height: 26px;
    padding: 0 8px;
    border-radius: 13px;
    border: 1px solid var(--hairline);
    background: transparent;
    color: var(--text-soft);
    font-size: 12px;
    font-variant-numeric: tabular-nums;
  }
  .presets button:hover {
    background: var(--hover);
  }
  .presets button.on {
    background: var(--accent-soft);
    border-color: transparent;
    color: var(--accent-text);
    font-weight: 600;
  }
  .clock-set {
    display: flex;
    align-items: center;
  }
  .colon {
    margin: 0 -2px 4px;
  }
  .controls {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .round {
    min-width: 44px;
    height: 44px;
    padding: 0;
    border-radius: 22px;
    border: none;
    background: var(--field);
    display: grid;
    place-items: center;
  }
  .round.text {
    padding: 0 14px;
    font-size: 12.5px;
    font-weight: 500;
  }
  .round:hover:not(:disabled) {
    background: var(--pressed);
  }
  .round:disabled {
    opacity: 0.4;
  }
  .main {
    min-width: 120px;
    height: 44px;
    padding: 0 28px;
    border-radius: 22px;
    border: none;
    background: var(--accent);
    color: var(--on-accent);
    font-size: 14px;
    font-weight: 600;
  }
  .main.pomodoro {
    background: var(--timer);
    color: var(--timer-on);
  }
  .main.break {
    background: var(--ok);
    color: #08210f;
  }
  .main.off {
    background: var(--field);
    color: var(--text);
  }
  .main:hover {
    filter: brightness(1.05);
  }
  .sessions {
    align-self: stretch;
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 12.5px;
    color: var(--text-soft);
  }
  .mini-stepper {
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 2px;
    border-radius: 8px;
    background: var(--field);
  }
  .mini-stepper strong {
    min-width: 24px;
    text-align: center;
    font-variant-numeric: tabular-nums;
    color: var(--text);
  }
  .mini-stepper button {
    width: 26px;
    height: 24px;
    border: none;
    border-radius: 6px;
    background: transparent;
    display: grid;
    place-items: center;
    color: var(--text-soft);
  }
  .mini-stepper button:hover:not(:disabled) {
    background: var(--pressed);
  }
  .mini-stepper button:disabled {
    opacity: 0.35;
  }
  .alarm-status {
    margin: -6px 0 0;
    font-size: 12.5px;
    color: var(--text-soft);
  }
  .note {
    margin: -6px 0 0;
    font-size: 11.5px;
    color: var(--text-faint);
    text-align: center;
  }
  .laps {
    align-self: stretch;
    list-style: none;
    margin: 0;
    padding: 0;
    max-height: 132px;
    overflow-y: auto;
    font-size: 12.5px;
    font-variant-numeric: tabular-nums;
  }
  .laps li {
    display: grid;
    grid-template-columns: 1fr auto auto;
    gap: 16px;
    padding: 6px 4px;
    border-top: 1px solid var(--hairline-soft);
  }
  .lap-total {
    color: var(--text-muted);
  }
  footer {
    align-self: stretch;
    display: flex;
    justify-content: space-between;
    gap: 8px;
    padding-top: 12px;
    border-top: 1px solid var(--hairline);
    color: var(--text-muted);
    font-size: 12px;
  }
  strong {
    color: var(--text);
    font-weight: 600;
  }
</style>
