/** A soft two-note bell, synthesized so no sound file is needed. */
export function playBell(): void {
  try {
    const ctx = new AudioContext();
    const now = ctx.currentTime;
    for (const [freq, delay] of [
      [880, 0],
      [1320, 0.18],
    ] as const) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, now + delay);
      gain.gain.exponentialRampToValueAtTime(0.18, now + delay + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + delay + 1.6);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + delay);
      osc.stop(now + delay + 1.7);
    }
    setTimeout(() => void ctx.close(), 2200);
  } catch {
    // No audio device: the timer still works silently.
  }
}
