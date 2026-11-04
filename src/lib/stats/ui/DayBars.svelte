<script lang="ts">
  /** Study time per day as bars, with the daily goal as a dashed line and a tooltip per bar. */
  import { shortDuration, type DayTotal } from "../stats";

  interface Props {
    days: DayTotal[];
    /** Goal in seconds (0 = none). */
    goal?: number;
    height?: number;
    /** Small version for the Library card: no axis, no labels. */
    compact?: boolean;
    locale?: string;
  }
  let { days, goal = 0, height = 180, compact = false, locale }: Props = $props();

  let width = $state(0);
  let hover = $state<number | null>(null);

  const top = $derived(compact ? 2 : 12);
  const bottom = $derived(compact ? 0 : 22);
  const left = $derived(compact ? 0 : 36);
  const plotH = $derived(Math.max(1, height - top - bottom));
  const plotW = $derived(Math.max(1, width - left));
  const max = $derived(Math.max(goal, ...days.map((d) => d.seconds), 3600));
  // Axis in whole hours.
  const hours = $derived(Math.ceil(max / 3600));
  const scaleMax = $derived(hours * 3600);
  const ticks = $derived(hours <= 4 ? Array.from({ length: hours + 1 }, (_, i) => i) : [0, Math.round(hours / 2), hours]);
  const slot = $derived(plotW / Math.max(1, days.length));
  const gap = $derived(Math.max(2, Math.min(10, slot * 0.28)));
  const barW = $derived(Math.max(2, Math.min(slot - gap, compact ? 22 : 48)));
  const y = (seconds: number) => top + plotH - (seconds / scaleMax) * plotH;

  const weekday = $derived(new Intl.DateTimeFormat(locale, { weekday: "short" }));
  const dayMonth = $derived(new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }));
  const full = $derived(new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "long" }));
  /** Every label for a week, a few for a month. */
  const labelEvery = $derived(days.length <= 7 ? 1 : days.length <= 14 ? 2 : 5);

  function barPath(x: number, h: number, w: number): string {
    if (h <= 0) return "";
    const r = Math.min(4, w / 2, h);
    const yTop = top + plotH - h;
    const yBase = top + plotH;
    return `M${x},${yBase} L${x},${yTop + r} Q${x},${yTop} ${x + r},${yTop} L${x + w - r},${yTop} Q${x + w},${yTop} ${x + w},${yTop + r} L${x + w},${yBase} Z`;
  }
</script>

<div class="bars" class:compact bind:clientWidth={width} style:height="{height}px" role="img" aria-label={days.map((d) => `${full.format(d.date)}: ${shortDuration(d.seconds)}`).join(", ")}>
  {#if width > 0}
    <svg {width} {height}>
      {#if !compact}
        {#each ticks as h (h)}
          <line class="grid" x1={left} x2={width} y1={y(h * 3600)} y2={y(h * 3600)} />
          <text class="axis" x={left - 8} y={y(h * 3600) + 4} text-anchor="end">{h}h</text>
        {/each}
      {/if}
      {#each days as d, i (d.day)}
        {@const x = left + i * slot + (slot - barW) / 2}
        {@const h = (d.seconds / scaleMax) * plotH}
        <path class="bar" class:today={i === days.length - 1} class:dim={hover !== null && hover !== i} class:hovered={hover === i} d={barPath(x, h > 0 && h < 2 ? 2 : h, barW)} />
        {#if !compact && i % labelEvery === (days.length - 1) % labelEvery}
          <text class="axis" x={x + barW / 2} y={height - 6} text-anchor="middle">{days.length <= 7 ? weekday.format(d.date) : dayMonth.format(d.date)}</text>
        {/if}
        <!-- Hit target: the whole column, taller than the bar. -->
        <rect
          class="hit"
          x={left + i * slot}
          y={top}
          width={slot}
          height={plotH}
          role="presentation"
          onpointerenter={() => (hover = i)}
          onpointerleave={() => (hover = null)}
        />
      {/each}
      {#if goal > 0}
        <line class="goal" x1={left} x2={width} y1={y(goal)} y2={y(goal)} />
      {/if}
    </svg>
    {#if hover !== null && !compact}
      {@const d = days[hover]!}
      {@const x = left + hover * slot + slot / 2}
      <div class="tip" style:left="{Math.min(Math.max(x, 70), width - 70)}px" style:top="{Math.max(0, y(d.seconds) - 8)}px">
        <strong>{d.seconds >= 60 ? shortDuration(d.seconds) : "0m"}</strong>
        <span>{full.format(d.date)}</span>
      </div>
    {/if}
  {/if}
</div>

<style>
  .bars {
    position: relative;
    width: 100%;
  }
  svg {
    display: block;
    overflow: visible;
  }
  .grid {
    stroke: var(--hairline);
    stroke-width: 1;
  }
  .axis {
    fill: var(--text-faint);
    font-size: 11px;
    font-variant-numeric: tabular-nums;
  }
  .bar {
    fill: var(--accent);
    opacity: 0.6;
    transition: opacity 0.12s;
  }
  .bar.today,
  .bar.hovered {
    opacity: 1;
  }
  .bar.dim {
    opacity: 0.25;
  }
  .goal {
    stroke: var(--text-muted);
    stroke-width: 1.2;
    stroke-dasharray: 4 4;
    opacity: 0.7;
  }
  .hit {
    fill: transparent;
  }
  .tip {
    position: absolute;
    transform: translate(-50%, -100%);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1px;
    padding: 6px 10px;
    border-radius: 8px;
    background: var(--surface-raised);
    box-shadow: var(--pop-shadow);
    white-space: nowrap;
    pointer-events: none;
    font-size: 12px;
    color: var(--text-muted);
  }
  .tip strong {
    font-size: 13px;
    color: var(--text);
    font-variant-numeric: tabular-nums;
  }
</style>
