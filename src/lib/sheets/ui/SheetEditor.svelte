<script lang="ts">
  /**
   * The formula sheet editor (shown in a tab). Pages at real proportions; snips and titles laid
   * out automatically (flow) or placed freely. Select to move, resize, delete or jump to where a
   * snip came from.
   */
  import { onMount, tick } from "svelte";
  import { t, tn } from "../../i18n";
  import { formatShortcut, isPrimaryModifier } from "../../platform/shortcuts";
  import { platform } from "../../platform/window";
  import { readingMode } from "../../dark/readingMode.svelte";
  import { darkBackground } from "../../dark/engine";
  import { session } from "../../reader/session.svelte";
  import { library, message } from "../../library/library.svelte";
  import { settings } from "../../settings/store.svelte";
  import { savePng } from "../../ipc/export";
  import { sheetAddImage, sheetExportPdf, sheetImageUrl, type ExportPlaced } from "../../ipc/sheets";
  import { printPages } from "../../print/print";
  import { revealInFolder } from "../../ipc/export";
  import type { DocumentRef } from "../../ipc/documents";
  import Icon from "../../ui/Icon.svelte";
  import IconButton from "../../ui/IconButton.svelte";
  import { sheets } from "../sheets.svelte";
  import {
    GAP,
    GUTTER,
    MARGIN,
    MAX_SCALE,
    MIN_SCALE,
    PAPER,
    TITLE_HEIGHT,
    TITLE_SIZE,
    TEXT_LINE,
    TEXT_MAX_CHARS,
    TEXT_SIZE,
    clampSpot,
    itemHeight,
    wrapText,
    snapBox,
    layoutSheet,
    newId,
    toFlow,
    toFree,
    type FreeSpot,
    type Placed,
    type Sheet,
    type SheetItem,
  } from "../model";
  import SheetImage from "./SheetImage.svelte";

  interface Props {
    id: string;
  }
  let { id }: Props = $props();

  let loading = $state(true);
  $effect(() => {
    const current = id;
    loading = true;
    void sheets.load(current).finally(() => {
      if (current === id) loading = false;
    });
  });

  const sheet = $derived(sheets.get(id));
  const layout = $derived(sheet ? layoutSheet(sheet) : null);
  const paper = $derived(PAPER[sheet?.paper ?? "a4"]);
  $effect(() => {
    if (sheet) session.renameSheet(sheet.id, sheet.title);
  });

  // ---- Zoom: fits the width by default --------------------------------------------------------
  let scroller = $state<HTMLDivElement | null>(null);
  let areaWidth = $state(900);
  let zoomPick = $state<number | null>(null);
  const fitZoom = $derived(Math.max(0.4, Math.min(1.25, (areaWidth - 80) / paper.w)));
  const zoom = $derived(zoomPick ?? fitZoom);
  const zoomSteps = [0.25, 0.33, 0.5, 0.67, 0.8, 1, 1.25, 1.5, 2, 3, 4];
  const ZOOM_MIN = 0.25;
  const ZOOM_MAX = 4;
  /** Ctrl/⌘ + wheel and trackpad pinch zoom the sheet. */
  function onWheel(e: WheelEvent) {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    const notch = e.deltaMode !== 0 || Math.abs(e.deltaY) >= 40;
    const factor = notch ? (e.deltaY < 0 ? 1.1 : 1 / 1.1) : Math.exp(-e.deltaY * 0.006);
    zoomPick = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom * factor));
  }
  function zoomBy(direction: 1 | -1) {
    const next = direction > 0 ? zoomSteps.find((z) => z > zoom + 0.01) : [...zoomSteps].reverse().find((z) => z < zoom - 0.01);
    if (next) zoomPick = next;
  }

  const dark = $derived(readingMode.isDark);
  const paperColor = $derived(dark ? (darkBackground() ?? "#1c1c1e") : "#ffffff");

  // ---- Changes --------------------------------------------------------------------------------
  function change(fn: (s: Sheet) => Sheet, history = true) {
    sheets.update(id, fn, history);
  }
  function setLayout(next: "flow" | "free") {
    if (!sheet || sheet.layout === next) return;
    change((s) => (next === "free" ? toFree(s) : toFlow(s)));
  }
  function setItem(itemId: string, patch: Partial<SheetItem>, history = true) {
    change((s) => ({ ...s, items: s.items.map((it) => (it.id === itemId ? ({ ...it, ...patch } as SheetItem) : it)) }), history);
  }
  function removeItem(itemId: string) {
    change((s) => ({ ...s, items: s.items.filter((it) => it.id !== itemId) }));
    if (selected === itemId) selected = null;
  }
  async function addTitle() {
    if (!sheet || !layout) return;
    const item: SheetItem = { id: newId(), type: "title", text: t("sheets.newTitle") };
    let items = [...sheet.items];
    if (sheet.layout === "free") {
      const page = selectedPlaced?.page ?? Math.max(0, layout.pages - 1);
      item.free = clampSpot(sheet, item, { page, x: MARGIN, y: selectedPlaced ? selectedPlaced.y + selectedPlaced.h + GAP : MARGIN, w: layout.column });
      items.push(item);
    } else {
      const at = selected ? items.findIndex((it) => it.id === selected) + 1 : items.length;
      items.splice(at, 0, item);
    }
    change((s) => ({ ...s, items }));
    selected = item.id;
    await tick();
    startEditing(item.id);
  }
  /** Where a new item goes: after the selected one (flow) or below it (free). */
  function insertItem(item: SheetItem) {
    if (!sheet || !layout) return;
    const items = [...sheet.items];
    if (sheet.layout === "free") {
      const w = item.type === "snip" ? Math.min(layout.column, item.natural[0]) : layout.column;
      let page = selectedPlaced?.page ?? Math.max(0, layout.pages - 1);
      // Below the selected item, or below everything on the last page; a new page when full.
      let y = selectedPlaced ? selectedPlaced.y + selectedPlaced.h + GAP : Math.max(MARGIN, ...layout.placed.filter((p) => p.page === page).map((p) => p.y + p.h + GAP));
      if (!selectedPlaced && y + itemHeight(item, w) > paper.h - MARGIN && y > MARGIN) {
        page = layout.pages;
        y = MARGIN;
        change((s) => ({ ...s, pages: Math.min(200, layout!.pages + 1) }));
      }
      item.free = clampSpot(sheet, item, { page, x: MARGIN, y, w });
      items.push(item);
    } else {
      const at = selected ? items.findIndex((it) => it.id === selected) + 1 : items.length;
      items.splice(at, 0, item);
    }
    change((s) => ({ ...s, items }));
    selected = item.id;
  }
  async function addText() {
    const item: SheetItem = { id: newId(), type: "text", text: t("sheets.newText"), size: TEXT_SIZE };
    insertItem(item);
    await tick();
    startEditing(item.id);
  }

  // ---- Pictures from a file or the clipboard ---------------------------------------------------
  let fileInput = $state<HTMLInputElement | null>(null);
  /** Pictures are stored as PNG; their printed size assumes 150 dpi, capped at the column. */
  async function addImage(file: Blob, name: string) {
    if (!sheet || !layout) return;
    try {
      const bitmap = await createImageBitmap(file);
      const canvas = document.createElement("canvas");
      const scale = Math.min(1, 4000 / Math.max(bitmap.width, bitmap.height));
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      bitmap.close();
      const png = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/png"));
      if (!png) return;
      const image = await sheetAddImage(png);
      const naturalW = Math.min(layout.column, (canvas.width * 72) / 150);
      const item: SheetItem = {
        id: newId(),
        type: "snip",
        image,
        px: [canvas.width, canvas.height],
        natural: [naturalW, (naturalW * canvas.height) / canvas.width],
        scale: 1,
        source: { path: "", name: name.slice(0, 400), page: 0 },
      };
      insertItem(item);
    } catch (err) {
      notice = { text: t("sheets.imageFailed", { reason: message(err) }), error: true };
    }
  }
  function onPaste(e: ClipboardEvent) {
    if (session.activeSheet !== id || (e.target as HTMLElement | null)?.closest?.("input, textarea, [contenteditable='true']")) return;
    const file = [...(e.clipboardData?.files ?? [])].find((f) => f.type.startsWith("image/"));
    if (!file) return;
    e.preventDefault();
    void addImage(file, t("sheets.pastedImage"));
  }

  function addPage() {
    if (sheet?.layout === "free") change((s) => ({ ...s, pages: Math.min(200, layout!.pages + 1) }));
  }

  // ---- Selection and title editing --------------------------------------------------------------
  let selected = $state<string | null>(null);
  const selectedPlaced = $derived(layout?.placed.find((p) => p.item.id === selected) ?? null);
  let editing = $state<string | null>(null);
  let draft = $state("");
  function startEditing(itemId: string) {
    const item = sheet?.items.find((it) => it.id === itemId);
    if (item?.type !== "title" && item?.type !== "text") return;
    editing = itemId;
    draft = item.text;
  }
  function finishEditing(save: boolean) {
    if (editing && save) {
      const item = sheet?.items.find((it) => it.id === editing);
      const text = item?.type === "text" ? draft.replace(/\s+$/, "").slice(0, TEXT_MAX_CHARS) : draft.trim().slice(0, 200);
      if (text) setItem(editing, { text });
      else removeItem(editing);
    }
    editing = null;
  }
  function setTextSize(itemId: string, size: number) {
    setItem(itemId, { size } as Partial<SheetItem>);
  }
  function focusOnMount(node: HTMLInputElement | HTMLTextAreaElement) {
    node.focus();
    node.select();
  }

  // ---- Dragging: move and resize --------------------------------------------------------------
  interface Drag {
    itemId: string;
    mode: "move" | "resize";
    pointer: number;
    startX: number;
    startY: number;
    /** Where the item was grabbed, relative to its top left, in points. */
    grab: { x: number; y: number };
    start: Placed;
    moved: boolean;
    /** Flow move: where it would land (index in the items without it), and the ghost position. */
    target: number;
    ghost: { x: number; y: number } | null;
  }
  let drag = $state<Drag | null>(null);
  /** Guide lines shown while moving in free layout. */
  let guides = $state<{ page: number; vertical: number[]; horizontal: number[] } | null>(null);
  /** Snapping distance, in screen pixels. */
  const SNAP_PX = 6;

  /** Page and point (in points) under a screen position. */
  function pointAt(clientX: number, clientY: number): { page: number; x: number; y: number } | null {
    const pages = [...(scroller?.querySelectorAll<HTMLElement>(".sheet-page") ?? [])];
    if (!pages.length) return null;
    let best = pages[0]!;
    let bestDist = Infinity;
    for (const el of pages) {
      const r = el.getBoundingClientRect();
      const d = clientY < r.top ? r.top - clientY : clientY > r.bottom ? clientY - r.bottom : 0;
      if (d < bestDist) {
        bestDist = d;
        best = el;
      }
    }
    const r = best.getBoundingClientRect();
    return { page: Number(best.dataset.page), x: (clientX - r.left) / zoom, y: (clientY - r.top) / zoom };
  }

  function onItemDown(e: PointerEvent, p: Placed, mode: "move" | "resize") {
    if (e.button !== 0 || editing === p.item.id) return;
    e.stopPropagation();
    selected = p.item.id;
    const at = pointAt(e.clientX, e.clientY);
    drag = {
      itemId: p.item.id,
      mode,
      pointer: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      grab: at ? { x: at.x - p.x, y: at.y - p.y } : { x: 0, y: 0 },
      start: p,
      moved: false,
      target: -1,
      ghost: null,
    };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  /** Flow: index (among the other items) where a drop at `at` lands. */
  function flowTarget(at: { page: number; x: number; y: number }, without: string): number {
    if (!layout) return 0;
    const others = layout.placed.filter((p) => p.item.id !== without);
    const colOf = (x: number) => Math.max(0, Math.min((sheet?.columns ?? 1) - 1, Math.floor((x - MARGIN + GUTTER / 2) / (layout!.column + GUTTER))));
    const key = (page: number, col: number, y: number) => page * 1e7 + col * 1e5 + y;
    const k = key(at.page, colOf(at.x), at.y);
    const i = others.findIndex((p) => key(p.page, colOf(p.x + 1), p.y + p.h / 2) > k);
    return i < 0 ? others.length : i;
  }

  function onMove(e: PointerEvent) {
    if (!drag || e.pointerId !== drag.pointer || !sheet) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    if (!drag.moved) {
      if (Math.hypot(dx, dy) < 4) return;
      drag.moved = true;
      if (sheet.layout === "free" || drag.mode === "resize") sheets.checkpoint(id);
    }
    const item = sheet.items.find((it) => it.id === drag!.itemId);
    if (!item) return;
    if (drag.mode === "resize") {
      const w = Math.max(12, drag.start.w + dx / zoom);
      if (sheet.layout === "free") setItem(item.id, { free: clampSpot(sheet, item, { ...(item.free ?? spotOf(drag.start)), w }) }, false);
      else if (item.type === "snip") setItem(item.id, { scale: Math.min(MAX_SCALE, Math.max(MIN_SCALE, Math.min(w, layout!.column) / item.natural[0])) } as Partial<SheetItem>, false);
      return;
    }
    const at = pointAt(e.clientX, e.clientY);
    if (!at) return;
    if (sheet.layout === "free") {
      let spot = clampSpot(sheet, item, { page: at.page, x: at.x - drag.grab.x, y: at.y - drag.grab.y, w: item.free?.w ?? drag.start.w });
      // Smart guides (hold Alt to place freely).
      if (!e.altKey && layout) {
        const others = layout.placed.filter((p) => p.page === spot.page && p.item.id !== item.id);
        const h = itemHeight(item, spot.w);
        const snapped = snapBox({ x: spot.x, y: spot.y, w: spot.w, h }, others, paper, SNAP_PX / zoom);
        spot = clampSpot(sheet, item, { ...spot, x: snapped.x, y: snapped.y });
        guides = { page: spot.page, vertical: snapped.vertical, horizontal: snapped.horizontal };
      } else guides = null;
      setItem(item.id, { free: spot }, false);
    } else {
      drag.target = flowTarget(at, item.id);
      drag.ghost = { x: e.clientX - drag.grab.x * zoom, y: e.clientY - drag.grab.y * zoom };
    }
  }

  function onUp(e: PointerEvent) {
    if (!drag || e.pointerId !== drag.pointer) return;
    const d = drag;
    drag = null;
    guides = null;
    if (!d.moved || !sheet || sheet.layout !== "flow" || d.mode !== "move" || d.target < 0) return;
    const items = sheet.items.filter((it) => it.id !== d.itemId);
    const item = sheet.items.find((it) => it.id === d.itemId)!;
    items.splice(d.target, 0, item);
    if (items.some((it, i) => it.id !== sheet.items[i]!.id)) change((s) => ({ ...s, items }));
  }

  function spotOf(p: Placed): FreeSpot {
    return { page: p.page, x: p.x, y: p.y, w: p.w };
  }

  /** Flow drop indicator: a line where the item would land. */
  const indicator = $derived.by(() => {
    if (!drag?.moved || drag.mode !== "move" || sheet?.layout !== "flow" || !layout) return null;
    const others = layout.placed.filter((p) => p.item.id !== drag!.itemId);
    const before = others[drag.target];
    if (before) return { page: before.page, x: MARGIN + Math.round((before.x - MARGIN) / (layout.column + GUTTER)) * (layout.column + GUTTER), y: before.y - GAP / 2, w: layout.column };
    const last = others.at(-1);
    if (!last) return null;
    return { page: last.page, x: MARGIN + Math.round((last.x - MARGIN) / (layout.column + GUTTER)) * (layout.column + GUTTER), y: last.y + last.h + GAP / 2, w: layout.column };
  });
  const dragging = $derived(drag?.moved && drag.mode === "move" && sheet?.layout === "flow" ? layout?.placed.find((p) => p.item.id === drag!.itemId) ?? null : null);

  // ---- Going back to the source --------------------------------------------------------------
  async function openSource(p: Placed) {
    if (p.item.type !== "snip") return;
    const { path, page } = p.item.source;
    if (!path) return;
    await session.openFromLibrary(path);
    for (let i = 0; i < 60 && session.active?.path === path; i++) {
      if (session.controller?.document) {
        session.controller.goToPage(page);
        return;
      }
      await new Promise((r) => setTimeout(r, 50));
    }
  }

  // ---- Export ---------------------------------------------------------------------------------
  let exporting = $state(false);
  let exportMenu = $state(false);
  let notice = $state<{ text: string; doc?: DocumentRef; path?: string; error?: boolean } | null>(null);

  function exportItems(): ExportPlaced[] {
    return (layout?.placed ?? []).flatMap((p): ExportPlaced[] => {
      if (p.item.type === "snip") return [{ kind: "image", page: p.page, x: p.x, y: p.y, w: p.w, h: p.h, image: p.item.image }];
      if (p.item.type === "title") return [{ kind: "text", page: p.page, x: p.x, y: p.y + (TITLE_HEIGHT - TITLE_SIZE) / 2 - 2, size: TITLE_SIZE, text: p.item.text }];
      const { size } = p.item;
      // Each line, with its top where the line box starts (centred in the line height).
      return wrapText(p.item.text, size, p.w).map((text, i) => ({ kind: "text", page: p.page, x: p.x, y: p.y + i * size * TEXT_LINE + (size * (TEXT_LINE - 1)) / 2, size, text, bold: false }));
    });
  }

  /** One page as a white picture at `dpi` (PNG export and printing). */
  async function renderPage(page: number, dpi: number): Promise<HTMLCanvasElement> {
    const k = dpi / 72;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(paper.w * k);
    canvas.height = Math.round(paper.h * k);
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingQuality = "high";
    for (const p of layout?.placed.filter((x) => x.page === page) ?? []) {
      if (p.item.type === "snip") {
        const img = new Image();
        img.src = await sheetImageUrl(p.item.image);
        await img.decode();
        ctx.drawImage(img, p.x * k, p.y * k, p.w * k, p.h * k);
      } else if (p.item.type === "title") {
        ctx.fillStyle = "#1c1c1f";
        ctx.font = `600 ${TITLE_SIZE * k}px Inter, "Segoe UI", system-ui, sans-serif`;
        ctx.textBaseline = "middle";
        ctx.fillText(p.item.text, p.x * k, (p.y + TITLE_HEIGHT / 2) * k, p.w * k);
      } else {
        const { size } = p.item;
        ctx.fillStyle = "#1c1c1f";
        ctx.font = `${size * k}px Helvetica, Arial, sans-serif`;
        ctx.textBaseline = "middle";
        wrapText(p.item.text, size, p.w).forEach((line, i) => ctx.fillText(line, p.x * k, (p.y + (i + 0.5) * size * TEXT_LINE) * k));
      }
    }
    return canvas;
  }

  async function printSheet() {
    if (!sheet || !layout) return;
    exportMenu = false;
    exporting = true;
    notice = null;
    try {
      const pages = [];
      for (let page = 0; page < layout.pages; page++) {
        const canvas = await renderPage(page, 150);
        const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/png"));
        if (blob) pages.push({ url: URL.createObjectURL(blob), landscape: false });
      }
      await printPages(pages);
    } catch (err) {
      notice = { text: t("export.printFailed", { reason: message(err) }), error: true };
    } finally {
      exporting = false;
    }
  }

  async function exportPdf() {
    if (!sheet || !layout) return;
    exportMenu = false;
    exporting = true;
    notice = null;
    try {
      await sheets.flush(id);
      const doc = await sheetExportPdf({ title: sheet.title, width: paper.w, height: paper.h, pages: layout.pages, items: exportItems() });
      if (doc) notice = { text: t("sheets.exported"), doc, path: doc.path };
    } catch (err) {
      notice = { text: t("sheets.exportFailed", { reason: message(err) }), error: true };
    } finally {
      exporting = false;
    }
  }

  /** The page most in view (for "Save page as PNG"). */
  function pageInView(): number {
    if (selectedPlaced) return selectedPlaced.page;
    const box = scroller?.getBoundingClientRect();
    let best = 0;
    let bestArea = -1;
    for (const el of scroller?.querySelectorAll<HTMLElement>(".sheet-page") ?? []) {
      const r = el.getBoundingClientRect();
      const area = box ? Math.max(0, Math.min(r.bottom, box.bottom) - Math.max(r.top, box.top)) : 0;
      if (area > bestArea) {
        bestArea = area;
        best = Number(el.dataset.page);
      }
    }
    return best;
  }

  async function exportPng() {
    if (!sheet || !layout) return;
    exportMenu = false;
    exporting = true;
    notice = null;
    try {
      const page = pageInView();
      const canvas = await renderPage(page, 200);
      const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/png"));
      if (blob && (await savePng(blob, layout.pages > 1 ? `${sheet.title} — ${page + 1}` : sheet.title))) notice = { text: t("sheets.pngSaved") };
    } catch (err) {
      notice = { text: t("sheets.exportFailed", { reason: message(err) }), error: true };
    } finally {
      exporting = false;
    }
  }

  // ---- Keyboard -------------------------------------------------------------------------------
  function onKey(e: KeyboardEvent) {
    if (session.activeSheet !== id) return;
    const typing = (e.target as HTMLElement | null)?.closest?.("input, textarea, select, [contenteditable='true']");
    if (typing) return;
    if (isPrimaryModifier(e, platform) && !e.altKey) {
      const k = e.key.toLowerCase();
      if (k === "z" || k === "y") {
        e.preventDefault();
        if (k === "y" || e.shiftKey) sheets.redo(id);
        else sheets.undo(id);
      } else if (k === "e") {
        e.preventDefault();
        void exportPdf();
      }
      return;
    }
    if ((e.key === "Delete" || e.key === "Backspace") && selected) {
      e.preventDefault();
      removeItem(selected);
    } else if (e.key === "Enter" && selected) {
      startEditing(selected);
    } else if (e.key === "Escape" && selected) {
      e.preventDefault();
      selected = null;
    }
  }

  // Not an onwheel attribute: those are passive, and zooming must stop the page from scrolling.
  $effect(() => {
    const el = scroller;
    if (!el) return;
    el.addEventListener("wheel", onWheel, { passive: false });
    // Mac trackpad pinch (WebKit gesture events).
    let last = 1;
    const start = (e: Event) => {
      e.preventDefault();
      last = 1;
    };
    const change = (e: Event) => {
      e.preventDefault();
      const scale = (e as Event & { scale: number }).scale;
      if (!(scale > 0)) return;
      zoomPick = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom * (scale / last)));
      last = scale;
    };
    el.addEventListener("gesturestart", start, { passive: false });
    el.addEventListener("gesturechange", change, { passive: false });
    return () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("gesturestart", start);
      el.removeEventListener("gesturechange", change);
    };
  });

  onMount(() => {
    const ro = new ResizeObserver(([entry]) => entry && (areaWidth = entry.contentRect.width));
    if (scroller) ro.observe(scroller);
    return () => ro.disconnect();
  });

  const snipCount = $derived(sheet?.items.filter((i) => i.type === "snip").length ?? 0);
  const exportShortcut = formatShortcut("mod+e", platform);
  void library;
</script>

<svelte:window onkeydown={onKey} onpaste={onPaste} onpointermove={onMove} onpointerup={onUp} onpointercancel={() => ((drag = null), (guides = null))} />

<div class="editor" class:dark>
  {#if sheet && layout}
    <div class="bar">
      <input
        class="title-input"
        value={sheet.title}
        aria-label={t("sheets.name")}
        maxlength="120"
        spellcheck="false"
        onchange={(e) => {
          const title = e.currentTarget.value.trim() || t("sheets.untitled");
          change((s) => ({ ...s, title }));
        }}
        onkeydown={(e) => e.key === "Enter" && e.currentTarget.blur()}
      />
      {#if selectedPlaced && editing !== selectedPlaced.item.id}
        {@const sp = selectedPlaced}
        <div class="selection" role="group" aria-label={t("sheets.selection")}>
          {#if sp.item.type === "snip"}
            {#if sp.item.source.path}
              <button class="btn small" onclick={() => openSource(sp)} title={sp.item.source.name}><Icon name="external" size={12} stroke={2} />{t("sheets.source", { page: sp.item.source.page })}</button>
            {/if}
          {:else}
            <button class="btn small" onclick={() => startEditing(sp.item.id)}>{t("sheets.edit")}</button>
            {#if sp.item.type === "text"}
              {@const ti = sp.item}
              <IconButton icon="minus" size="s" label={t("sheets.smaller")} disabled={ti.size <= 6} onclick={() => setTextSize(ti.id, Math.max(6, ti.size - 1))} />
              <span class="size">{ti.size} pt</span>
              <IconButton icon="plus" size="s" label={t("sheets.larger")} disabled={ti.size >= 36} onclick={() => setTextSize(ti.id, Math.min(36, ti.size + 1))} />
            {/if}
          {/if}
          <button class="btn small danger-text" onclick={() => removeItem(sp.item.id)}><Icon name="trash" size={12} stroke={2} />{t("sheets.delete")}</button>
        </div>
      {:else}
        <span class="count">{tn("sheets.snips", snipCount)}</span>
      {/if}

      <div class="tools">
        <div class="seg" role="radiogroup" aria-label={t("sheets.layout")}>
          <button role="radio" aria-checked={sheet.layout === "flow"} title={t("sheets.flowHint")} onclick={() => setLayout("flow")}>{t("sheets.flow")}</button>
          <button role="radio" aria-checked={sheet.layout === "free"} title={t("sheets.freeHint")} onclick={() => setLayout("free")}>{t("sheets.free")}</button>
        </div>
        {#if sheet.layout === "flow"}
          <div class="seg" role="radiogroup" aria-label={t("sheets.columns")}>
            {#each [1, 2, 3] as n (n)}
              <button role="radio" aria-checked={sheet.columns === n} title={tn("sheets.columnsN", n)} onclick={() => change((s) => ({ ...s, columns: n as 1 | 2 | 3 }))}>{n}</button>
            {/each}
          </div>
        {/if}
        <select
          class="select"
          value={sheet.paper}
          aria-label={t("sheets.paper")}
          onchange={(e) => {
            const p = e.currentTarget.value as "a4" | "letter";
            change((s) => ({ ...s, paper: p }));
            settings.update((x) => (x.sheets.paper = p));
          }}
        >
          <option value="a4">A4</option>
          <option value="letter">{t("sheets.letter")}</option>
        </select>
        <span class="sep"></span>
        <button class="btn small" onclick={addTitle}><Icon name="title" size={13} stroke={2} />{t("sheets.addTitle")}</button>
        <button class="btn small" onclick={addText}><Icon name="textbox" size={13} stroke={2} />{t("sheets.addText")}</button>
        <button class="btn small" title={t("sheets.addImageHint")} onclick={() => fileInput?.click()}><Icon name="image" size={13} stroke={2} />{t("sheets.addImage")}</button>
        <input
          class="file"
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif,image/bmp"
          bind:this={fileInput}
          onchange={(e) => {
            const f = e.currentTarget.files?.[0];
            if (f) void addImage(f, f.name);
            e.currentTarget.value = "";
          }}
        />
        {#if sheet.layout === "free"}
          <button class="btn small" onclick={addPage}><Icon name="plus" size={13} stroke={2} />{t("sheets.addPage")}</button>
        {/if}
        <IconButton icon="undo" size="s" label={t("tools.undo")} disabled={!sheets.canUndo(id)} onclick={() => sheets.undo(id)} />
        <IconButton icon="redo" size="s" label={t("tools.redo")} disabled={!sheets.canRedo(id)} onclick={() => sheets.redo(id)} />
        <span class="sep"></span>
        <div class="zoom">
          <IconButton icon="minus" size="s" label={t("zoom.out")} onclick={() => zoomBy(-1)} />
          <button class="zoom-value" title={t("sheets.fit")} onclick={() => (zoomPick = null)}>{Math.round(zoom * 100)}%</button>
          <IconButton icon="plus" size="s" label={t("zoom.in")} onclick={() => zoomBy(1)} />
        </div>
        <div class="export">
          <button class="btn small primary" disabled={exporting || !sheet.items.length} title={t("sheets.exportTitle", { shortcut: exportShortcut })} onclick={() => (exportMenu = !exportMenu)}>
            <Icon name="export" size={13} stroke={2} />{exporting ? t("sheets.exporting") : t("sheets.export")}
          </button>
          {#if exportMenu}
            <div class="menu" role="menu">
              <button role="menuitem" onclick={exportPdf}><Icon name="file" size={14} />{t("sheets.exportPdf")}</button>
              <button role="menuitem" onclick={exportPng}><Icon name="image" size={14} />{t("sheets.exportPng")}</button>
              <button role="menuitem" onclick={printSheet}><Icon name="print" size={14} />{t("export.print")}</button>
            </div>
          {/if}
        </div>
      </div>
    </div>
  {/if}

  <div
    class="area"
    bind:this={scroller}
    role="presentation"
    onpointerdown={(e) => {
      if (!(e.target as HTMLElement).closest(".item")) selected = null;
      if (!(e.target as HTMLElement).closest(".export")) exportMenu = false;
    }}
  >
    {#if sheet && layout && sheet.layout === "flow" && !settings.value.sheets.tipDismissed}
      <div class="tip" role="note" style:width="{Math.min(paper.w * zoom, 640)}px">
        <span class="tip-icon"><Icon name="move" size={15} stroke={2} /></span>
        <span class="tip-text"><strong>{t("sheets.tipTitle")}</strong> {t("sheets.tipText")}</span>
        <button class="btn small primary" onclick={() => setLayout("free")}>{t("sheets.tipFree")}</button>
        <button class="tip-close" aria-label={t("sheets.tipDismiss")} title={t("sheets.tipDismiss")} onclick={() => settings.update((s) => (s.sheets.tipDismissed = true))}>
          <Icon name="close" size={12} stroke={2.2} />
        </button>
      </div>
    {/if}
    {#if sheet && layout}
      {#each Array.from({ length: layout.pages }, (_, i) => i) as page (page)}
        <div class="sheet-page" data-page={page} style:width="{paper.w * zoom}px" style:height="{paper.h * zoom}px" style:background={paperColor}>
          {#if sheet.layout === "flow" && sheet.columns > 1}
            {#each Array.from({ length: sheet.columns - 1 }, (_, c) => c) as c (c)}
              <span class="col-guide" style:left="{(MARGIN + (c + 1) * (layout.column + GUTTER) - GUTTER / 2) * zoom}px" style:top="{MARGIN * zoom}px" style:bottom="{MARGIN * zoom}px"></span>
            {/each}
          {/if}
          {#each layout.placed.filter((p) => p.page === page) as p (p.item.id)}
            <div
              class="item {p.item.type}"
              class:selected={selected === p.item.id}
              class:lifted={dragging?.item.id === p.item.id}
              role="button"
              tabindex="-1"
              aria-label={p.item.type === "snip" ? (p.item.source.path ? t("sheets.snipFrom", { name: p.item.source.name, page: p.item.source.page }) : p.item.source.name) : p.item.text}
              style:left="{p.x * zoom}px"
              style:top="{p.y * zoom}px"
              style:width="{p.w * zoom}px"
              style:height="{p.h * zoom}px"
              style:font-size="{TITLE_SIZE * zoom}px"
              onpointerdown={(e) => onItemDown(e, p, "move")}
              ondblclick={() => (p.item.type === "snip" ? openSource(p) : startEditing(p.item.id))}
            >
              {#if p.item.type === "snip"}
                <SheetImage name={p.item.image} alt={p.item.source.path ? t("sheets.snipFrom", { name: p.item.source.name, page: p.item.source.page }) : p.item.source.name} />
              {:else if p.item.type === "text"}
                {#if editing === p.item.id}
                  <textarea
                    class="text-edit"
                    bind:value={draft}
                    use:focusOnMount
                    maxlength={TEXT_MAX_CHARS}
                    style:font-size="{p.item.size * zoom}px"
                    style:min-height="{p.h * zoom}px"
                    onpointerdown={(e) => e.stopPropagation()}
                    onblur={() => finishEditing(true)}
                    onkeydown={(e) => {
                      if (e.key === "Escape") finishEditing(false);
                      else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) finishEditing(true);
                      e.stopPropagation();
                    }}
                  ></textarea>
                {:else}
                  <div class="text-box" style:font-size="{p.item.size * zoom}px" style:line-height="{p.item.size * TEXT_LINE * zoom}px">
                    {#each wrapText(p.item.text, p.item.size, p.w) as line, i (i)}<div class="line">{line || "\u00a0"}</div>{/each}
                  </div>
                {/if}
              {:else if editing === p.item.id}
                <input
                  class="title-edit"
                  bind:value={draft}
                  use:focusOnMount
                  maxlength="200"
                  onpointerdown={(e) => e.stopPropagation()}
                  onblur={() => finishEditing(true)}
                  onkeydown={(e) => {
                    if (e.key === "Enter") finishEditing(true);
                    else if (e.key === "Escape") finishEditing(false);
                    e.stopPropagation();
                  }}
                />
              {:else}
                <span class="title-text">{p.item.text}</span>
              {/if}
              {#if selected === p.item.id && !drag?.moved}
                <span class="handle" role="presentation" onpointerdown={(e) => onItemDown(e, p, "resize")}></span>
              {/if}
            </div>
          {/each}
          {#if guides && guides.page === page}
            {#each guides.vertical as gx (gx)}
              <span class="guide v" style:left="{gx * zoom}px"></span>
            {/each}
            {#each guides.horizontal as gy (gy)}
              <span class="guide h" style:top="{gy * zoom}px"></span>
            {/each}
          {/if}
          {#if indicator && indicator.page === page}
            <span class="drop" style:left="{indicator.x * zoom}px" style:top="{indicator.y * zoom - 1}px" style:width="{indicator.w * zoom}px"></span>
          {/if}
          {#if !sheet.items.length && page === 0}
            <div class="empty">
              <span class="empty-icon"><Icon name="snip" size={26} stroke={1.6} /></span>
              <h3>{t("sheets.emptyTitle")}</h3>
              <p>{t("sheets.emptyText")}</p>
            </div>
          {/if}
          <span class="page-no">{page + 1}</span>
        </div>
      {/each}
    {:else if !loading}
      <p class="missing">{t("sheets.missing")}</p>
    {/if}
  </div>

  {#if dragging && drag?.ghost}
    <div class="ghost {dragging.item.type}" style:left="{drag.ghost.x}px" style:top="{drag.ghost.y}px" style:width="{dragging.w * zoom}px" style:height="{dragging.h * zoom}px" style:font-size="{TITLE_SIZE * zoom}px">
      {#if dragging.item.type === "snip"}<SheetImage name={dragging.item.image} />{:else}<span class="title-text">{dragging.item.text.split("\n")[0]}</span>{/if}
    </div>
  {/if}

  {#if notice}
    <div class="notice" class:error={notice.error} role="status">
      <span>{notice.text}</span>
      {#if notice.path}<button class="link-button" onclick={() => revealInFolder(notice!.path!)}>{t("export.show")}</button>{/if}
      {#if notice.doc}<button class="link-button" onclick={() => session.open(notice!.doc!)}>{t("export.open")}</button>{/if}
      <button class="link-button" onclick={() => (notice = null)}>{t("dark.close")}</button>
    </div>
  {/if}
  {#if sheets.error}
    <div class="notice error" role="alert"><span>{sheets.error}</span></div>
  {/if}
</div>

<style>
  .file {
    display: none;
  }
  .size {
    min-width: 34px;
    text-align: center;
    font-size: 12px;
    color: var(--text-soft);
    font-variant-numeric: tabular-nums;
  }
  .text-box {
    width: 100%;
    font-family: Helvetica, Arial, sans-serif;
    color: #1c1c1f;
    white-space: pre;
    overflow: hidden;
  }
  .editor.dark .text-box {
    color: #e8e8ea;
  }
  .text-edit {
    position: absolute;
    left: 0;
    top: 0;
    width: 100%;
    padding: 0;
    border: none;
    outline: 2px solid var(--accent);
    resize: none;
    background: #fff;
    color: #1c1c1f;
    font-family: Helvetica, Arial, sans-serif;
    line-height: 1.3;
    z-index: 3;
  }
  .editor {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    background: var(--canvas, var(--bg));
  }
  .bar {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 16px;
    border-bottom: 1px solid var(--hairline);
    background: var(--bg);
    min-width: 0;
  }
  .title-input {
    min-width: 120px;
    flex: 0 1 280px;
    height: 30px;
    padding: 0 8px;
    border: 1px solid transparent;
    border-radius: var(--radius-m);
    background: transparent;
    color: var(--text);
    font-size: 15px;
    font-weight: 600;
    outline: none;
  }
  .title-input:hover {
    background: var(--hover);
  }
  .title-input:focus {
    border-color: var(--accent);
    background: var(--field);
  }
  .count {
    color: var(--text-muted);
    font-size: 12px;
    white-space: nowrap;
  }
  .tools {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    justify-content: flex-end;
  }
  .sep {
    width: 1px;
    height: 20px;
    background: var(--hairline);
  }
  .seg {
    display: flex;
    gap: 2px;
    padding: 2px;
    border-radius: 8px;
    background: var(--segment);
  }
  .seg button {
    height: 24px;
    min-width: 26px;
    padding: 0 10px;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: var(--text-soft);
    font-size: 12.5px;
  }
  .seg button[aria-checked="true"] {
    background: var(--segment-on);
    color: var(--text);
    font-weight: 500;
    box-shadow: var(--segment-shadow);
  }
  .zoom {
    display: flex;
    align-items: center;
  }
  .zoom-value {
    min-width: 46px;
    height: 26px;
    border: none;
    background: transparent;
    color: var(--text-soft);
    font-variant-numeric: tabular-nums;
    font-size: 12.5px;
  }
  .export {
    position: relative;
  }
  .menu {
    position: absolute;
    right: 0;
    top: calc(100% + 6px);
    z-index: 20;
    min-width: 190px;
    padding: 5px;
    border-radius: 10px;
    background: var(--surface-raised);
    box-shadow: var(--pop-shadow);
    display: flex;
    flex-direction: column;
  }
  .menu button {
    display: flex;
    align-items: center;
    gap: 9px;
    height: 32px;
    padding: 0 10px;
    border: none;
    border-radius: 7px;
    background: transparent;
    color: var(--text);
    text-align: left;
  }
  .menu button:hover {
    background: var(--hover);
  }
  .area {
    flex: 1;
    overflow: auto;
    padding: 28px 40px 60px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 24px;
  }
  .tip {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 10px 10px 12px;
    border-radius: 12px;
    background: var(--surface-raised);
    box-shadow: var(--pop-shadow);
    flex-shrink: 0;
  }
  .tip-icon {
    width: 28px;
    height: 28px;
    flex-shrink: 0;
    display: grid;
    place-items: center;
    border-radius: 8px;
    background: var(--accent-soft);
    color: var(--accent);
  }
  .tip-text {
    flex: 1;
    min-width: 0;
    font-size: 12.5px;
    line-height: 1.45;
    color: var(--text-soft);
  }
  .tip-text strong {
    color: var(--text);
  }
  .tip-close {
    width: 26px;
    height: 26px;
    flex-shrink: 0;
    display: grid;
    place-items: center;
    border: none;
    border-radius: 13px;
    background: transparent;
    color: var(--text-muted);
  }
  .tip-close:hover {
    background: var(--hover);
  }
  .sheet-page {
    position: relative;
    flex-shrink: 0;
    border-radius: 3px;
    box-shadow:
      0 1px 2px rgba(0, 0, 0, 0.08),
      0 6px 24px rgba(0, 0, 0, 0.08);
  }
  .dark .sheet-page {
    box-shadow:
      0 0 0 1px rgba(255, 255, 255, 0.06),
      0 8px 30px rgba(0, 0, 0, 0.5);
  }
  .col-guide {
    position: absolute;
    width: 0;
    border-left: 1px dashed rgba(128, 128, 128, 0.18);
    pointer-events: none;
  }
  .item {
    position: absolute;
    cursor: grab;
    border-radius: 2px;
    outline: 1px solid transparent;
    outline-offset: 2px;
    touch-action: none;
  }
  .item:hover {
    outline-color: color-mix(in srgb, var(--accent) 35%, transparent);
  }
  .item.selected {
    outline: 1.5px solid var(--accent);
  }
  .item.lifted {
    opacity: 0.25;
  }
  /* On dark paper the snips (saved on white) are shown inverted; exports stay white. */
  .dark .item.snip :global(img),
  .dark .ghost.snip :global(img) {
    /* White paper becomes black, which "screen" turns into the sheet's own dark paper. */
    filter: invert(1) hue-rotate(180deg) brightness(0.9);
    mix-blend-mode: screen;
  }
  .title-text,
  .title-edit {
    display: flex;
    align-items: center;
    height: 100%;
    font-weight: 650;
    letter-spacing: -0.01em;
    color: #1c1c1f;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .dark .title-text,
  .dark .title-edit {
    color: #ececf0;
  }
  .item.title {
    border-bottom: 1px solid rgba(128, 128, 128, 0.25);
  }
  .title-edit {
    width: 100%;
    padding: 0;
    border: none;
    background: transparent;
    font: inherit;
    font-weight: 650;
    outline: none;
  }
  .handle {
    position: absolute;
    right: -6px;
    bottom: -6px;
    width: 12px;
    height: 12px;
    border-radius: 6px;
    background: var(--accent);
    border: 2px solid #fff;
    cursor: nwse-resize;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
  }
  .selection {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .danger-text {
    color: var(--danger);
  }
  .guide {
    position: absolute;
    z-index: 4;
    pointer-events: none;
    background: #ff3b8d;
  }
  .guide.v {
    top: 0;
    bottom: 0;
    width: 1px;
  }
  .guide.h {
    left: 0;
    right: 0;
    height: 1px;
  }
  .drop {
    position: absolute;
    height: 2px;
    border-radius: 1px;
    background: var(--accent);
    pointer-events: none;
  }
  .ghost {
    position: fixed;
    z-index: 80;
    pointer-events: none;
    opacity: 0.85;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.25);
    background: #fff;
    border-radius: 2px;
  }
  .dark .ghost {
    background: #1c1c1e;
  }
  .empty {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 40px;
    text-align: center;
    color: #6b6b72;
    pointer-events: none;
  }
  .empty h3 {
    margin: 6px 0 0;
    font-size: 16px;
    color: #1c1c1f;
  }
  .dark .empty h3 {
    color: #ececf0;
  }
  .empty p {
    margin: 0;
    max-width: 320px;
    line-height: 1.5;
  }
  .empty-icon {
    width: 52px;
    height: 52px;
    display: grid;
    place-items: center;
    border-radius: 14px;
    background: var(--warm-soft);
    color: var(--warm-text);
  }
  .page-no {
    position: absolute;
    right: 12px;
    bottom: 8px;
    font-size: 10px;
    color: rgba(128, 128, 128, 0.6);
    pointer-events: none;
  }
  .missing {
    color: var(--text-muted);
  }
  .notice {
    position: absolute;
    left: 50%;
    bottom: 24px;
    transform: translateX(-50%);
    z-index: 30;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 16px;
    border-radius: 10px;
    background: var(--surface-raised);
    box-shadow: var(--pop-shadow);
    color: var(--text);
    white-space: nowrap;
  }
  .notice.error {
    color: var(--danger);
  }
</style>
