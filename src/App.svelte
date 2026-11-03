<script lang="ts">
  import { onMount } from "svelte";
  import { t } from "./lib/i18n";
  import { detectPlatform, formatShortcut, isPrimaryModifier } from "./lib/platform/shortcuts";
  import {
    documentUrl,
    onDocumentsOpened,
    openPdfDialog,
    takePendingDocuments,
    type DocumentRef,
  } from "./lib/ipc/documents";
  import { openExternal } from "./lib/ipc/system";
  import { loadDocument, PasswordCancelledError, type LoadedPdf } from "./lib/viewer/pdfjs";
  import type { ViewerController, ViewerState } from "./lib/viewer/ViewerController";
  import PdfView from "./lib/viewer/PdfView.svelte";
  import Toolbar from "./lib/ui/Toolbar.svelte";
  import PasswordDialog from "./lib/ui/PasswordDialog.svelte";
  import ReadingSettingsPanel from "./lib/ui/ReadingSettingsPanel.svelte";
  import { settings } from "./lib/settings/store.svelte";
  import { readingMode } from "./lib/dark/readingMode.svelte";

  const platform = detectPlatform(navigator.userAgent);
  const openShortcut = formatShortcut("mod+o", platform);
  const darkShortcut = formatShortcut("mod+shift+d", platform);
  let showReadingSettings = $state(false);

  let current = $state<{ ref: DocumentRef; pdf: LoadedPdf } | null>(null);
  let loadingName = $state<string | null>(null);
  let error = $state<string | null>(null);
  let viewerState = $state<ViewerState | null>(null);
  let controller = $state<ViewerController | null>(null);
  let findInput = $state<HTMLInputElement | null>(null);
  let passwordRequest = $state<{ name: string; retry: boolean; resolve: (p: string | null) => void } | null>(null);

  async function open(ref: DocumentRef) {
    loadingName = ref.name;
    error = null;
    try {
      const pdf = await loadDocument(documentUrl(ref), (retry) =>
        new Promise((resolve) => (passwordRequest = { name: ref.name, retry, resolve })),
      );
      const previous = current;
      current = { ref, pdf };
      await previous?.pdf.close();
    } catch (err) {
      if (!(err instanceof PasswordCancelledError)) {
        error = t("open.error", { name: ref.name, reason: err instanceof Error ? err.message : String(err) });
      }
    } finally {
      loadingName = null;
    }
  }

  async function openFromDialog() {
    const [first] = await openPdfDialog();
    if (first) await open(first);
  }

  function answerPassword(password: string | null) {
    passwordRequest?.resolve(password);
    passwordRequest = null;
  }

  function onKeydown(event: KeyboardEvent) {
    if (!isPrimaryModifier(event, platform)) return;
    const key = event.key.toLowerCase();
    if (event.shiftKey && key === "d") {
      event.preventDefault();
      readingMode.toggle();
      return;
    }
    const actions: Record<string, () => void> = {
      o: () => void openFromDialog(),
      f: () => findInput?.focus(),
      "=": () => controller?.zoomIn(),
      "+": () => controller?.zoomIn(),
      "-": () => controller?.zoomOut(),
      "0": () => controller?.setScale("page-width"),
    };
    const action = actions[key];
    if (action) {
      event.preventDefault();
      action();
    }
  }

  onMount(() => {
    let stopReadingMode = () => {};
    const unlisten = onDocumentsOpened(([first]) => first && open(first));
    // Settings first, so the first page is already drawn in the right theme.
    void settings.load().then(() => {
      stopReadingMode = readingMode.start();
      return takePendingDocuments().then(([first]) => first && open(first));
    });
    return () => {
      stopReadingMode();
      void unlisten.then((stop) => stop());
    };
  });
</script>

<svelte:window onkeydown={onKeydown} />

<div class="app">
  <Toolbar
    view={current ? viewerState : null}
    {openShortcut}
    onOpen={openFromDialog}
    onPage={(p) => controller?.goToPage(p)}
    onZoomIn={() => controller?.zoomIn()}
    onZoomOut={() => controller?.zoomOut()}
    onFitWidth={() => controller?.setScale("page-width")}
    onFind={(q, prev) => controller?.find(q, prev)}
    onFindClear={() => controller?.clearFind()}
    isDark={readingMode.isDark}
    {darkShortcut}
    onToggleDark={() => readingMode.toggle()}
    onReadingSettings={() => (showReadingSettings = !showReadingSettings)}
    bind:findInput
  />

  <main>
    <PdfView
      doc={current?.pdf.doc ?? null}
      onState={(s) => (viewerState = s)}
      onExternalLink={(url) => void openExternal(url)}
      bind:controller
    />

    {#if showReadingSettings}
      <ReadingSettingsPanel onClose={() => (showReadingSettings = false)} />
    {/if}

    {#if !current || loadingName || error}
      <div class="overlay">
        {#if loadingName}
          <p>{t("open.loading", { name: loadingName })}</p>
        {:else if error}
          <p class="error">{error}</p>
        {:else}
          <h1>{t("open.empty")}</h1>
          <p class="muted">{t("open.hint", { shortcut: openShortcut })}</p>
        {/if}
      </div>
    {/if}
  </main>
</div>

{#if passwordRequest}
  <PasswordDialog name={passwordRequest.name} retry={passwordRequest.retry} onSubmit={answerPassword} />
{/if}

<style>
  .app {
    height: 100vh;
    display: grid;
    grid-template-rows: auto 1fr;
  }
  main {
    position: relative;
    overflow: hidden;
  }
  .overlay {
    position: absolute;
    inset: 0;
    display: grid;
    place-content: center;
    text-align: center;
    gap: var(--space-2);
    background: var(--canvas-bg);
  }
  h1 {
    margin: 0;
    font-size: 20px;
    font-weight: 600;
  }
  p {
    margin: 0;
  }
  .muted {
    color: var(--text-muted);
    font-size: 13px;
  }
  .error {
    max-width: 520px;
    color: var(--danger);
  }
</style>
