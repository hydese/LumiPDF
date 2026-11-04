<script lang="ts">
  /** Shown under a snipped area: copy it to the clipboard or save it as a PNG. */
  import { t } from "../../i18n";
  import Icon from "../../ui/Icon.svelte";

  interface Props {
    at: DOMRect;
    onCopy: () => Promise<void>;
    onSave: () => Promise<boolean>;
    onClose: () => void;
  }
  let { at, onCopy, onSave, onClose }: Props = $props();
  let status = $state<string | null>(null);
  let busy = $state(false);

  const top = $derived(Math.min(at.bottom + 10, window.innerHeight - 56));
  const left = $derived(Math.min(Math.max(8, at.left + at.width / 2), window.innerWidth - 8));

  async function run(action: () => Promise<unknown>, done: string) {
    busy = true;
    try {
      const ok = await action();
      if (ok === false) return; // save dialog cancelled
      status = done;
      setTimeout(onClose, 900);
    } catch (err) {
      status = t("snip.failed", { reason: err instanceof Error ? err.message : String((err as { message?: string })?.message ?? err) });
    } finally {
      busy = false;
    }
  }
</script>

<svelte:window onkeydown={(e) => e.key === "Escape" && onClose()} />

<div class="menu" role="menu" style:top="{top}px" style:left="{left}px">
  {#if status}
    <span class="status"><Icon name="check" size={14} stroke={2.4} />{status}</span>
  {:else}
    <button role="menuitem" disabled={busy} onclick={() => run(onCopy, t("snip.copied"))}><Icon name="copy" size={14} />{t("snip.copy")}</button>
    <button role="menuitem" class="primary" disabled={busy} onclick={() => run(onSave, t("snip.saved"))}><Icon name="save" size={14} />{t("snip.save")}</button>
    <button role="menuitem" class="icon" aria-label={t("snip.close")} title={t("snip.close")} onclick={onClose}><Icon name="close" size={13} stroke={2.2} /></button>
  {/if}
</div>

<style>
  .menu {
    position: fixed;
    z-index: 55;
    transform: translateX(-50%);
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 5px;
    border-radius: 12px;
    background: var(--surface-raised);
    box-shadow: var(--pop-shadow);
    animation: pop var(--fast) var(--ease);
    white-space: nowrap;
  }
  button {
    display: flex;
    align-items: center;
    gap: 6px;
    height: 30px;
    padding: 0 12px;
    border: none;
    border-radius: 8px;
    background: transparent;
    color: var(--text);
    font-weight: 500;
  }
  button:hover:not(:disabled) {
    background: var(--hover);
  }
  button.primary {
    background: var(--accent);
    color: var(--on-accent);
  }
  button.primary:hover:not(:disabled) {
    background: var(--accent-hover);
  }
  button.icon {
    width: 30px;
    padding: 0;
    justify-content: center;
    color: var(--text-muted);
  }
  button:disabled {
    opacity: 0.6;
  }
  .status {
    display: flex;
    align-items: center;
    gap: 6px;
    height: 30px;
    padding: 0 12px;
    color: var(--ok);
    font-weight: 600;
  }
  @keyframes pop {
    from {
      opacity: 0;
      transform: translate(-50%, -4px);
    }
  }
</style>
