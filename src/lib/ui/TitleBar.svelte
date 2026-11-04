<script lang="ts">
  /**
   * The unified top bar: it is the window's title bar too. Empty areas drag the window and a
   * double-click maximizes (Tauri's drag region). On macOS the traffic lights sit on the left,
   * so the content starts further right and no caption buttons are drawn.
   */
  import type { Snippet } from "svelte";
  import { t } from "../i18n";
  import { closeWindow, customCaptionButtons, minimizeWindow, platform, toggleMaximizeWindow, watchMaximized } from "../platform/window";

  interface Props {
    left?: Snippet;
    center?: Snippet;
    right?: Snippet;
    /** "tabs": the middle grows and starts at the left (Reader tabs); default: centred title. */
    layout?: "centered" | "tabs";
  }
  let { left, center, right, layout = "centered" }: Props = $props();

  let maximized = $state(false);
  $effect(() => watchMaximized((m) => (maximized = m)));
</script>

<header class="bar" class:mac={platform === "macos"} class:tabs={layout === "tabs"} data-tauri-drag-region>
  <div class="side left" data-tauri-drag-region>{@render left?.()}</div>
  <div class="center" data-tauri-drag-region>{@render center?.()}</div>
  <div class="side right" data-tauri-drag-region>
    {@render right?.()}
    {#if customCaptionButtons}
      <div class="captions">
        <button class="caption" aria-label={t("window.minimize")} onclick={minimizeWindow}>
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M0 5h10" stroke="currentColor" stroke-width="1" /></svg>
        </button>
        <button class="caption" aria-label={maximized ? t("window.restore") : t("window.maximize")} onclick={toggleMaximizeWindow}>
          {#if maximized}
            <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
              <rect x="0.5" y="2.5" width="7" height="7" rx="1" fill="none" stroke="currentColor" stroke-width="1" />
              <path d="M2.5 2.5V1.5a1 1 0 0 1 1-1h5a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1h-1" fill="none" stroke="currentColor" stroke-width="1" />
            </svg>
          {:else}
            <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><rect x="0.5" y="0.5" width="9" height="9" rx="1.5" fill="none" stroke="currentColor" stroke-width="1" /></svg>
          {/if}
        </button>
        <button class="caption close" aria-label={t("window.close")} onclick={closeWindow}>
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M0.5 0.5l9 9M9.5 0.5l-9 9" stroke="currentColor" stroke-width="1" /></svg>
        </button>
      </div>
    {/if}
  </div>
</header>

<style>
  .bar {
    height: var(--bar-height);
    flex-shrink: 0;
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, auto) minmax(0, 1fr);
    align-items: center;
    gap: var(--space-4);
    padding-left: var(--space-3);
    background: var(--bar);
    border-bottom: 1px solid var(--hairline);
    color: var(--text);
    position: relative;
    z-index: 10;
  }
  .bar.tabs {
    grid-template-columns: auto minmax(0, 1fr) auto;
    gap: var(--space-3);
  }
  .bar.tabs .center {
    justify-content: flex-start;
    align-items: flex-end;
  }
  .bar.mac {
    padding-left: 84px; /* room for the traffic lights */
  }
  .side {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    min-width: 0;
    height: 100%;
  }
  .right {
    justify-content: flex-end;
    gap: 2px;
  }
  .bar.mac .right {
    padding-right: var(--space-3);
  }
  .center {
    display: flex;
    justify-content: center;
    align-items: center;
    min-width: 0;
    height: 100%;
  }
  .captions {
    display: flex;
    align-self: stretch;
    margin-left: var(--space-3);
  }
  .caption {
    width: 46px;
    height: 100%;
    border: none;
    background: transparent;
    color: var(--text-soft);
    display: grid;
    place-items: center;
    transition: background var(--fast) var(--ease);
  }
  .caption:hover {
    background: var(--hover);
  }
  .caption.close:hover {
    background: var(--close-hover);
    color: #fff;
  }
  .caption:focus-visible {
    outline-offset: -2px;
  }
</style>
