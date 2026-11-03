<script lang="ts">
  import "pdfjs-dist/web/pdf_viewer.css";
  import { onDestroy, onMount } from "svelte";
  import type { PDFDocumentProxy } from "pdfjs-dist";
  import { ViewerController, type ViewerState } from "./ViewerController";

  interface Props {
    doc: PDFDocumentProxy | null;
    onState: (state: ViewerState) => void;
    onExternalLink: (url: string) => void;
    controller?: ViewerController | null;
  }

  let { doc, onState, onExternalLink, controller = $bindable(null) }: Props = $props();
  let container: HTMLDivElement;

  onMount(() => {
    controller = new ViewerController({ container, onState, onExternalLink });
  });

  onDestroy(() => controller?.destroy());

  $effect(() => {
    controller?.setDocument(doc);
  });
</script>

<div class="viewer-container" bind:this={container}>
  <div class="pdfViewer"></div>
</div>

<style>
  .viewer-container :global(.pdfViewer .page) {
    background-color: var(--page-bg, #ffffff);
  }
  .viewer-container {
    position: absolute;
    inset: 0;
    overflow: auto;
    background: var(--canvas-bg);
  }
</style>
