<script lang="ts">
  /** A centred modal with a dimmed backdrop. Escape closes it; focus stays inside. */
  import type { Snippet } from "svelte";
  import { onMount } from "svelte";

  interface Props {
    labelledBy: string;
    width?: number;
    /** Called on Escape. Omit to make the dialog require an explicit choice. */
    onClose?: () => void;
    children: Snippet;
  }
  let { labelledBy, width = 420, onClose, children }: Props = $props();
  let panel: HTMLElement;

  onMount(() => {
    const previous = document.activeElement as HTMLElement | null;
    const focusables = () => [...panel.querySelectorAll<HTMLElement>("button, input, select, textarea, [tabindex]:not([tabindex='-1'])")].filter((el) => !el.hasAttribute("disabled"));
    (panel.querySelector<HTMLElement>("input, .primary") ?? focusables()[0])?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && onClose) {
        e.stopPropagation();
        onClose();
      } else if (e.key === "Tab") {
        const items = focusables();
        if (!items.length) return;
        const first = items[0]!;
        const last = items[items.length - 1]!;
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      previous?.focus?.({ preventScroll: true });
    };
  });
</script>

<div class="backdrop">
  <div class="dialog" role="dialog" aria-modal="true" aria-labelledby={labelledBy} bind:this={panel} style:width="{width}px">
    {@render children()}
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 100;
    display: grid;
    place-items: center;
    padding: 24px;
    background: var(--scrim);
    animation: fade var(--medium) var(--ease);
  }
  .dialog {
    max-width: 100%;
    max-height: 100%;
    overflow: auto;
    display: flex;
    flex-direction: column;
    gap: 18px;
    padding: 28px 28px 22px;
    border-radius: var(--radius-xl);
    background: var(--surface-raised);
    color: var(--text);
    box-shadow: var(--pop-shadow);
    animation: rise var(--medium) var(--ease);
  }
  @keyframes fade {
    from {
      opacity: 0;
    }
  }
  @keyframes rise {
    from {
      opacity: 0;
      transform: translateY(8px) scale(0.98);
    }
  }
</style>
