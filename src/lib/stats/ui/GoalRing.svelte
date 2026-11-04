<script lang="ts">
  /** Progress ring towards the daily goal, with today's time in the middle. */
  import type { Snippet } from "svelte";

  interface Props {
    /** 0…1+ (past 1 the ring is full and turns green). */
    progress: number;
    size?: number;
    stroke?: number;
    children?: Snippet;
  }
  let { progress, size = 120, stroke = 10, children }: Props = $props();
  const r = $derived((size - stroke) / 2);
  const c = $derived(2 * Math.PI * r);
  const shown = $derived(Math.min(1, Math.max(0, progress)));
</script>

<div class="ring" style:width="{size}px" style:height="{size}px">
  <svg width={size} height={size} viewBox="0 0 {size} {size}" aria-hidden="true">
    <circle cx={size / 2} cy={size / 2} {r} fill="none" stroke="var(--track)" stroke-width={stroke} />
    {#if shown > 0}
      <circle
        class:done={progress >= 1}
        cx={size / 2}
        cy={size / 2}
        {r}
        fill="none"
        stroke-width={stroke}
        stroke-linecap="round"
        stroke-dasharray="{c * shown} {c}"
        transform="rotate(-90 {size / 2} {size / 2})"
      />
    {/if}
  </svg>
  <div class="center">{@render children?.()}</div>
</div>

<style>
  .ring {
    position: relative;
    flex-shrink: 0;
  }
  svg circle:last-child:not(:first-child) {
    stroke: var(--accent);
    transition: stroke-dasharray 0.4s ease;
  }
  svg circle.done {
    stroke: var(--ok);
  }
  .center {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
  }
</style>
