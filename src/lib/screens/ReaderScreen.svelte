<script lang="ts">
  /**
   * The reader. While pages are shown dark, the whole reader turns dark too, so no bright
   * toolbar glares next to a dark page.
   */
  import { t } from "../i18n";
  import { formatShortcut } from "../platform/shortcuts";
  import { platform } from "../platform/window";
  import { settings } from "../settings/store.svelte";
  import { readingMode } from "../dark/readingMode.svelte";
  import { session } from "../reader/session.svelte";
  import { openExternal } from "../ipc/system";
  import { readOutline, type OutlineItem } from "../viewer/ViewerController";
  import PdfView from "../viewer/PdfView.svelte";
  import TitleBar from "../ui/TitleBar.svelte";
  import BackButton from "../ui/BackButton.svelte";
  import IconButton from "../ui/IconButton.svelte";
  import BarActions from "../ui/BarActions.svelte";
  import Sidebar from "../reader/ui/Sidebar.svelte";
  import PagePill from "../reader/ui/PagePill.svelte";
  import FindBar from "../reader/ui/FindBar.svelte";
  import TabStrip from "../reader/ui/TabStrip.svelte";
  import { navigation } from "../app/navigation.svelte";

  interface Props {
    findOpen?: boolean;
    findInput?: HTMLInputElement | null;
    barActions?: BarActions | null;
  }
  let { findOpen = $bindable(false), findInput = $bindable(null), barActions = $bindable(null) }: Props = $props();

  let outline = $state<OutlineItem[]>([]);
  const doc = $derived(session.current);
  const sidebarOpen = $derived(settings.value.reader.sidebarOpen);

  $effect(() => {
    const pdf = doc?.pdf.doc;
    outline = [];
    if (!pdf) return;
    let cancelled = false;
    void readOutline(pdf).then(
      (items) => !cancelled && (outline = items),
      () => {},
    );
    return () => (cancelled = true);
  });

  const flat = $derived.by(() => {
    const out: OutlineItem[] = [];
    const walk = (items: OutlineItem[]) => {
      for (const item of items) {
        out.push(item);
        walk(item.children);
      }
    };
    walk(outline);
    return out;
  });

  /** The outline entry the current page belongs to. */
  const currentSection = $derived.by(() => {
    let best: OutlineItem | null = null;
    for (const item of flat) {
      if (item.page !== null && item.page <= session.page && (!best || (best.page ?? 0) <= item.page)) best = item;
    }
    return best;
  });
</script>

<div class="screen" data-theme={readingMode.isDark ? "dark" : undefined} class:reading-dark={readingMode.isDark}>
  <TitleBar layout="tabs">
    {#snippet left()}
      <BackButton label={t("reader.toLibrary")} onclick={() => navigation.go("library")} />
      <IconButton
        icon="sidebar"
        size="s"
        label={t("reader.sidebar")}
        title={t("reader.sidebarTitle", { shortcut: formatShortcut("mod+\\", platform) })}
        pressed={sidebarOpen}
        onclick={() => settings.update((s) => (s.reader.sidebarOpen = !s.reader.sidebarOpen))}
      />
    {/snippet}
    {#snippet center()}
      <TabStrip />
    {/snippet}
    {#snippet right()}
      <BarActions bind:this={barActions} compactUpdate>
        {#snippet before()}
          <IconButton
            icon="bookmark"
            label={session.isBookmarked ? t("reader.unbookmark") : t("reader.bookmark")}
            title={t("reader.bookmarkTitle", { shortcut: formatShortcut("mod+d", platform) })}
            pressed={session.isBookmarked}
            onclick={() => session.toggleBookmark()}
          />
          <IconButton
            icon="search"
            label={t("find.open")}
            title={t("find.openTitle", { shortcut: formatShortcut("mod+f", platform) })}
            pressed={findOpen}
            onclick={() => (findOpen = !findOpen)}
          />
        {/snippet}
      </BarActions>
    {/snippet}
  </TitleBar>

  <div class="body">
    {#if sidebarOpen}
      <Sidebar {outline} current={currentSection} />
    {/if}
    <main class="pages">
      <PdfView
        doc={doc?.pdf.doc ?? null}
        place={session.active?.place ?? 1}
        onFirstRender={() => session.onFirstRender()}
        onState={(s) => session.onViewerState(s)}
        onExternalLink={(url) => void openExternal(url)}
        bind:controller={session.controller}
      />
      {#if session.showSnapshot && session.active?.snapshot}
        <img class="snapshot" src={session.active.snapshot} alt="" draggable="false" />
      {/if}
      {#if findOpen}
        <FindBar bind:input={findInput} onClose={() => (findOpen = false)} />
      {/if}
      <PagePill />
    </main>
  </div>
</div>

<style>
  .screen {
    height: 100%;
    display: flex;
    flex-direction: column;
    background: var(--canvas-bg);
    color: var(--text);
  }
  .screen.reading-dark {
    --bar: #1a1a1d;
    --sidebar-bg: #161619;
  }
  .snapshot {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    z-index: 4;
    pointer-events: none;
    background: var(--canvas-bg);
  }
  .body {
    flex: 1;
    min-height: 0;
    display: flex;
  }
  .pages {
    flex: 1;
    min-width: 0;
    position: relative;
  }
  /* Room under the last page for the floating page pill. */
  .pages :global(.pdfViewer) {
    padding-bottom: 80px;
  }
  .pages :global(.pdfViewer .page) {
    margin: 16px auto;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12), 0 8px 24px rgba(0, 0, 0, 0.08);
  }
  .reading-dark .pages :global(.pdfViewer .page) {
    box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.08), 0 8px 30px rgba(0, 0, 0, 0.45);
  }
</style>
