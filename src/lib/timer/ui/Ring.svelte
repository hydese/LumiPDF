<script lang="ts">
  import type { Snippet } from "svelte";

  interface Props {
    /** 0..1, or null for no progress arc. */
    progress: number | null;
    colour?: string;
    size?: number;
    label: string;
    children: Snippet;
  }
  let { progress, colour = "var(--accent)", size = 176, label, children }: Props = $props();
  const R = 82;
  const C = 2 * Math.PI * R;
</script>

<div class="ring" role="timer" aria-label={label} style:width="{size}px" style:height="{size}px">
  <svg width={size} height={size} viewBox="0 0 190 190" aria-hidden="true">
    <circle cx="95" cy="95" r={R} fill="none" stroke="var(--track)" stroke-width="10" />
    {#if progress !== null}
      <circle cx="95" cy="95" r={R} fill="none" stroke={colour} stroke-width="10" stroke-linecap="round" stroke-dasharray="{C * progress} {C}" transform="rotate(-90 95 95)" />
    {/if}
  </svg>
  <div class="center">{@render children()}</div>
</div>

<style>
  .ring {
    position: relative;
    flex-shrink: 0;
  }
  circle {
    transition: stroke-dasharray 250ms linear;
  }
  .center {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
  }
  .center :global(.big) {
    font-family: var(--font-display);
    font-size: 38px;
    font-weight: 600;
    letter-spacing: -0.02em;
    font-variant-numeric: tabular-nums;
    line-height: 1.1;
  }
  .center :global(.small) {
    font-size: 12px;
    color: var(--text-muted);
  }
</style>
