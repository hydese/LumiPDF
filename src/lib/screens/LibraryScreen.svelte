<script lang="ts">
  /** The home screen: continue reading, iCloud Drive, GoodNotes backups and folders. */
  import { formatDuration, t, tn } from "../i18n";
  import { formatShortcut } from "../platform/shortcuts";
  import { platform } from "../platform/window";
  import { weekTotal } from "../app/dates";
  import { library } from "../library/library.svelte";
  import { titleOf } from "../library/titles";
  import { session } from "../reader/session.svelte";
  import type { FolderView } from "../ipc/library";
  import TitleBar from "../ui/TitleBar.svelte";
  import AppMark from "../ui/AppMark.svelte";
  import Icon from "../ui/Icon.svelte";
  import BarActions from "../ui/BarActions.svelte";
  import DocCard from "../library/ui/DocCard.svelte";
  import ShelfItem from "../library/ui/ShelfItem.svelte";
  import Thumb from "../library/ui/Thumb.svelte";

  interface Props {
    searchInput?: HTMLInputElement | null;
    barActions?: BarActions | null;
  }
  let { searchInput = $bindable(null), barActions = $bindable(null) }: Props = $props();

  const openShortcut = formatShortcut("mod+o", platform);
  const searchShortcut = formatShortcut("mod+k", platform);
  const view = $derived(library.view);
  const week = $derived(weekTotal(view?.studyDays ?? {}, new Date()));
  const isEmpty = $derived(view !== null && view.folders.length === 0 && library.continueReading.length === 0);
  const summary = $derived(
    [
      `${tn("library.summary.docs", library.documentCount)}${library.folders.length ? " " + tn("library.summary.folders", library.folders.length) : ""}`,
      week >= 60 ? t("library.summary.week", { time: formatDuration(week) }) : "",
    ]
      .filter(Boolean)
      .join(" · "),
  );

  function progressOf(path: string): number | undefined {
    const d = library.doc(path);
    return d && d.pages ? Math.round((d.page / d.pages) * 100) : undefined;
  }

  function metaOf(path: string, where: string): string | undefined {
    const d = library.doc(path);
    if (d && d.pages) return t("library.pageOf", { page: d.page, pages: d.pages });
    return where || undefined;
  }

  function onSearchKey(e: KeyboardEvent) {
    if (e.key === "Escape") {
      library.query = "";
      (e.currentTarget as HTMLInputElement).blur();
    } else if (e.key === "Enter" && library.searchResults[0]) {
      void session.openFromLibrary(library.searchResults[0].file.path);
    }
  }
</script>

{#snippet sourceCard(folder: FolderView | null, kind: "icloud" | "goodnotes")}
  <section class="source" aria-labelledby="source-{kind}">
    <div class="source-head">
      <span class="badge {kind}"><Icon name={kind === "icloud" ? "cloud" : "notebook"} size={16} stroke={1.9} /></span>
      <div class="source-title">
        <h2 id="source-{kind}">{kind === "icloud" ? t("icloud.title") : t("goodnotes.title")}</h2>
        <span>
          {#if folder}
            {kind === "icloud" ? tn("icloud.count", folder.files.length) : tn("goodnotes.count", folder.files.length)}
          {:else if kind === "icloud"}
            {view?.icloudSuggestion ? t("icloud.found") : t("icloud.missing")}
          {:else}
            {t("goodnotes.readOnly")}
          {/if}
        </span>
      </div>
      {#if !folder}
        {#if kind === "icloud"}
          {#if view?.icloudSuggestion}
            <button class="btn small" onclick={() => library.addFolder("icloud")}>{t("icloud.add")}</button>
          {:else}
            <button class="btn small" onclick={() => library.addFolder("icloud")}>{t("icloud.choose")}</button>
          {/if}
        {:else}
          <button class="btn small" onclick={() => library.addFolder("goodnotes")}>{t("goodnotes.choose")}</button>
        {/if}
      {/if}
    </div>
    {#if folder}
      {#if !folder.available}
        <p class="source-note">{t("library.folderMissing")}</p>
      {:else if folder.files.length === 0}
        <p class="source-note">{t("library.folderEmpty")}</p>
      {:else}
        <ul class="source-list">
          {#each folder.files.slice(0, 5) as file (file.path)}
            <li>
              <button onclick={() => session.openFromLibrary(file.path)} title={file.path}>
                <span class="mini-page"><Thumb {file} height={28} /></span>
                <span class="mini-title">{titleOf(file.name)}</span>
                {#if file.cloudOnly}
                  <span class="mini-meta" title={t("library.cloudOnly")}><Icon name="cloud" size={13} /></span>
                {:else}
                  <span class="mini-meta">{metaOf(file.path, "") ?? ""}</span>
                {/if}
              </button>
            </li>
          {/each}
        </ul>
      {/if}
    {:else if kind === "goodnotes"}
      <p class="source-note">{t("goodnotes.setup")}</p>
    {/if}
  </section>
{/snippet}

<div class="screen">
  <TitleBar>
    {#snippet left()}
      <span class="brand" data-tauri-drag-region><AppMark /><span data-tauri-drag-region>{t("app.name")}</span></span>
      <nav class="segmented" aria-label={t("nav.library")}>
        <button class="on" aria-current="page"><Icon name="library" size={15} />{t("nav.library")}</button>
        <button title={t("nav.openTitle", { shortcut: openShortcut })} onclick={() => session.openWithDialog()}>
          <Icon name="open" size={15} />{t("nav.open")}
        </button>
      </nav>
    {/snippet}
    {#snippet center()}
      <label class="search">
        <Icon name="search" size={15} />
        <span class="visually-hidden">{t("library.search")}</span>
        <input type="search" placeholder={t("library.search")} bind:value={library.query} bind:this={searchInput} onkeydown={onSearchKey} spellcheck="false" />
        {#if !library.query}<kbd>{searchShortcut}</kbd>{/if}
      </label>
    {/snippet}
    {#snippet right()}
      <BarActions bind:this={barActions} />
    {/snippet}
  </TitleBar>

  <main class="content">
    {#if library.query.trim()}
      <section class="block" aria-live="polite">
        <h2 class="section-title">
          {library.searchResults.length
            ? tn("library.searchResults", library.searchResults.length, { query: library.query.trim() })
            : t("library.searchNone", { query: library.query.trim() })}
        </h2>
        <div class="shelf">
          {#each library.searchResults as hit (hit.file.path)}
            <ShelfItem file={hit.file} meta={metaOf(hit.file.path, hit.where)} progress={progressOf(hit.file.path)} onOpen={() => session.openFromLibrary(hit.file.path)} />
          {/each}
        </div>
      </section>
    {:else}
      <div class="heading">
        <div>
          <h1>{t("library.title")}</h1>
          {#if !isEmpty && view}<p>{summary}</p>{/if}
        </div>
        <button class="btn" onclick={() => library.addFolder("folder")}><Icon name="plus" size={14} stroke={2} />{t("library.addFolder")}</button>
      </div>

      {#if library.error}
        <p class="error" role="alert">{t("library.error", { reason: library.error })}</p>
      {/if}
      {#if session.error}
        <p class="error" role="alert">{session.error}</p>
      {/if}

      {#if isEmpty}
        <section class="empty">
          <span class="empty-icon"><Icon name="library" size={28} stroke={1.5} /></span>
          <h2>{t("library.emptyTitle")}</h2>
          <p>{t("library.emptyText")}</p>
          <div class="empty-actions">
            <button class="btn primary" onclick={() => session.openWithDialog()}><Icon name="open" size={15} />{t("nav.open")}</button>
            <button class="btn" onclick={() => library.addFolder("folder")}><Icon name="plus" size={14} stroke={2} />{t("library.addFolder")}</button>
          </div>
          <p class="hint">{t("open.dropHint")}</p>
        </section>
      {/if}

      {#if library.continueReading.length}
        <section class="block" aria-labelledby="continue">
          <h2 id="continue" class="section-title">{t("library.continue")}</h2>
          <div class="cards">
            {#each library.continueReading as doc (doc.path)}
              <DocCard {doc} onOpen={() => session.openFromLibrary(doc.path)} onForget={() => library.forget(doc.path)} />
            {/each}
          </div>
        </section>
      {/if}

      {#if view}
        <div class="sources">
          {@render sourceCard(library.icloud, "icloud")}
          {@render sourceCard(library.goodnotes, "goodnotes")}
        </div>
      {/if}

      {#if library.folders.length}
        <section class="block" aria-labelledby="folders">
          <div class="folders-head">
            <h2 id="folders" class="section-title">{t("library.folders")}</h2>
            <div class="chips" role="tablist" aria-label={t("library.folders")}>
              <button role="tab" aria-selected={library.folderFilter === "all"} onclick={() => (library.folderFilter = "all")}>{t("library.all")}</button>
              {#each library.folders as folder (folder.path)}
                <button role="tab" aria-selected={library.folderFilter === folder.path} title={folder.path} onclick={() => (library.folderFilter = folder.path)}>
                  {folder.name}
                </button>
              {/each}
            </div>
          </div>
          {#each library.folders.filter((f) => library.folderFilter === f.path || library.folderFilter === "all") as folder (folder.path)}
            {#if !folder.available}
              <p class="note">{folder.name}: {t("library.folderMissing")}</p>
            {:else if folder.truncated}
              <p class="note">{folder.name}: {t("library.folderTruncated", { count: folder.files.length })}</p>
            {/if}
          {/each}
          {#if library.shelf.length}
            <div class="shelf">
              {#each library.shelf as file (file.path)}
                <ShelfItem {file} meta={metaOf(file.path, "")} progress={progressOf(file.path)} onOpen={() => session.openFromLibrary(file.path)} />
              {/each}
            </div>
          {:else}
            <p class="note">{t("library.folderEmpty")}</p>
          {/if}
        </section>
      {/if}
    {/if}
  </main>
</div>

<style>
  .screen {
    height: 100%;
    display: flex;
    flex-direction: column;
    background: var(--bg);
  }
  .brand {
    display: flex;
    align-items: center;
    gap: 8px;
    font-weight: 600;
    font-size: 14px;
    letter-spacing: -0.01em;
    margin-right: 8px;
    white-space: nowrap;
  }
  .segmented {
    display: flex;
    gap: 2px;
    padding: 3px;
    border-radius: 9px;
    background: var(--segment);
  }
  .segmented button {
    display: flex;
    align-items: center;
    gap: 6px;
    height: 28px;
    padding: 0 12px;
    border: none;
    border-radius: 7px;
    background: transparent;
    color: var(--text-soft);
    white-space: nowrap;
  }
  .segmented button:hover:not(.on) {
    color: var(--text);
  }
  .segmented .on {
    background: var(--segment-on);
    color: var(--text);
    font-weight: 500;
    box-shadow: var(--segment-shadow);
  }
  .search {
    display: flex;
    align-items: center;
    gap: 8px;
    width: min(380px, 32vw);
    height: 32px;
    padding: 0 12px;
    border-radius: 9px;
    background: var(--field);
    color: var(--text-muted);
    border: 1px solid transparent;
    transition: border-color var(--fast) var(--ease), background var(--fast) var(--ease);
  }
  .search:focus-within {
    border-color: var(--accent);
    background: var(--surface);
  }
  .search input {
    flex: 1;
    min-width: 0;
    border: none;
    outline: none;
    background: transparent;
    color: var(--text);
  }
  .search input::-webkit-search-cancel-button {
    filter: grayscale(1);
  }
  kbd {
    font-family: inherit;
    font-size: 11px;
    padding: 1px 6px;
    border-radius: 5px;
    border: 1px solid var(--hairline);
    white-space: nowrap;
  }

  .content {
    flex: 1;
    overflow-y: auto;
    padding: 36px max(40px, calc((100% - 1100px) / 2)) 48px;
    display: flex;
    flex-direction: column;
    gap: 36px;
  }
  .heading {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 16px;
    flex-wrap: wrap;
  }
  h1 {
    margin: 0;
    font-family: var(--font-display);
    font-size: 26px;
    font-weight: 600;
    letter-spacing: -0.02em;
  }
  .heading p {
    margin: 4px 0 0;
    color: var(--text-muted);
  }
  .block {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .section-title {
    margin: 0;
    font-size: 15px;
    font-weight: 600;
  }
  .cards {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
    gap: 20px;
  }
  .shelf {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 22px 18px;
  }
  .error {
    margin: 0;
    padding: 10px 14px;
    border-radius: var(--radius-m);
    background: color-mix(in srgb, var(--danger) 12%, transparent);
    color: var(--danger);
  }
  .note {
    margin: 0;
    color: var(--text-muted);
    font-size: 12px;
  }

  .sources {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
    gap: 20px;
  }
  .source {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 16px;
    border-radius: var(--radius-l);
    background: var(--surface);
    border: 1px solid var(--hairline);
    box-shadow: var(--card-shadow);
  }
  .source-head {
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
  .badge.icloud {
    background: var(--accent-soft);
    color: var(--accent-text);
  }
  .badge.goodnotes {
    background: var(--warm-soft);
    color: var(--warm-text);
  }
  .source-title {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }
  .source-title h2 {
    margin: 0;
    font-size: 14px;
    font-weight: 600;
  }
  .source-title span {
    font-size: 12px;
    color: var(--text-muted);
  }
  .source-note {
    margin: 0;
    font-size: 12px;
    color: var(--text-muted);
    line-height: 1.5;
  }
  .source-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .source-list button {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 7px 8px;
    border: none;
    border-radius: 7px;
    background: transparent;
    text-align: left;
  }
  .source-list button:hover {
    background: var(--hover);
  }
  .mini-page {
    width: 24px;
    height: 28px;
    flex-shrink: 0;
    display: grid;
    place-items: center;
  }
  .mini-page :global(.placeholder) {
    padding: 0;
    gap: 0;
  }
  .mini-page :global(.placeholder span) {
    display: none;
  }
  .mini-title {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .mini-meta {
    font-size: 11.5px;
    color: var(--text-muted);
    white-space: nowrap;
  }

  .folders-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
  }
  .chips {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }
  .chips button {
    height: 28px;
    padding: 0 12px;
    border-radius: 14px;
    border: 1px solid var(--hairline);
    background: transparent;
    color: var(--text-soft);
    font-size: 12px;
    font-weight: 500;
    max-width: 220px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .chips button[aria-selected="true"] {
    background: var(--text);
    border-color: var(--text);
    color: var(--bg);
  }

  .empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    gap: 10px;
    padding: 48px 24px;
    border-radius: var(--radius-xl);
    border: 1px dashed var(--hairline);
  }
  .empty-icon {
    width: 56px;
    height: 56px;
    border-radius: 14px;
    background: var(--accent-soft);
    color: var(--accent-text);
    display: grid;
    place-items: center;
    margin-bottom: 6px;
  }
  .empty h2 {
    margin: 0;
    font-size: 18px;
    font-weight: 600;
  }
  .empty p {
    margin: 0;
    max-width: 440px;
    color: var(--text-muted);
    line-height: 1.5;
  }
  .empty-actions {
    display: flex;
    gap: 8px;
    margin-top: 8px;
  }
  .empty .hint {
    font-size: 12px;
    color: var(--text-faint);
  }
</style>
