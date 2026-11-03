<script lang="ts">
  /**
   * A small panel anchored under a button (timer, reading settings). Closes on Escape or a click
   * outside it; focus moves in when it opens and back to the button when it closes.
   */
  import type { Snippet } from "svelte";
  import { onMount } from "svelte";

  interface Props {
    anchor: HTMLElement | null;
    label: string;
    width?: number;
    onClose: () => void;
    children: Snippet;
  }
  let { anchor, label, width = 340, onClose, children }: Props = $props();

  let panel: HTMLDivElement;
  let top = $state(0);
  let left = $state(0);

  function place() {
    if (!anchor) return;
    const r = anchor.getBoundingClientRect();
    const margin = 8;
    top = r.bottom + 6;
    left = Math.min(Math.max(margin, r.right - width), window.innerWidth - width - margin);
  }

  onMount(() => {
    place();
    const returnFocus = document.activeElement as HTMLElement | null;
    (panel.querySelector<HTMLElement>("[data-autofocus]") ?? panel.querySelector<HTMLElement>("button, input, select, [tabindex]"))?.focus({ preventScroll: true });
    const onPointer = (e: PointerEvent) => {
      const target = e.target as Node;
      if (!panel.contains(target) && !anchor?.contains(target)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("pointerdown", onPointer, true);
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("pointerdown", onPointer, true);
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("resize", place);
      returnFocus?.focus?.({ preventScroll: true });
    };
  });
</script>

<div class="popover" role="dialog" aria-label={label} bind:this={panel} style:top="{top}px" style:left="{left}px" style:width="{width}px">
  {@render children()}
</div>

<style>
  .popover {
    position: fixed;
    z-index: 50;
    max-height: calc(100vh - var(--bar-height) - 24px);
    overflow: auto;
    border-radius: 14px;
    background: var(--surface-raised);
    color: var(--text);
    box-shadow: var(--pop-shadow);
    animation: pop var(--medium) var(--ease);
    transform-origin: top right;
  }
  @keyframes pop {
    from {
      opacity: 0;
      transform: scale(0.97) translateY(-4px);
    }
  }
</style>
