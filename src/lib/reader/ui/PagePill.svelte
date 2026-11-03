<script lang="ts">
  /** Floating page and zoom controls at the bottom of the page area. */
  import { t } from "../../i18n";
  import { session } from "../session.svelte";
  import Icon from "../../ui/Icon.svelte";

  let editing = $state<string | null>(null);
  const view = $derived(session.view);
  const zoom = $derived(Math.round((view?.scale ?? 1) * 100));

  function commit() {
    if (editing === null) return;
    const n = Number.parseInt(editing, 10);
    editing = null;
    if (Number.isFinite(n)) session.controller?.goToPage(n);
  }
</script>

{#if view && view.pages > 0}
  <div class="pill" role="toolbar" aria-label="{t('nav.page')} · {t('zoom.fitWidth')}">
    <button aria-label={t("nav.previous")} title={t("nav.previous")} disabled={view.page <= 1} onclick={() => session.controller?.goToPage(view.page - 1)}>
      <Icon name="back" size={15} stroke={2} />
    </button>
    <label class="page">
      <span class="visually-hidden">{t("nav.page")}</span>
      <input
        value={editing ?? String(view.page)}
        inputmode="numeric"
        style:width="{Math.max(2, String(view.pages).length) + 2}ch"
        onfocus={(e) => e.currentTarget.select()}
        oninput={(e) => (editing = e.currentTarget.value.replace(/\D/g, ""))}
        onblur={commit}
        onkeydown={(e) => {
          if (e.key === "Enter") {
            commit();
            e.currentTarget.blur();
          } else if (e.key === "Escape") {
            editing = null;
            e.currentTarget.blur();
          }
        }}
      />
      {t("nav.of", { pages: view.pages })}
    </label>
    <button aria-label={t("nav.next")} title={t("nav.next")} disabled={view.page >= view.pages} onclick={() => session.controller?.goToPage(view.page + 1)}>
      <Icon name="forward" size={15} stroke={2} />
    </button>
    <span class="divider"></span>
    <button aria-label={t("zoom.out")} title={t("zoom.out")} onclick={() => session.controller?.zoomOut()}>
      <Icon name="minus" size={15} stroke={2} />
    </button>
    <button class="zoom" title={t("zoom.fitWidth")} onclick={() => session.controller?.setScale("page-width")}>
      {t("zoom.percent", { percent: zoom })}
    </button>
    <button aria-label={t("zoom.in")} title={t("zoom.in")} onclick={() => session.controller?.zoomIn()}>
      <Icon name="plus" size={15} stroke={2} />
    </button>
  </div>
{/if}

<style>
  .pill {
    position: absolute;
    bottom: 20px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 5;
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 5px;
    border-radius: 12px;
    background: color-mix(in srgb, var(--surface-raised) 92%, transparent);
    backdrop-filter: blur(16px) saturate(1.4);
    box-shadow: var(--pop-shadow);
    color: var(--text);
  }
  button {
    min-width: 30px;
    height: 30px;
    border: none;
    border-radius: 8px;
    background: transparent;
    color: var(--text-soft);
    display: grid;
    place-items: center;
  }
  button:hover:not(:disabled) {
    background: var(--hover);
    color: var(--text);
  }
  button:disabled {
    opacity: 0.35;
  }
  .zoom {
    padding: 0 8px;
    color: var(--text);
    font-variant-numeric: tabular-nums;
    min-width: 56px;
  }
  .page {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 0 4px;
    color: var(--text-muted);
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }
  input {
    height: 26px;
    border: none;
    border-radius: 6px;
    background: var(--field);
    text-align: center;
    font-variant-numeric: tabular-nums;
    outline: none;
  }
  input:focus {
    box-shadow: 0 0 0 2px var(--accent);
  }
  .divider {
    width: 1px;
    height: 18px;
    margin: 0 4px;
    background: var(--hairline);
  }
</style>
