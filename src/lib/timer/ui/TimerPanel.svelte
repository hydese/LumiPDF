<script lang="ts">
  import { formatDuration, t, tn } from "../../i18n";
  import { settings } from "../../settings/store.svelte";
  import type { TimerSettings } from "../../settings/schema";
  import { library } from "../../library/library.svelte";
  import { studyStreak } from "../../app/dates";
  import { formatClock, timer, type Phase } from "../timer.svelte";
  import { studyClock } from "../study.svelte";
  import DurationField from "./DurationField.svelte";
  import Icon from "../../ui/Icon.svelte";

  const PHASE_LABEL = { focus: "timer.focus", short: "timer.shortBreak", long: "timer.longBreak" } as const;
  const FIELDS: Array<{ phase: Phase; key: keyof TimerSettings }> = [
    { phase: "focus", key: "focus" },
    { phase: "short", key: "shortBreak" },
    { phase: "long", key: "longBreak" },
  ];

  const R = 82;
  const CIRCUMFERENCE = 2 * Math.PI * R;
  const streak = $derived(studyStreak(library.view?.studyDays ?? {}, new Date()));

  function setMinutes(key: keyof TimerSettings, minutes: number) {
    settings.update((s) => ((s.timer as unknown as Record<string, number>)[key] = minutes));
    timer.syncWithSettings();
  }
</script>

<section class="timer">
  <header>
    <h2>{t("timer.title")}</h2>
    <span>{t("timer.session", { n: timer.session, total: settings.value.timer.sessionsBeforeLong })}</span>
  </header>

  <div class="fields">
    {#each FIELDS as f (f.key)}
      <DurationField
        label={t(PHASE_LABEL[f.phase])}
        value={settings.value.timer[f.key] as number}
        highlighted={timer.phase === f.phase}
        onChange={(m) => setMinutes(f.key, m)}
      />
    {/each}
  </div>
  <p class="hint">{t("timer.hint")}</p>

  <div class="ring" role="timer" aria-label={t("timer.pillTitle", { phase: t(PHASE_LABEL[timer.phase]), time: formatClock(timer.remainingMs) })}>
    <svg width="176" height="176" viewBox="0 0 190 190" aria-hidden="true">
      <circle cx="95" cy="95" r={R} fill="none" stroke="var(--track)" stroke-width="10" />
      <circle
        cx="95"
        cy="95"
        r={R}
        fill="none"
        stroke={timer.phase === "focus" ? "var(--timer)" : "var(--ok)"}
        stroke-width="10"
        stroke-linecap="round"
        stroke-dasharray="{CIRCUMFERENCE * timer.progress} {CIRCUMFERENCE}"
        transform="rotate(-90 95 95)"
      />
    </svg>
    <div class="readout">
      <span class="clock">{formatClock(timer.remainingMs)}</span>
      <span class="phase">{t(PHASE_LABEL[timer.phase])}</span>
    </div>
  </div>

  <div class="controls">
    <button class="round" aria-label={t("timer.reset")} title={t("timer.reset")} onclick={() => timer.reset()}>
      <Icon name="reset" size={17} stroke={2} />
    </button>
    <button class="main" data-autofocus class:break={timer.phase !== "focus"} onclick={() => timer.toggle()}>
      {timer.running ? t("timer.pause") : timer.remainingMs < timer.totalMs ? t("timer.resume") : t("timer.start")}
    </button>
    <button class="round" aria-label={t("timer.skip")} title={t("timer.skip")} onclick={() => timer.skip()}>
      <Icon name="skip" size={17} stroke={2} />
    </button>
  </div>

  <footer>
    <span>{t("timer.today")} <strong>{formatDuration(studyClock.todaySeconds)}</strong></span>
    <span>{t("timer.streak")} <strong>{tn("timer.streakDays", streak)}</strong></span>
    <span>{t("timer.longAfter")} <strong>{settings.value.timer.sessionsBeforeLong}</strong></span>
  </footer>
</section>

<style>
  .timer {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16px;
    padding: 18px;
  }
  header {
    align-self: stretch;
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 12px;
    color: var(--text-muted);
  }
  h2 {
    margin: 0;
    font-size: 14px;
    font-weight: 600;
    color: var(--text);
  }
  .fields {
    align-self: stretch;
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
  }
  .hint {
    align-self: stretch;
    margin: -8px 0 0;
    font-size: 11px;
    color: var(--text-faint);
  }
  .ring {
    position: relative;
    width: 176px;
    height: 176px;
  }
  .ring circle {
    transition: stroke-dasharray 250ms linear;
  }
  .readout {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
  }
  .clock {
    font-family: var(--font-display);
    font-size: 38px;
    font-weight: 600;
    letter-spacing: -0.02em;
    font-variant-numeric: tabular-nums;
  }
  .phase {
    font-size: 12px;
    color: var(--text-muted);
  }
  .controls {
    display: flex;
    gap: 10px;
  }
  .round {
    width: 44px;
    height: 44px;
    border-radius: 22px;
    border: none;
    background: var(--field);
    display: grid;
    place-items: center;
  }
  .round:hover {
    background: var(--pressed);
  }
  .main {
    min-width: 116px;
    height: 44px;
    padding: 0 28px;
    border-radius: 22px;
    border: none;
    background: var(--timer);
    color: var(--timer-on);
    font-size: 14px;
    font-weight: 600;
  }
  .main.break {
    background: var(--ok);
    color: #08210f;
  }
  .main:hover {
    filter: brightness(1.05);
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
