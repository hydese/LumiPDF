<script lang="ts">
  /** Edits a sticky note, or the comment on a text mark. Saves as you type. */
  import { t } from "../../i18n";
  import Icon from "../../ui/Icon.svelte";
  import Popover from "../../ui/Popover.svelte";
  import { PALETTE } from "../model";
  import { annotations } from "../store.svelte";
  import HexPicker from "./HexPicker.svelte";

  interface Props {
    id: string;
    anchor: HTMLElement;
    onClose: () => void;
  }
  let { id, anchor, onClose }: Props = $props();
  const a = $derived(annotations.get(id));
  const isNote = $derived(a?.type === "note");
  const value = $derived(a ? (a.type === "note" ? a.text : "note" in a ? a.note : "") : "");

  function setText(text: string) {
    if (!a) return;
    annotations.update(id, a.type === "note" ? { text } : { note: text });
  }
  function close() {
    // An empty sticky note is not worth keeping.
    if (a?.type === "note" && !a.text.trim()) annotations.remove(new Set([id]));
    onClose();
  }
</script>

{#if a}
  <Popover {anchor} label={t("note.title")} width={300} onClose={close}>
    <div class="editor" style:--note={a.color}>
      <!-- svelte-ignore a11y_autofocus -->
      <textarea
        data-autofocus
        autofocus
        value={value}
        placeholder={isNote ? t("note.placeholder") : t("mark.commentPlaceholder")}
        rows="5"
        oninput={(e) => setText(e.currentTarget.value)}
        onkeydown={(e) => e.key === "Enter" && (e.ctrlKey || e.metaKey) && close()}
      ></textarea>
      <div class="bar">
        {#if isNote}
          <div class="colors">
            {#each PALETTE.note as c (c)}
              <button class="swatch" aria-label={c} aria-pressed={a.color === c} style:--c={c} onclick={() => annotations.update(id, { color: c })}></button>
            {/each}
            <HexPicker value={a.color} presets={PALETTE.note} up onPick={(c) => annotations.update(id, { color: c })} />
          </div>
        {/if}
        <button
          class="icon"
          title={t("note.delete")}
          aria-label={t("note.delete")}
          onclick={() => {
            if (a.type === "note") annotations.remove(new Set([id]));
            else annotations.update(id, { note: "" });
            onClose();
          }}
        >
          <Icon name="trash" size={15} />
        </button>
        <button class="btn small primary" onclick={close}>{t("note.done")}</button>
      </div>
    </div>
  </Popover>
{/if}

<style>
  .editor {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 12px;
    border-top: 4px solid var(--note);
    border-radius: 14px;
  }
  textarea {
    resize: vertical;
    min-height: 90px;
    padding: 8px 10px;
    border: 1px solid var(--hairline);
    border-radius: var(--radius-m);
    background: var(--field);
    outline: none;
    line-height: 1.45;
  }
  textarea:focus {
    border-color: var(--accent);
  }
  .bar {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .colors {
    display: flex;
    gap: 6px;
    margin-right: auto;
  }
  .bar > .icon:first-child {
    margin-left: auto;
  }
  .swatch {
    width: 18px;
    height: 18px;
    padding: 0;
    border: none;
    border-radius: 9px;
    background: var(--c);
    box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.15);
  }
  .swatch[aria-pressed="true"] {
    box-shadow: 0 0 0 2px var(--surface-raised), 0 0 0 4px var(--accent);
  }
  .icon {
    width: 30px;
    height: 30px;
    border: none;
    border-radius: 8px;
    background: none;
    color: var(--text-muted);
    display: grid;
    place-items: center;
  }
  .icon:hover {
    background: var(--hover);
    color: var(--danger);
  }
</style>
