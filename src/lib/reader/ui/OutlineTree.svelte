<script lang="ts">
  import type { OutlineItem } from "../../viewer/ViewerController";
  import OutlineTree from "./OutlineTree.svelte";

  interface Props {
    items: OutlineItem[];
    current: OutlineItem | null;
    onSelect: (item: OutlineItem) => void;
  }
  let { items, current, onSelect }: Props = $props();
</script>

<ul>
  {#each items as item, i (i)}
    <li>
      <button
        class="entry"
        class:top={item.depth === 0}
        class:current={item === current}
        aria-current={item === current ? "location" : undefined}
        style:padding-left="{8 + Math.min(item.depth, 4) * 14}px"
        onclick={() => onSelect(item)}
        title={item.title}
      >
        <span class="title">{item.title}</span>
        {#if item.page}<span class="page">{item.page}</span>{/if}
      </button>
      {#if item.children.length}
        <OutlineTree items={item.children} {current} {onSelect} />
      {/if}
    </li>
  {/each}
</ul>

<style>
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }
  .entry {
    width: 100%;
    display: flex;
    align-items: baseline;
    gap: 8px;
    padding: 6px 8px;
    border: none;
    border-radius: 7px;
    background: transparent;
    color: var(--text-soft);
    text-align: left;
  }
  .entry.top {
    color: var(--text);
    font-weight: 500;
  }
  .entry:hover {
    background: var(--hover);
  }
  .entry.current {
    background: color-mix(in srgb, var(--accent) 26%, transparent);
    color: var(--text);
  }
  .title {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .page {
    font-size: 11px;
    color: var(--text-faint);
    font-variant-numeric: tabular-nums;
  }
</style>
