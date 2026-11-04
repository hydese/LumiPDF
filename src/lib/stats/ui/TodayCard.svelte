<script lang="ts">
  /** Library card: today's study time against the goal, the streak, and the week at a glance. */
  import { t, tn } from "../../i18n";
  import { navigation } from "../../app/navigation.svelte";
  import { settings } from "../../settings/store.svelte";
  import SourceCard from "../../library/ui/SourceCard.svelte";
  import { lastDays, rangeTotal, shortDuration } from "../stats";
  import { studyStats } from "../statsState.svelte";
  import DayBars from "./DayBars.svelte";
  import GoalRing from "./GoalRing.svelte";

  const week = $derived(lastDays(studyStats.days, new Date(), 7));
  const weekTotal = $derived(rangeTotal(studyStats.days, new Date(), 7));
</script>

<SourceCard icon="stats" tone="green" title={t("stats.today")} subtitle={studyStats.streak ? tn("stats.streakDays", studyStats.streak) : t("stats.noStreak")}>
  {#snippet action()}
    <button class="btn small" onclick={() => navigation.go("stats")}>{t("stats.open")}</button>
  {/snippet}
  <button class="body" onclick={() => navigation.go("stats")} aria-label={t("stats.open")}>
    <GoalRing progress={studyStats.progress} size={84} stroke={8}>
      <strong class="time">{shortDuration(studyStats.today)}</strong>
      {#if studyStats.goal}<span class="of">{t("stats.ofGoal", { goal: shortDuration(studyStats.goal) })}</span>{/if}
    </GoalRing>
    <div class="week">
      <span class="label">{t("stats.thisWeek")}<strong>{weekTotal >= 60 ? shortDuration(weekTotal) : "—"}</strong></span>
      <DayBars days={week} goal={studyStats.goal} height={52} compact locale={settings.value.app.locale} />
    </div>
  </button>
</SourceCard>

<style>
  .body {
    display: flex;
    align-items: center;
    gap: 18px;
    padding: 0;
    border: none;
    background: transparent;
    text-align: left;
    color: inherit;
    cursor: pointer;
  }
  .time {
    font-size: 17px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    letter-spacing: -0.01em;
  }
  .of {
    font-size: 11px;
    color: var(--text-muted);
  }
  .week {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .label {
    display: flex;
    justify-content: space-between;
    font-size: 12px;
    color: var(--text-muted);
  }
  .label strong {
    color: var(--text);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }
</style>
