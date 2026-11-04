<script lang="ts">
  /** Sidebar › Notes: every annotation in the document, by page. Click to jump to it. */
  import { t, tn, type MessageKey } from "../../i18n";
  import Icon, { type IconName } from "../../ui/Icon.svelte";
  import type { Annotation } from "../model";
  import { annotations } from "../store.svelte";
  import { deepen } from "../layer";

  interface Props {
    onGo: (a: Annotation) => void;
  }
  let { onGo }: Props = $props();

  const ICON: Record<Annotation["type"], IconName> = {
    ink: "pen",
    marker: "highlighter",
    highlight: "highlighter",
    underline: "underline",
    strike: "strike",
    note: "sticky",
  };

  const sorted = $derived(
    [...annotations.list].sort((a, b) => a.page - b.page || topOf(b) - topOf(a)),
  );
  const pages = $derived([...new Set(sorted.map((a) => a.page))]);

  function topOf(a: Annotation): number {
    if (a.type === "note") return a.y;
    if (a.type === "ink" || a.type === "marker") return a.points[1] ?? 0;
    return a.rects[0]?.[3] ?? 0;
  }
  function textOf(a: Annotation): string {
    if (a.type === "note") return a.text || t("notes.emptyNote");
    if (a.type === "ink" || a.type === "marker") return t(`notes.type.${a.type}` as MessageKey);
    return a.text;
  }
</script>

{#if sorted.length}
  <p class="count">{tn("notes.count", sorted.length)}</p>
  {#each pages as page (page)}
    <h4>{t("reader.pageN", { page })}</h4>
    <ul>
      {#each sorted.filter((a) => a.page === page) as a (a.id)}
        <li>
          <button onclick={() => onGo(a)} style:--c={a.type === "underline" || a.type === "strike" ? deepen(a.color) : a.color}>
            <span class="icon" class:fill={a.type === "highlight" || a.type === "marker" || a.type === "note"}><Icon name={ICON[a.type]} size={13} stroke={2} /></span>
            <span class="body">
              <span class="text" class:quote={a.type === "highlight" || a.type === "underline" || a.type === "strike"}>{textOf(a)}</span>
              {#if "note" in a && a.note}<span class="comment">{a.note}</span>{/if}
            </span>
          </button>
        </li>
      {/each}
    </ul>
  {/each}
{:else}
  <p class="empty">{t("notes.empty")}</p>
{/if}

<style>
  .count {
    margin: 2px 8px 6px;
    font-size: 11.5px;
    color: var(--text-faint);
  }
  h4 {
    margin: 12px 8px 4px;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--text-faint);
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  button {
    width: 100%;
    display: flex;
    gap: 10px;
    padding: 7px 8px;
    border: none;
    border-radius: 8px;
    background: none;
    text-align: left;
    color: var(--text);
  }
  button:hover {
    background: var(--hover);
  }
  .icon {
    width: 22px;
    height: 22px;
    flex-shrink: 0;
    border-radius: 6px;
    display: grid;
    place-items: center;
    color: var(--c);
    background: color-mix(in srgb, var(--c) 14%, transparent);
  }
  .icon.fill {
    color: #3a3000;
    background: var(--c);
  }
  .body {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .text {
    font-size: 12.5px;
    line-height: 1.4;
    display: -webkit-box;
    -webkit-line-clamp: 3;
    line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .text.quote {
    font-family: Georgia, "Times New Roman", serif;
    color: var(--text-soft);
  }
  .comment {
    font-size: 12px;
    color: var(--text-muted);
    padding-left: 8px;
    border-left: 2px solid var(--c);
  }
  .empty {
    margin: 8px;
    color: var(--text-muted);
    font-size: 12px;
    line-height: 1.5;
  }
</style>
