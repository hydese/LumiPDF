/**
 * Shared timers between windows (see windows.rs): each timer reports a change here, and the
 * sharing layer (timers.svelte.ts → shareTimers) sends the new state to the other windows.
 * Only the "owner" window (the primary one) rings and moves Pomodoro phases on; the others
 * show the same state and wait for it.
 */
let listener: (() => void) | null = null;
let muted = 0;
let owner: () => boolean = () => true;

/** A timer changed because of this window (not because another window said so). */
export function timerChanged(): void {
  if (!muted) listener?.();
}

export function onTimerChange(fn: (() => void) | null): void {
  listener = fn;
}

/** Applies another window's state without echoing it back. */
export function quietly(fn: () => void): void {
  muted++;
  try {
    fn();
  } finally {
    muted--;
  }
}

/** Whether this window rings and advances the timers. */
export const isTimerOwner = (): boolean => owner();
export function setTimerOwner(fn: () => boolean): void {
  owner = fn;
}
