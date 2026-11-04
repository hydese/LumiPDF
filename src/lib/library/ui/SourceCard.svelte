<script lang="ts">
  /** A card on the Library: a coloured badge, a title line, an optional action and content. */
  import type { Snippet } from "svelte";
  import Icon, { type IconName } from "../../ui/Icon.svelte";

  interface Props {
    icon: IconName;
    tone: "blue" | "sky" | "green" | "amber" | "violet" | "warm";
    title: string;
    subtitle?: string;
    action?: Snippet;
    children?: Snippet;
  }
  let { icon, tone, title, subtitle, action, children }: Props = $props();
  const id = `card-${Math.random().toString(36).slice(2, 9)}`;
</script>

<section class="card" aria-labelledby={id}>
  <div class="head">
    <span class="badge {tone}"><Icon name={icon} size={16} stroke={1.9} /></span>
    <div class="titles">
      <h2 {id}>{title}</h2>
      {#if subtitle}<span>{subtitle}</span>{/if}
    </div>
    {@render action?.()}
  </div>
  {@render children?.()}
</section>

<style>
  .card {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 16px;
    border-radius: var(--radius-l);
    background: var(--surface);
    border: 1px solid var(--hairline);
    box-shadow: var(--card-shadow);
    min-width: 0;
  }
  .head {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .badge {
    width: 30px;
    height: 30px;
    border-radius: var(--radius-m);
    display: grid;
    place-items: center;
    flex-shrink: 0;
  }
  .blue {
    background: var(--accent-soft);
    color: var(--accent-text);
  }
  .sky {
    background: color-mix(in srgb, #2f9be8 18%, transparent);
    color: color-mix(in srgb, #2f9be8 80%, var(--text));
  }
  .green {
    background: var(--green-soft);
    color: var(--green-text);
  }
  .amber,
  .warm {
    background: var(--warm-soft);
    color: var(--warm-text);
  }
  .violet {
    background: color-mix(in srgb, #7a5af5 18%, transparent);
    color: color-mix(in srgb, #7a5af5 80%, var(--text));
  }
  .titles {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }
  h2 {
    margin: 0;
    font-size: 14px;
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .titles span {
    font-size: 12px;
    color: var(--text-muted);
  }
  .card :global(.card-note) {
    margin: 0;
    font-size: 12px;
    color: var(--text-muted);
    line-height: 1.5;
  }
</style>
