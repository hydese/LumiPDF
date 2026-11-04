<script lang="ts">
  /** The home screen: continue reading, cloud drives, notebooks or formula sheets, and folders. */
  import { formatDuration, t, tn, type MessageKey } from "../i18n";
  import { formatShortcut } from "../platform/shortcuts";
  import { platform } from "../platform/window";
  import { weekTotal } from "../app/dates";
  import { library } from "../library/library.svelte";
  import { session } from "../reader/session.svelte";
  import type { CloudKind } from "../ipc/library";
  import TitleBar from "../ui/TitleBar.svelte";
  import AppMark from "../ui/AppMark.svelte";
  import Icon from "../ui/Icon.svelte";
  import BarActions from "../ui/BarActions.svelte";
  import DocCard from "../library/ui/DocCard.svelte";
  import ShelfItem from "../library/ui/ShelfItem.svelte";
  import SourceCard from "../library/ui/SourceCard.svelte";
  import MiniList from "../library/ui/MiniList.svelte";
  import NotebooksCard from "../library/ui/NotebooksCard.svelte";
  import FolderBrowser from "../library/ui/FolderBrowser.svelte";
  import { CLOUD_TONE } from "../library/ui/cards";
  import { settings } from "../settings/store.svelte";
  import { navigation } from "../app/navigation.svelte";

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
      {#if session.tabs.length}
        <button class="reading" title={t("tabs.backToReading", { count: session.tabs.length })} onclick={() => navigation.go("reader")}>
          {t("tabs.reading")}
          <span class="badge-count">{session.tabs.length}</span>
          <Icon name="forward" size={14} stroke={2} />
        </button>
      {/if}
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
    {:else if library.location}
      <section class="block browsing">
        <FolderBrowser folders={library.folders} />
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
          {#each library.clouds as cloud (cloud.path)}
            <SourceCard icon="cloud" tone={CLOUD_TONE[cloud.kind as CloudKind]} title={t(`cloud.${cloud.kind}` as MessageKey)} subtitle={tn("cloud.count", cloud.files.length)}>
              {#snippet action()}
                {#if cloud.files.length}<button class="btn small" onclick={() => library.browse(cloud.path)}>{t("cloud.showAll")}</button>{/if}
              {/snippet}
              {#if !cloud.available}
                <p class="card-note">{t("library.folderMissing")}</p>
              {:else if cloud.files.length}
                <MiniList files={cloud.files.slice(0, 5)} />
              {:else}
                <p class="card-note">{t("cloud.empty")}</p>
              {/if}
            </SourceCard>
          {:else}
            <SourceCard icon="cloud" tone="sky" title={t("cloud.title")}>
              {#snippet action()}
                <button class="btn small" onclick={() => navigation.openSettings("library")}>{t("cloud.more")}</button>
              {/snippet}
              {#if view.cloudSuggestions.length}
                <ul class="connect">
                  {#each view.cloudSuggestions as s (s.kind)}
                    <li>
                      <span class="connect-name">{t(`cloud.${s.kind}` as MessageKey)}<span>{t("cloud.found")}</span></span>
                      <button class="btn small primary" onclick={() => library.addFolder(s.kind)}>{t("cloud.connect")}</button>
                    </li>
                  {/each}
                </ul>
              {:else}
                <p class="card-note">{t("cloud.intro")}</p>
              {/if}
            </SourceCard>
          {/each}

          {#if settings.value.library.goodnotes}
            <NotebooksCard folder={library.goodnotes} />
          {:else}
            <SourceCard icon="note" tone="warm" title={t("sheets.title")} subtitle={t("sheets.soon")}>
              <p class="card-note">{t("sheets.text")}</p>
            </SourceCard>
          {/if}
        </div>
      {/if}

      {#if library.folders.length}
        <section class="block" aria-labelledby="folders">
          <h2 id="folders" class="visually-hidden">{t("library.folders")}</h2>
          <FolderBrowser folders={library.folders} />
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
  .reading {
    display: flex;
    align-items: center;
    gap: 6px;
    height: 28px;
    padding: 0 8px 0 12px;
    border: none;
    border-radius: 14px;
    background: var(--accent-soft);
    color: var(--accent-text);
    font-weight: 600;
    white-space: nowrap;
  }
  .reading:hover {
    filter: brightness(0.97);
  }
  .badge-count {
    min-width: 18px;
    height: 18px;
    padding: 0 5px;
    border-radius: 9px;
    background: var(--accent);
    color: var(--on-accent);
    font-size: 11px;
    display: grid;
    place-items: center;
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

  .sources {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
    gap: 20px;
  }
  .connect {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .connect li {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }
  .connect-name {
    display: flex;
    flex-direction: column;
    font-weight: 500;
  }
  .connect-name span {
    font-size: 11.5px;
    font-weight: 400;
    color: var(--ok);
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
