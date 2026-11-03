<script lang="ts">
  import { t } from "../../i18n";
  import { session } from "../session.svelte";
  import Icon from "../../ui/Icon.svelte";

  interface Props {
    onClose: () => void;
    input?: HTMLInputElement | null;
  }
  let { onClose, input = $bindable(null) }: Props = $props();
  let query = $state("");
  const matches = $derived(session.view?.findMatches ?? null);

  $effect(() => {
    input?.focus();
    input?.select();
  });

  function close() {
    session.controller?.clearFind();
    onClose();
  }
</script>

<div class="find" role="search">
  <Icon name="search" size={14} />
  <input
    bind:this={input}
    bind:value={query}
    placeholder={t("find.placeholder")}
    aria-label={t("find.placeholder")}
    spellcheck="false"
    oninput={() => (query ? session.controller?.find(query) : session.controller?.clearFind())}
    onkeydown={(e) => {
      if (e.key === "Enter" && query) session.controller?.find(query, e.shiftKey);
      else if (e.key === "Escape") close();
    }}
  />
  {#if query}
    <span class="count" aria-live="polite">
      {matches && matches.total > 0 ? t("find.count", { current: matches.current, total: matches.total }) : matches ? t("find.none") : ""}
    </span>
  {/if}
  <button aria-label={t("find.previous")} title={t("find.previous")} disabled={!query} onclick={() => session.controller?.find(query, true)}>
    <Icon name="up" size={14} stroke={2} />
  </button>
  <button aria-label={t("find.next")} title={t("find.next")} disabled={!query} onclick={() => session.controller?.find(query)}>
    <Icon name="down" size={14} stroke={2} />
  </button>
  <button aria-label={t("find.close")} title={t("find.close")} onclick={close}>
    <Icon name="close" size={14} stroke={2} />
  </button>
</div>

<style>
  .find {
    position: absolute;
    top: 12px;
    right: 20px;
    z-index: 6;
    display: flex;
    align-items: center;
    gap: 4px;
    height: 40px;
    padding: 0 6px 0 12px;
    border-radius: 11px;
    background: var(--surface-raised);
    box-shadow: var(--pop-shadow);
    color: var(--text-muted);
    animation: drop var(--medium) var(--ease);
  }
  input {
    width: 220px;
    border: none;
    outline: none;
    background: transparent;
    color: var(--text);
    margin-left: 4px;
  }
  .count {
    font-size: 12px;
    white-space: nowrap;
    padding: 0 6px;
    font-variant-numeric: tabular-nums;
  }
  button {
    width: 28px;
    height: 28px;
    border: none;
    border-radius: 7px;
    background: none;
    color: var(--text-soft);
    display: grid;
    place-items: center;
  }
  button:hover:not(:disabled) {
    background: var(--hover);
  }
  button:disabled {
    opacity: 0.35;
  }
  @keyframes drop {
    from {
      opacity: 0;
      transform: translateY(-4px);
    }
  }
</style>
