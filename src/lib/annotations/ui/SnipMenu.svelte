<script lang="ts">
  import { errorText } from "../../i18n/errors";
  /** Shown under a snipped area: add it to a formula sheet, copy it, or save it as a PNG. */
  import { t } from "../../i18n";
  import Icon from "../../ui/Icon.svelte";
  import { sheets } from "../../sheets/sheets.svelte";
  import { settings } from "../../settings/store.svelte";
  import { studyTools } from "../../app/studyTools.svelte";

  interface Props {
    at: DOMRect;
    onCopy: () => Promise<void>;
    onSave: () => Promise<boolean>;
    /** Adds the snip to a sheet (its id, "new", or undefined for the last used); resolves to the sheet. */
    onAddToSheet: (target?: string) => Promise<{ id: string; title: string }>;
    onOpenSheet: (id: string, title: string) => void;
    onClose: () => void;
  }
  let { at, onCopy, onSave, onAddToSheet, onOpenSheet, onClose }: Props = $props();
  let status = $state<string | null>(null);
  let busy = $state(false);
  let choosing = $state(false);
  let added = $state<{ id: string; title: string } | null>(null);

  const last = $derived(sheets.list.find((s) => s.id === settings.value.sheets.last) ?? null);

  async function add(target?: string) {
    choosing = false;
    busy = true;
    try {
      added = await onAddToSheet(target);
      status = t("sheets.added", { title: added.title });
      setTimeout(() => {
        if (status) onClose();
      }, 2600);
    } catch (err) {
      status = t("snip.failed", { reason: errorText(err) });
    } finally {
      busy = false;
    }
  }

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
      status = t("snip.failed", { reason: errorText(err) });
    } finally {
      busy = false;
    }
  }
</script>

<svelte:window onkeydown={(e) => e.key === "Escape" && onClose()} />

<div class="menu" role="menu" style:top="{top}px" style:left="{left}px">
  {#if status}
    <span class="status"><Icon name="check" size={14} stroke={2.4} />{status}</span>
    {#if added}
      <button
        role="menuitem"
        onclick={() => {
          const a = added!;
          onClose();
          onOpenSheet(a.id, a.title);
        }}>{t("sheets.openSheet")}</button
      >
    {/if}
  {:else}
    {#if studyTools.sheets}
    <span class="split">
      <button role="menuitem" class="primary" disabled={busy} onclick={() => add()} title={last ? t("sheets.addTo", { title: last.title }) : t("sheets.addToNew")}>
        <Icon name="sheet" size={14} />{last ? t("sheets.addTo", { title: last.title }) : t("sheets.addToNew")}
      </button>
      <button role="menuitem" class="primary more" disabled={busy} aria-label={t("sheets.choose")} title={t("sheets.choose")} aria-expanded={choosing} onclick={() => (choosing = !choosing)}>
        <Icon name="down" size={13} stroke={2.2} />
      </button>
    </span>
    {/if}
    <button role="menuitem" disabled={busy} onclick={() => run(onCopy, t("snip.copied"))}><Icon name="copy" size={14} />{t("snip.copy")}</button>
    <button role="menuitem" class:primary={!studyTools.sheets} disabled={busy} onclick={() => run(onSave, t("snip.saved"))}><Icon name="save" size={14} />{t("snip.save")}</button>
    <button role="menuitem" class="icon" aria-label={t("snip.close")} title={t("snip.close")} onclick={onClose}><Icon name="close" size={13} stroke={2.2} /></button>
  {/if}
  {#if choosing}
    <div class="choose" role="menu">
      {#each sheets.list.slice(0, 8) as s (s.id)}
        <button role="menuitem" onclick={() => add(s.id)}><Icon name="sheet" size={13} />{s.title}</button>
      {/each}
      <button role="menuitem" onclick={() => add("new")}><Icon name="plus" size={13} stroke={2} />{t("sheets.new")}</button>
    </div>
  {/if}
</div>

<style>
  .split {
    display: flex;
    gap: 1px;
  }
  .split .primary:first-child {
    border-radius: 8px 0 0 8px;
    max-width: 260px;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .split .more {
    padding: 0 7px;
    border-radius: 0 8px 8px 0;
  }
  .choose {
    position: absolute;
    left: 5px;
    top: calc(100% + 6px);
    min-width: 220px;
    max-width: 320px;
    padding: 5px;
    border-radius: 10px;
    background: var(--surface-raised);
    box-shadow: var(--pop-shadow);
    display: flex;
    flex-direction: column;
  }
  .choose button {
    justify-content: flex-start;
    font-weight: 400;
    overflow: hidden;
    text-overflow: ellipsis;
  }
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
