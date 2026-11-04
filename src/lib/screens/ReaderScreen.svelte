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
  import { annotations } from "../annotations/store.svelte";
  import { AnnotationLayer } from "../annotations/layer";
  import type { TextMark } from "../annotations/model";
  import ToolGroup from "../annotations/ui/ToolGroup.svelte";
  import ToolOptions from "../annotations/ui/ToolOptions.svelte";
  import MarkMenu from "../annotations/ui/MarkMenu.svelte";
  import NoteEditor from "../annotations/ui/NoteEditor.svelte";
  import SnipMenu from "../annotations/ui/SnipMenu.svelte";
  import ExportDialog from "../annotations/ui/ExportDialog.svelte";
  import { savePng } from "../ipc/export";
  import FindBar from "../reader/ui/FindBar.svelte";
  import TabStrip from "../reader/ui/TabStrip.svelte";
  import { navigation } from "../app/navigation.svelte";

  interface Props {
    findOpen?: boolean;
    exportOpen?: boolean;
    findInput?: HTMLInputElement | null;
    barActions?: BarActions | null;
  }
  let { exportOpen = $bindable(false), findOpen = $bindable(false), findInput = $bindable(null), barActions = $bindable(null) }: Props = $props();

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

  // ---- Annotations --------------------------------------------------------------------------
  let layer = $state.raw<AnnotationLayer | null>(null);
  let menu = $state<{ at: DOMRect; mark: TextMark | null } | null>(null);
  let editing = $state<{ id: string; anchor: HTMLElement } | null>(null);
  let snipAt = $state<DOMRect | null>(null);

  /** Snips are rendered at 3× the on-screen size (crisp formulas), up to 8000 px wide. */
  async function snipBlob(): Promise<Blob> {
    const rect = snipAt;
    const scale = rect ? Math.max(1, Math.min(3 * (window.devicePixelRatio || 1), 8000 / Math.max(rect.width, rect.height))) : 3;
    const canvas = await layer?.renderSnip(scale);
    if (!canvas) throw new Error("nothing to capture");
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) throw new Error("the image could not be made");
    return blob;
  }
  async function copySnip() {
    const blob = await snipBlob();
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
  }
  async function saveSnip() {
    const blob = await snipBlob();
    return savePng(blob, t("snip.name", { title: doc?.title ?? "LumiPDF", page: session.page }));
  }
  function closeSnip() {
    snipAt = null;
    layer?.clearSnip();
  }

  /** A stand-in anchor for popovers that open at a screen rectangle. */
  function anchorAt(rect: DOMRect): HTMLElement {
    return { getBoundingClientRect: () => rect, contains: () => false } as unknown as HTMLElement;
  }

  $effect(() => {
    const controller = session.controller;
    if (!controller) return;
    const l = new AnnotationLayer(controller, {
      onNoteOpen: (id, anchor) => {
        menu = null;
        editing = { id, anchor };
      },
      onMarkClick: (id, at) => {
        const mark = annotations.get(id);
        if (mark && mark.type !== "ink" && mark.type !== "marker" && mark.type !== "note") menu = { at, mark };
      },
      style: () => settings.value.annotate,
      onSnip: (at) => (snipAt = at),
      onSnipClear: () => (snipAt = null),
    });
    layer = l;
    // Selecting text in select mode shows the mark menu above the selection.
    const onUp = () =>
      setTimeout(() => {
        if (annotations.tool !== "select") return;
        const rect = l.selectionRect();
        if (rect) menu = { at: rect, mark: null };
      });
    controller.container.addEventListener("pointerup", onUp);
    // Keep the snip menu under its area while scrolling.
    const onScroll = () =>
      requestAnimationFrame(() => {
        if (snipAt) snipAt = l.snipScreenRect() ?? snipAt;
      });
    controller.container.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      controller.container.removeEventListener("scroll", onScroll);
      controller.container.removeEventListener("pointerup", onUp);
      l.destroy();
      layer = null;
    };
  });

  $effect(() => layer?.setTool(annotations.tool));
  $effect(() => {
    void annotations.revision;
    layer?.redrawAll();
  });
  $effect(() => {
    const pdf = doc?.pdf.doc ?? null;
    layer?.reset();
    void annotations.activate(pdf);
  });

  function createMark(kind: TextMark["type"], color: string): TextMark | null {
    return layer?.markSelection(kind, color)[0] ?? null;
  }

  function openComment(mark: TextMark) {
    const rect = layer?.rectOf(mark);
    if (rect) editing = { id: mark.id, anchor: anchorAt(rect) };
  }
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
          <ToolGroup />
          <IconButton
            icon="export"
            label={t("export.button")}
            title={t("export.buttonTitle", { shortcut: formatShortcut("mod+e", platform) })}
            pressed={exportOpen}
            onclick={() => (exportOpen = true)}
          />
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
      <ToolOptions />
      {#if menu}
        <MarkMenu at={menu.at} mark={menu.mark} onCreate={createMark} onComment={openComment} onClose={() => (menu = null)} />
      {/if}
      {#if exportOpen}
        <ExportDialog onClose={() => (exportOpen = false)} />
      {/if}
      {#if snipAt}
        <SnipMenu at={snipAt} onCopy={copySnip} onSave={saveSnip} onClose={closeSnip} />
      {/if}
      {#if editing}
        <NoteEditor id={editing.id} anchor={editing.anchor} onClose={() => (editing = null)} />
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
  /* Annotation layers (created by annotations/layer.ts inside each pdf.js page). */
  .pages :global(.lumi-marks) {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
  }
  .pages :global(.lumi-ink) {
    position: absolute;
    inset: 0;
    z-index: 4;
    pointer-events: none;
  }
  .pages :global(.lumi-ink canvas) {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
  }
  .pages :global(.lumi-note) {
    position: absolute;
    width: 22px;
    height: 22px;
    margin: -11px 0 0 -4px;
    padding: 0;
    border: none;
    border-radius: 6px 6px 6px 2px;
    background: var(--note);
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.35), inset 0 -6px 0 rgba(0, 0, 0, 0.08);
    pointer-events: auto;
    cursor: pointer;
    transition: transform var(--fast) var(--ease);
  }
  .pages :global(.lumi-note::after) {
    content: "";
    position: absolute;
    left: 5px;
    right: 5px;
    top: 7px;
    height: 6px;
    border-top: 1.5px solid rgba(0, 0, 0, 0.35);
    border-bottom: 1.5px solid rgba(0, 0, 0, 0.35);
  }
  .pages :global(.lumi-note.small) {
    width: 14px;
    height: 14px;
    margin: -14px 0 0 2px;
  }
  .pages :global(.lumi-note.small::after) {
    display: none;
  }
  .pages :global(.lumi-note.dragging) {
    cursor: grabbing;
    transform: scale(1.15);
    box-shadow: 0 6px 16px rgba(0, 0, 0, 0.35);
  }
  .pages :global([data-tool="snip"]) {
    cursor: crosshair;
  }
  .pages :global(.lumi-note:hover) {
    transform: scale(1.12);
  }
  /* Drawing tools: the text layer and links must not take the pointer. */
  .pages :global(.tool-draw .textLayer),
  .pages :global(.tool-draw .annotationLayer) {
    pointer-events: none !important;
  }
  .pages :global(.tool-draw) {
    cursor: crosshair;
    touch-action: none;
  }
  .pages :global([data-tool="eraser"]) {
    cursor: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='18' height='18'%3E%3Ccircle cx='9' cy='9' r='7.5' fill='rgba(255,255,255,0.6)' stroke='%23444' stroke-width='1.2'/%3E%3C/svg%3E") 9 9, crosshair;
  }
  .pages :global([data-tool="note"]) {
    cursor: copy;
  }
  .pages :global([data-tool="highlight"] .textLayer) {
    cursor: text;
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
