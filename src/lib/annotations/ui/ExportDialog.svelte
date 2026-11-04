<script lang="ts">
  /** Export a copy: annotations in or out, and how much to compress. Never touches the original. */
  import { t, tn, type MessageKey } from "../../i18n";
  import { exportPdf, pdfProtection, pdfSizeEstimate, revealInFolder, type Compression, type ExportDone, type ProtectionInfo, type SizeEstimate } from "../../ipc/export";
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

  const LEVELS: Compression[] = ["light", "recommended", "strong"];
  // No compression unless asked for.
  let compress = $state(false);
  let level = $state<Compression>("recommended");
  let include = $state(annotations.list.length > 0);
  let phase = $state<"choose" | "working" | "done">("choose");
  let error = $state<string | null>(null);
  let done = $state<ExportDone | null>(null);

  const tab = $derived(session.active);

  // Protection: kept by default; removable only with the right password.
  let protection = $state<ProtectionInfo | null>(null);
  let unlock = $state(false);
  let ownerPassword = $state("");
  $effect(() => {
    const t = tab;
    if (!t) return;
    pdfProtection(t.path, t.password)
      .then((info) => (protection = info))
      .catch(() => (protection = null));
  });
  const locks = $derived.by(() => {
    if (!protection?.protected) return [];
    const r = protection.restrictions;
    const list: MessageKey[] = [];
    if (protection.openPassword) list.push("export.protected.open");
    if (r.print) list.push("export.protected.print");
    if (r.copy) list.push("export.protected.copy");
    if (r.edit) list.push("export.protected.edit");
    if (r.annotate) list.push("export.protected.annotate");
    return list;
  });
  const needsOwner = $derived(unlock && !!protection && !protection.removableWithOpenPassword);
  /** Kept protection that forbids annotations keeps them out. */
  const annotationsBlocked = $derived(!!protection?.restrictions.annotate && !unlock);

  // How much each level saves: measured once, the first time compression is turned on.
  let estimate = $state<SizeEstimate | null>(null);
  let estimating = $state(false);
  $effect(() => {
    const t = tab;
    if (!compress || !t || estimate || estimating) return;
    estimating = true;
    pdfSizeEstimate(t.path, t.password)
      .then((e) => (estimate = e))
      .catch(() => {})
      .finally(() => (estimating = false));
  });
  /** "About 9.1 MB (82% smaller)" for a level, or null while unknown. */
  function estimateText(l: Compression): string | null {
    if (!estimate || l === "none") return null;
    const after = estimate[l];
    const percent = Math.round((1 - after / Math.max(1, estimate.originalBytes)) * 100);
    return percent >= 5 ? t("export.estimate", { size: bytes(after), percent }) : t("export.estimateSame", { size: bytes(after) });
  }

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
        annotations: include && !annotationsBlocked ? toExport(annotations.list) : [],
        compression: compress ? level : "none",
        protection: {
          openPassword: tab.password,
          remove: unlock,
          ownerPassword: needsOwner ? ownerPassword : null,
        },
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

    <label class="row" class:disabled={!annotations.list.length || annotationsBlocked}>
      <span class="label">
        <span>{t("export.annotations")}</span>
        <span class="hint"
          >{annotationsBlocked && annotations.list.length
            ? t("export.annotationsBlocked")
            : annotations.list.length
              ? tn("export.annotationsHint", annotations.list.length)
              : t("export.noAnnotations")}</span
        >
      </span>
      <input
        type="checkbox"
        class="switch"
        checked={include && !annotationsBlocked}
        onchange={(e) => (include = e.currentTarget.checked)}
        disabled={!annotations.list.length || annotationsBlocked || phase === "working"}
      />
    </label>

    {#if locks.length}
      <div class="protection">
        <span class="group">{t("export.protection")}</span>
        <div class="locks">
          {#each locks as key (key)}
            <span class="lock"><Icon name="lock" size={11} stroke={2} />{t(key)}</span>
          {/each}
        </div>
        <label class="row">
          <span class="label">
            <span>{t("export.unlock")}</span>
            <span class="hint"
              >{unlock
                ? protection?.removableWithOpenPassword
                  ? t("export.unlockHint")
                  : t("export.unlockOwnerHint")
                : t("export.protectionKept")}</span
            >
          </span>
          <input type="checkbox" class="switch" bind:checked={unlock} disabled={phase === "working"} />
        </label>
        {#if needsOwner}
          <input
            class="field"
            type="password"
            autocomplete="off"
            placeholder={t("export.ownerPassword")}
            aria-label={t("export.ownerPassword")}
            bind:value={ownerPassword}
            disabled={phase === "working"}
          />
        {/if}
      </div>
    {/if}

    <div class="compress">
      <label class="row">
        <span class="label">
          <span>{t("export.compress")}</span>
          <span class="hint">{compress ? t(`export.level.${level}Text` as MessageKey) : t("export.compressOff")}</span>
          {#if compress}
            <span class="estimate" class:pending={!estimate}>{estimateText(level) ?? (estimating ? t("export.estimating") : "")}</span>
          {/if}
        </span>
        <input type="checkbox" class="switch" bind:checked={compress} disabled={phase === "working"} />
      </label>
      {#if compress}
        <label class="level">
          <span>{t("export.compression")}</span>
          <select class="select" bind:value={level} disabled={phase === "working"}>
            {#each LEVELS as l (l)}
              <option value={l}>{t(`export.level.${l}` as MessageKey)}{estimate && l !== "none" ? ` · ${bytes(estimate[l])}` : ""}</option>
            {/each}
          </select>
        </label>
      {/if}
    </div>

    {#if error}<p class="error" role="alert">{error}</p>{/if}

    <div class="actions">
      {#if phase === "working"}
        <span class="working"><span class="spinner"></span>{t("export.working")}</span>
      {:else}
        <button class="btn" onclick={onClose}>{t("export.cancel")}</button>
        <button class="btn primary" onclick={run} disabled={needsOwner && !ownerPassword}><Icon name="export" size={14} stroke={2} />{t("export.save")}</button>
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
  .protection {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .field {
    height: 34px;
    padding: 0 10px;
    border-radius: var(--radius-m);
    border: 1px solid var(--hairline);
    background: var(--field);
    color: var(--text);
    outline: none;
  }
  .field:focus {
    border-color: var(--accent);
  }
  .locks {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .lock {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 3px 9px;
    border-radius: 99px;
    background: var(--hover);
    font-size: 12px;
    color: var(--text-muted);
  }
  .group {
    font-size: 12px;
    font-weight: 500;
    color: var(--text-muted);
    margin-bottom: 2px;
  }
  .compress {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .estimate {
    font-size: 12px;
    font-weight: 600;
    color: var(--green-text);
  }
  .estimate.pending {
    font-weight: 400;
    color: var(--text-muted);
  }
  .level {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 0 14px;
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
