<script lang="ts">
  /** Outline, bookmarks and (with the annotation tools) notes for the open document. */
  import { t } from "../../i18n";
  import { formatShortcut } from "../../platform/shortcuts";
  import { platform } from "../../platform/window";
  import { settings } from "../../settings/store.svelte";
  import type { SidebarTab } from "../../settings/schema";
  import type { OutlineItem } from "../../viewer/ViewerController";
  import { session } from "../session.svelte";
  import OutlineTree from "./OutlineTree.svelte";
  import Icon from "../../ui/Icon.svelte";

  interface Props {
    outline: OutlineItem[];
    current: OutlineItem | null;
  }
  let { outline, current }: Props = $props();

  const tab = $derived(settings.value.reader.sidebarTab);
  const TABS: Array<{ id: SidebarTab; label: "reader.outline" | "reader.bookmarks" | "reader.notes" }> = [
    { id: "outline", label: "reader.outline" },
    { id: "bookmarks", label: "reader.bookmarks" },
    { id: "notes", label: "reader.notes" },
  ];
</script>

<aside class="doc-sidebar" aria-label={t("reader.sidebar")}>
  <div class="tabs" role="tablist">
    {#each TABS as item (item.id)}
      <button role="tab" aria-selected={tab === item.id} onclick={() => settings.update((s) => (s.reader.sidebarTab = item.id))}>{t(item.label)}</button>
    {/each}
  </div>

  <div class="body">
    {#if tab === "outline"}
      {#if outline.length}
        <nav aria-label={t("reader.outline")}>
          <OutlineTree items={outline} {current} onSelect={(item) => session.controller?.goToDestination(item.dest)} />
        </nav>
      {:else}
        <p class="empty">{t("reader.noOutline")}</p>
      {/if}
    {:else if tab === "bookmarks"}
      {#if session.bookmarks.length}
        <ul class="bookmarks">
          {#each session.bookmarks as page (page)}
            <li class:current={page === session.page}>
              <button class="go" onclick={() => session.controller?.goToPage(page)}>
                <Icon name="bookmark" size={14} />
                {t("reader.pageN", { page })}
              </button>
              <button class="remove" aria-label={t("reader.removeBookmark", { page })} onclick={() => session.toggleBookmark(page)}>
                <Icon name="close" size={12} stroke={2.2} />
              </button>
            </li>
          {/each}
        </ul>
      {:else}
        <p class="empty">{t("reader.noBookmarks", { shortcut: formatShortcut("mod+d", platform) })}</p>
      {/if}
    {:else}
      <p class="empty">{t("reader.notesSoon")}</p>
    {/if}
  </div>
</aside>

<style>
  .doc-sidebar {
    width: 264px;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: 14px 12px 0;
    background: var(--sidebar-bg, var(--bg));
    border-right: 1px solid var(--hairline-soft);
    min-height: 0;
  }
  .tabs {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 2px;
    padding: 3px;
    border-radius: 9px;
    background: var(--segment);
  }
  .tabs button {
    height: 26px;
    border: none;
    border-radius: 7px;
    background: transparent;
    color: var(--text-muted);
    font-size: 12px;
  }
  .tabs button[aria-selected="true"] {
    background: var(--segment-on);
    color: var(--text);
    font-weight: 500;
    box-shadow: var(--segment-shadow);
  }
  .body {
    flex: 1;
    overflow-y: auto;
    margin: 0 -4px;
    padding: 0 4px 16px;
  }
  .empty {
    margin: 8px;
    color: var(--text-muted);
    font-size: 12px;
    line-height: 1.5;
  }
  .bookmarks {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }
  .bookmarks li {
    display: flex;
    align-items: center;
    border-radius: 7px;
  }
  .bookmarks li:hover {
    background: var(--hover);
  }
  .bookmarks li.current {
    background: color-mix(in srgb, var(--accent) 26%, transparent);
  }
  .go {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 7px 8px;
    border: none;
    background: none;
    text-align: left;
    color: var(--text);
  }
  .go :global(svg) {
    color: var(--accent-text);
  }
  .remove {
    width: 26px;
    height: 26px;
    margin-right: 4px;
    border: none;
    border-radius: 6px;
    background: none;
    color: var(--text-muted);
    display: grid;
    place-items: center;
    opacity: 0;
  }
  .bookmarks li:hover .remove,
  .remove:focus-visible {
    opacity: 1;
  }
  .remove:hover {
    background: var(--pressed);
    color: var(--text);
  }
</style>
