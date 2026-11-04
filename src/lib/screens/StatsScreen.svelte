<script lang="ts">
  /** Study stats: today against the goal, streaks, totals, a 7/30-day chart, and what you studied most. */
  import { t, tn } from "../i18n";
  import { navigation } from "../app/navigation.svelte";
  import { library } from "../library/library.svelte";
  import { session } from "../reader/session.svelte";
  import { settings } from "../settings/store.svelte";
  import { STUDY_GOAL_LIMITS } from "../settings/schema";
  import TitleBar from "../ui/TitleBar.svelte";
  import BackButton from "../ui/BackButton.svelte";
  import BarActions from "../ui/BarActions.svelte";
  import Icon from "../ui/Icon.svelte";
  import GoalRing from "../stats/ui/GoalRing.svelte";
  import DayBars from "../stats/ui/DayBars.svelte";
  import { activeDays, allTime, bestStreak, lastDays, rangeTotal, shortDuration, topDocuments, topFolders } from "../stats/stats";
  import { studyStats } from "../stats/statsState.svelte";

  interface Props {
    barActions?: BarActions | null;
  }
  let { barActions = $bindable(null) }: Props = $props();

  let chartRange = $state<7 | 30>(7);
  let rankBy = $state<"documents" | "folders">("documents");
  let rankRange = $state<"7" | "30" | "all">("30");

  const now = new Date();
  const days = $derived(studyStats.days);
  const chart = $derived(lastDays(days, now, chartRange));
  const best = $derived(Math.max(bestStreak(days), studyStats.streak));
  const totals = $derived([
    { label: t("stats.thisWeek"), value: rangeTotal(days, now, 7) },
    { label: t("stats.last30"), value: rangeTotal(days, now, 30) },
    { label: t("stats.allTime"), value: allTime(days) },
  ]);
  const chartTotal = $derived(chart.reduce((s, d) => s + d.seconds, 0));
  const chartDaysActive = $derived(activeDays(days, now, chartRange));

  const docs = $derived(library.view?.documents ?? []);
  const range = $derived(rankRange === "all" ? null : Number(rankRange));
  const ranked = $derived(
    rankBy === "documents"
      ? topDocuments(docs, now, range)
      : topFolders(docs, library.view?.folders.map((f) => ({ path: f.path, name: f.name })) ?? [], now, range, t("stats.otherFolder")),
  );
  const rankedMax = $derived(Math.max(1, ...ranked.map((r) => r.seconds)));

  const goalMinutes = $derived(settings.value.study.goal);
  function setGoal(minutes: number) {
    const v = Math.min(STUDY_GOAL_LIMITS.max, Math.max(STUDY_GOAL_LIMITS.min, minutes));
    settings.update((s) => (s.study.goal = v));
  }

  function openRanked(key: string) {
    if (rankBy === "documents") void session.openFromLibrary(key);
    else if (key) {
      library.browse(key);
      navigation.go("library");
    }
  }
</script>

<div class="screen">
  <TitleBar>
    {#snippet left()}
      <BackButton label={t("nav.library")} onclick={() => navigation.go("library")} />
    {/snippet}
    {#snippet right()}
      <BarActions bind:this={barActions} />
    {/snippet}
  </TitleBar>

  <main class="content">
    <h1>{t("stats.title")}</h1>

    <div class="top">
      <section class="card today">
        <GoalRing progress={studyStats.progress} size={128} stroke={11}>
          <strong class="big">{shortDuration(studyStats.today)}</strong>
          <span class="muted">{studyStats.goal ? t("stats.ofGoal", { goal: shortDuration(studyStats.goal) }) : t("stats.today")}</span>
        </GoalRing>
        <div class="today-side">
          <h2>{t("stats.today")}</h2>
          <p class="muted">
            {#if !studyStats.goal}
              {t("stats.noGoal")}
            {:else if studyStats.progress >= 1}
              {t("stats.goalDone")}
            {:else}
              {t("stats.goalLeft", { time: shortDuration(studyStats.goal - studyStats.today) })}
            {/if}
          </p>
          <div class="goal" role="group" aria-label={t("stats.goal")}>
            <span>{t("stats.goal")}</span>
            <button class="icon-btn" aria-label={t("stats.goalLess")} disabled={goalMinutes <= 0} onclick={() => setGoal(goalMinutes - 15)}><Icon name="minus" size={14} stroke={2} /></button>
            <span class="goal-value">{goalMinutes ? shortDuration(goalMinutes * 60) : t("stats.goalOff")}</span>
            <button class="icon-btn" aria-label={t("stats.goalMore")} disabled={goalMinutes >= STUDY_GOAL_LIMITS.max} onclick={() => setGoal(goalMinutes + 15)}><Icon name="plus" size={14} stroke={2} /></button>
          </div>
        </div>
      </section>

      <section class="card streak">
        <h2>{t("stats.streak")}</h2>
        <p class="hero">{studyStats.streak}<span>{tn("stats.daysUnit", studyStats.streak)}</span></p>
        <p class="muted">{t("stats.best", { days: tn("stats.daysCount", best) })}</p>
      </section>

      <section class="card totals">
        <h2>{t("stats.totals")}</h2>
        <dl>
          {#each totals as row (row.label)}
            <div><dt>{row.label}</dt><dd>{row.value >= 60 ? shortDuration(row.value) : "—"}</dd></div>
          {/each}
        </dl>
      </section>
    </div>

    <section class="card chart">
      <div class="card-head">
        <div>
          <h2>{t("stats.chartTitle")}</h2>
          <p class="muted">
            {t("stats.chartSummary", { time: shortDuration(chartTotal), active: chartDaysActive, days: chartRange })}
          </p>
        </div>
        <div class="seg" role="radiogroup" aria-label={t("stats.chartTitle")}>
          <button role="radio" aria-checked={chartRange === 7} onclick={() => (chartRange = 7)}>{t("stats.range7")}</button>
          <button role="radio" aria-checked={chartRange === 30} onclick={() => (chartRange = 30)}>{t("stats.range30")}</button>
        </div>
      </div>
      <DayBars days={chart} goal={studyStats.goal} height={210} locale={settings.value.app.locale} />
      {#if studyStats.goal}
        <p class="legend"><span class="dash"></span>{t("stats.goalLine", { goal: shortDuration(studyStats.goal) })}</p>
      {/if}
    </section>

    <section class="card ranking">
      <div class="card-head">
        <h2>{t("stats.most")}</h2>
        <div class="filters">
          <div class="seg" role="radiogroup" aria-label={t("stats.most")}>
            <button role="radio" aria-checked={rankBy === "documents"} onclick={() => (rankBy = "documents")}>{t("stats.documents")}</button>
            <button role="radio" aria-checked={rankBy === "folders"} onclick={() => (rankBy = "folders")}>{t("stats.folders")}</button>
          </div>
          <select class="select" bind:value={rankRange} aria-label={t("stats.period")}>
            <option value="7">{t("stats.range7")}</option>
            <option value="30">{t("stats.range30")}</option>
            <option value="all">{t("stats.allTime")}</option>
          </select>
        </div>
      </div>
      {#if ranked.length}
        <ol>
          {#each ranked as row (row.key)}
            <li>
              <button onclick={() => openRanked(row.key)} disabled={rankBy === "folders" && !row.key} title={row.label}>
                <span class="name">{row.label}</span>
                <span class="track"><span class="fill" style:width="{(row.seconds / rankedMax) * 100}%"></span></span>
                <span class="value">{shortDuration(row.seconds)}</span>
              </button>
            </li>
          {/each}
        </ol>
      {:else}
        <p class="muted empty">{t("stats.nothingYet")}</p>
      {/if}
    </section>
  </main>
</div>

<style>
  .screen {
    height: 100%;
    display: flex;
    flex-direction: column;
    background: var(--bg);
  }
  .content {
    flex: 1;
    overflow: auto;
    padding: 28px max(32px, calc((100% - 1040px) / 2)) 48px;
    display: flex;
    flex-direction: column;
    gap: 20px;
  }
  h1 {
    margin: 0;
    font-size: 26px;
    font-weight: 650;
    letter-spacing: -0.02em;
  }
  h2 {
    margin: 0;
    font-size: 14px;
    font-weight: 600;
  }
  .muted {
    margin: 0;
    color: var(--text-muted);
    font-size: 12.5px;
  }
  .card {
    padding: 18px 20px;
    border-radius: var(--radius-l);
    background: var(--surface);
    border: 1px solid var(--hairline);
    box-shadow: var(--card-shadow);
    min-width: 0;
  }
  .top {
    display: grid;
    grid-template-columns: minmax(340px, 1.6fr) 1fr 1fr;
    gap: 20px;
  }
  @media (max-width: 980px) {
    .top {
      grid-template-columns: 1fr 1fr;
    }
    .today {
      grid-column: 1 / -1;
    }
  }
  .today {
    display: flex;
    align-items: center;
    gap: 22px;
  }
  .big {
    font-size: 24px;
    font-weight: 650;
    letter-spacing: -0.02em;
    font-variant-numeric: tabular-nums;
  }
  .today-side {
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 0;
  }
  .goal {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: 8px;
    font-size: 12.5px;
    color: var(--text-muted);
  }
  .goal > span:first-child {
    margin-right: 4px;
  }
  .goal-value {
    min-width: 52px;
    text-align: center;
    color: var(--text);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }
  .icon-btn {
    width: 26px;
    height: 26px;
    display: grid;
    place-items: center;
    border: 1px solid var(--hairline);
    border-radius: 13px;
    background: var(--field);
    color: var(--text);
  }
  .icon-btn:disabled {
    opacity: 0.4;
  }
  .streak,
  .totals {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .hero {
    margin: 4px 0 0;
    font-size: 40px;
    font-weight: 650;
    letter-spacing: -0.03em;
    line-height: 1;
    font-variant-numeric: tabular-nums;
  }
  .hero span {
    margin-left: 6px;
    font-size: 15px;
    font-weight: 500;
    color: var(--text-muted);
    letter-spacing: 0;
  }
  dl {
    margin: 2px 0 0;
    display: flex;
    flex-direction: column;
    gap: 9px;
  }
  dl div {
    display: flex;
    justify-content: space-between;
    gap: 12px;
  }
  dt {
    color: var(--text-muted);
  }
  dd {
    margin: 0;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }
  .card-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 14px;
  }
  .card-head > div:first-child {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .filters {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .seg {
    display: flex;
    gap: 2px;
    padding: 3px;
    border-radius: 9px;
    background: var(--segment);
  }
  .seg button {
    height: 26px;
    padding: 0 12px;
    border: none;
    border-radius: 7px;
    background: transparent;
    color: var(--text-soft);
    white-space: nowrap;
  }
  .seg button[aria-checked="true"] {
    background: var(--segment-on);
    color: var(--text);
    font-weight: 500;
    box-shadow: var(--segment-shadow);
  }
  .legend {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 10px 0 0;
    font-size: 12px;
    color: var(--text-muted);
  }
  .dash {
    width: 18px;
    border-top: 1.5px dashed var(--text-muted);
  }
  ol {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  ol button {
    width: 100%;
    display: grid;
    grid-template-columns: minmax(120px, 1.2fr) 2fr 64px;
    align-items: center;
    gap: 14px;
    padding: 7px 8px;
    border: none;
    border-radius: var(--radius-m);
    background: transparent;
    color: var(--text);
    text-align: left;
  }
  ol button:hover:not(:disabled) {
    background: var(--hover);
  }
  ol button:disabled {
    cursor: default;
  }
  .name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .track {
    height: 8px;
    border-radius: 4px;
    background: var(--track);
    overflow: hidden;
  }
  .fill {
    display: block;
    height: 100%;
    border-radius: 4px;
    background: var(--accent);
  }
  .value {
    text-align: right;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }
  .empty {
    padding: 8px 0;
  }
</style>
