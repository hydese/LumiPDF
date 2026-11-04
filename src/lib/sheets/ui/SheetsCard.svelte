<script lang="ts">
  /** Library card: your formula sheets, newest first; open one in a tab or start a new one. */
  import { formatWhen, t, tn } from "../../i18n";
  import { session } from "../../reader/session.svelte";
  import SourceCard from "../../library/ui/SourceCard.svelte";
  import Dialog from "../../ui/Dialog.svelte";
  import Icon from "../../ui/Icon.svelte";
  import { sheets } from "../sheets.svelte";
  import type { SheetSummary } from "../../ipc/sheets";

  let confirm = $state<SheetSummary | null>(null);

  async function create() {
    const sheet = await sheets.create();
    await session.openSheet(sheet.id, sheet.title);
  }

  async function remove(s: SheetSummary) {
    confirm = null;
    const tab = session.tabs.find((x) => x.path === `sheet:${s.id}`);
    if (tab) await session.close(tab.id);
    await sheets.remove(s.id);
  }
</script>

<SourceCard icon="sheet" tone="warm" title={t("sheets.title")} subtitle={sheets.list.length ? tn("library.summary.sheets", sheets.list.length) : undefined}>
  {#snippet action()}
    <button class="btn small" onclick={create}><Icon name="plus" size={13} stroke={2} />{t("sheets.new")}</button>
  {/snippet}
  {#if sheets.list.length}
    <ul>
      {#each sheets.list.slice(0, 5) as s (s.id)}
        <li>
          <button class="row" onclick={() => session.openSheet(s.id, s.title)} title={t("sheets.edited", { when: formatWhen(new Date(s.modified)) })}>
            <span class="icon"><Icon name="sheet" size={14} stroke={1.9} /></span>
            <span class="name">{s.title}</span>
            <span class="meta">{tn("sheets.snips", s.items)}</span>
          </button>
          <button class="hide" aria-label={t("sheets.deleteSheet")} title={t("sheets.deleteSheet")} onclick={() => (confirm = s)}>
            <Icon name="trash" size={12} stroke={2} />
          </button>
        </li>
      {/each}
    </ul>
  {:else}
    <p class="card-note">{t("sheets.cardEmpty")}</p>
  {/if}
</SourceCard>

{#if confirm}
  <Dialog labelledBy="sheet-delete-title" width={400} onClose={() => (confirm = null)}>
    <h2 id="sheet-delete-title" class="dialog-title">{t("sheets.deleteSheet")}</h2>
    <p class="dialog-text">{t("sheets.deleteConfirm", { title: confirm.title })}</p>
    <div class="dialog-actions">
      <button class="btn" onclick={() => (confirm = null)}>{t("export.cancel")}</button>
      <button class="btn danger" onclick={() => remove(confirm!)}>{t("sheets.deleteSheet")}</button>
    </div>
  </Dialog>
{/if}

<style>
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  li {
    display: flex;
    align-items: center;
    border-radius: 7px;
  }
  li:hover {
    background: var(--hover);
  }
  .row {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 10px;
    height: 36px;
    padding: 0 8px;
    border: none;
    background: transparent;
    color: var(--text);
    text-align: left;
  }
  .icon {
    width: 26px;
    height: 26px;
    flex-shrink: 0;
    display: grid;
    place-items: center;
    border-radius: 6px;
    background: var(--warm-soft);
    color: var(--warm-text);
  }
  .name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .meta {
    color: var(--text-muted);
    font-size: 12px;
    white-space: nowrap;
  }
  .hide {
    width: 26px;
    height: 26px;
    margin-right: 4px;
    display: grid;
    place-items: center;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: var(--text-faint);
    opacity: 0;
  }
  li:hover .hide,
  .hide:focus-visible {
    opacity: 1;
  }
  .hide:hover {
    color: var(--danger);
    background: var(--hover);
  }
  .card-note {
    margin: 0;
    color: var(--text-muted);
    line-height: 1.5;
  }
  .dialog-title {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
  }
  .dialog-text {
    margin: -8px 0 0;
    color: var(--text-muted);
    line-height: 1.5;
  }
  .dialog-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }
</style>
