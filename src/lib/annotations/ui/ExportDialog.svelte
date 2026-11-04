<script lang="ts">
  /** Export a copy: annotations in or out, and how much to compress. Never touches the original. */
  import { t, tn, type MessageKey } from "../../i18n";
  import { exportPdf, revealInFolder, type Compression, type ExportDone } from "../../ipc/export";
  import { session } from "../../reader/session.svelte";
  import { message } from "../../library/library.svelte";
  import Dialog from "../../ui/Dialog.svelte";
  import Icon from "../../ui/Icon.svelte";
  import { annotations } from "../store.svelte";
  import { toExport } from "../export";

  interface Props {
    onClose: () => void;
  }
  let { onClose }: Props = $props();

  const LEVELS: Compression[] = ["none", "light", "recommended", "strong"];
  let level = $state<Compression>("recommended");
  let include = $state(annotations.list.length > 0);
  let phase = $state<"choose" | "working" | "done">("choose");
  let error = $state<string | null>(null);
  let done = $state<ExportDone | null>(null);

  const tab = $derived(session.active);

  function bytes(n: number): string {
    if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
    return `${(n / 1024 / 1024).toFixed(1)} MB`;
  }

  async function run() {
    if (!tab) return;
    error = null;
    phase = "working";
    try {
      const result = await exportPdf({
        source: tab.path,
        title: tab.title,
        annotations: include ? toExport(annotations.list) : [],
        compression: level,
      });
      if (!result) {
        phase = "choose"; // save dialog cancelled
        return;
      }
      done = result;
      phase = "done";
    } catch (err) {
      error = t("export.failed", { reason: message(err) });
      phase = "choose";
    }
  }

  const saved = $derived(done ? Math.round((1 - done.exportedBytes / Math.max(1, done.originalBytes)) * 100) : 0);
</script>

<Dialog labelledBy="export-title" width={460} onClose={phase === "working" ? undefined : onClose}>
  {#if phase === "done" && done}
    <div class="done">
      <span class="ok"><Icon name="check" size={26} stroke={2.4} /></span>
      <h2 id="export-title">{t("export.done")}</h2>
      <p class="path" title={done.path}>{done.path}</p>
      <p class="sizes">
        {t("export.sizes", { before: bytes(done.originalBytes), after: bytes(done.exportedBytes) })}
        <span class:good={saved >= 5}>{saved >= 5 ? t("export.saving", { percent: saved }) : t("export.bigger")}</span>
      </p>
      <div class="actions">
        <button class="btn" onclick={() => revealInFolder(done!.path)}><Icon name="folder" size={14} />{t("export.show")}</button>
        {#if done.document}
          <button
            class="btn"
            onclick={() => {
              const doc = done!.document!;
              onClose();
              void session.open(doc);
            }}><Icon name="open" size={14} />{t("export.open")}</button
          >
        {/if}
        <button class="btn primary" onclick={onClose}>{t("export.close")}</button>
      </div>
    </div>
  {:else}
    <div class="head">
      <h2 id="export-title">{t("export.title")}</h2>
      <p>{t("export.intro")}</p>
    </div>

    <label class="row" class:disabled={!annotations.list.length}>
      <span class="label">
        <span>{t("export.annotations")}</span>
        <span class="hint">{annotations.list.length ? tn("export.annotationsHint", annotations.list.length) : t("export.noAnnotations")}</span>
      </span>
      <input type="checkbox" class="switch" bind:checked={include} disabled={!annotations.list.length || phase === "working"} />
    </label>

    <div class="levels" role="radiogroup" aria-label={t("export.compression")}>
      <span class="group">{t("export.compression")}</span>
      {#each LEVELS as l (l)}
        <button role="radio" aria-checked={level === l} disabled={phase === "working"} onclick={() => (level = l)}>
          <span class="dot"></span>
          <span class="text">
            <span class="name">{t(`export.level.${l}` as MessageKey)}</span>
            <span class="hint">{t(`export.level.${l}Text` as MessageKey)}</span>
          </span>
        </button>
      {/each}
    </div>

    {#if error}<p class="error" role="alert">{error}</p>{/if}

    <div class="actions">
      {#if phase === "working"}
        <span class="working"><span class="spinner"></span>{t("export.working")}</span>
      {:else}
        <button class="btn" onclick={onClose}>{t("export.cancel")}</button>
        <button class="btn primary" onclick={run}><Icon name="export" size={14} stroke={2} />{t("export.save")}</button>
      {/if}
    </div>
  {/if}
</Dialog>

<style>
  .head h2,
  .done h2 {
    margin: 0;
    font-size: 17px;
    font-weight: 600;
  }
  .head p {
    margin: 4px 0 0;
    color: var(--text-muted);
  }
  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 12px 14px;
    border-radius: var(--radius-l);
    border: 1px solid var(--hairline);
  }
  .row.disabled {
    opacity: 0.6;
  }
  .label {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .label > span:first-child {
    font-weight: 500;
  }
  .hint {
    font-size: 12px;
    color: var(--text-muted);
  }
  .levels {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .group {
    font-size: 12px;
    font-weight: 500;
    color: var(--text-muted);
    margin-bottom: 2px;
  }
  .levels button {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 14px;
    border-radius: var(--radius-l);
    border: 1px solid var(--hairline);
    background: transparent;
    text-align: left;
  }
  .levels button:hover:not(:disabled) {
    background: var(--hover);
  }
  .levels button[aria-checked="true"] {
    border-color: var(--accent);
    background: var(--accent-soft);
  }
  .dot {
    width: 16px;
    height: 16px;
    flex-shrink: 0;
    border-radius: 8px;
    border: 1.5px solid var(--text-faint);
  }
  [aria-checked="true"] .dot {
    border: 5px solid var(--accent);
  }
  .text {
    display: flex;
    flex-direction: column;
    gap: 1px;
  }
  .name {
    font-weight: 500;
  }
  .actions {
    display: flex;
    justify-content: flex-end;
    align-items: center;
    gap: 8px;
  }
  .working {
    display: flex;
    align-items: center;
    gap: 10px;
    height: 32px;
    color: var(--text-muted);
  }
  .spinner {
    width: 16px;
    height: 16px;
    border-radius: 8px;
    border: 2px solid var(--track);
    border-top-color: var(--accent);
    animation: spin 0.8s linear infinite;
  }
  .error {
    margin: 0;
    padding: 10px 12px;
    border-radius: var(--radius-m);
    background: color-mix(in srgb, var(--danger) 12%, transparent);
    color: var(--danger);
  }
  .done {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    text-align: center;
  }
  .ok {
    width: 52px;
    height: 52px;
    border-radius: 26px;
    background: var(--green-soft);
    color: var(--green-text);
    display: grid;
    place-items: center;
    margin-bottom: 4px;
  }
  .path {
    margin: 0;
    max-width: 100%;
    font-size: 12px;
    color: var(--text-muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .sizes {
    margin: 4px 0 8px;
    font-size: 15px;
    font-weight: 600;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .sizes span {
    font-size: 12.5px;
    font-weight: 500;
    color: var(--text-muted);
  }
  .sizes span.good {
    color: var(--ok);
  }
  .done .actions {
    justify-content: center;
    flex-wrap: wrap;
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
</style>
