<script lang="ts">
  import { t } from "../i18n";
  import type { ViewerState } from "../viewer/ViewerController";

  interface Props {
    view: ViewerState | null;
    openShortcut: string;
    onOpen: () => void;
    onPage: (page: number) => void;
    onZoomIn: () => void;
    onZoomOut: () => void;
    onFitWidth: () => void;
    onFind: (query: string, previous: boolean) => void;
    onFindClear: () => void;
    findInput?: HTMLInputElement | null;
  }

  let {
    view,
    openShortcut,
    onOpen,
    onPage,
    onZoomIn,
    onZoomOut,
    onFitWidth,
    onFind,
    onFindClear,
    findInput = $bindable(null),
  }: Props = $props();

  let query = $state("");

  function pageInput(event: Event) {
    const value = Number((event.currentTarget as HTMLInputElement).value);
    if (Number.isFinite(value)) onPage(value);
  }

  function findKey(event: KeyboardEvent) {
    if (event.key === "Enter" && query.trim()) onFind(query, event.shiftKey);
    if (event.key === "Escape") {
      query = "";
      onFindClear();
      findInput?.blur();
    }
  }
</script>

<header class="toolbar">
  <button onclick={onOpen} title={t("open.title", { shortcut: openShortcut })}>{t("open.button")}</button>

  {#if view && view.pages > 0}
    <div class="group">
      <button onclick={() => onPage(view.page - 1)} disabled={view.page <= 1} aria-label={t("nav.previous")}>‹</button>
      <input class="page" type="number" min="1" max={view.pages} value={view.page} onchange={pageInput} aria-label={t("nav.page")} />
      <span class="muted">{t("nav.of", { pages: view.pages })}</span>
      <button onclick={() => onPage(view.page + 1)} disabled={view.page >= view.pages} aria-label={t("nav.next")}>›</button>
    </div>

    <div class="group">
      <button onclick={onZoomOut} aria-label={t("zoom.out")}>−</button>
      <span class="zoom">{Math.round(view.scale * 100)}%</span>
      <button onclick={onZoomIn} aria-label={t("zoom.in")}>+</button>
      <button onclick={onFitWidth}>{t("zoom.fitWidth")}</button>
    </div>

    <div class="group find">
      <input type="search" placeholder={t("find.placeholder")} bind:value={query} bind:this={findInput} onkeydown={findKey} />
      {#if view.findMatches}
        <span class="muted">
          {view.findMatches.total > 0
            ? t("find.count", { current: view.findMatches.current, total: view.findMatches.total })
            : t("find.none")}
        </span>
      {/if}
    </div>
  {/if}
</header>

<style>
  .toolbar {
    height: 44px;
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: 0 var(--space-3);
    border-bottom: 1px solid var(--border);
    background: var(--bg);
    font-size: 13px;
  }
  .group {
    display: flex;
    align-items: center;
    gap: var(--space-1);
  }
  .find {
    margin-left: auto;
  }
  .page {
    width: 52px;
    text-align: center;
  }
  .zoom {
    min-width: 44px;
    text-align: center;
    font-variant-numeric: tabular-nums;
  }
  .muted {
    color: var(--text-muted);
  }
</style>
