<script lang="ts">
  /**
   * Floating menu over selected text (create a mark) or over a clicked mark (change it).
   * Apple Books style: colours, underline/strike, comment, copy.
   */
  import { t } from "../../i18n";
  import { settings } from "../../settings/store.svelte";
  import Icon from "../../ui/Icon.svelte";
  import { PALETTE, type MarkKind, type TextMark } from "../model";
  import { annotations } from "../store.svelte";

  interface Props {
    /** Screen rectangle to sit above. */
    at: DOMRect;
    /** The mark being edited, or null for a new selection. */
    mark: TextMark | null;
    onCreate: (kind: MarkKind, color: string) => TextMark | null;
    onComment: (mark: TextMark) => void;
    onClose: () => void;
  }
  let { at, mark, onCreate, onComment, onClose }: Props = $props();
  let menu: HTMLDivElement;

  const top = $derived(Math.max(8, at.top - 48));
  const left = $derived(Math.min(Math.max(8, at.left + at.width / 2), window.innerWidth - 8));

  $effect(() => {
    const onDown = (e: PointerEvent) => !menu.contains(e.target as Node) && onClose();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    const timer = setTimeout(() => window.addEventListener("pointerdown", onDown, true));
    window.addEventListener("keydown", onKey, true);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("keydown", onKey, true);
    };
  });

  function apply(kind: MarkKind, color: string) {
    settings.update((s) => {
      s.annotate.markColor = color;
      s.annotate.markKind = kind;
    });
    if (mark) annotations.update(mark.id, { type: kind, color });
    else onCreate(kind, color);
    onClose();
  }
  function comment() {
    const target = mark ?? onCreate(settings.value.annotate.markKind, settings.value.annotate.markColor);
    onClose();
    if (target) onComment(target);
  }
  async function copy() {
    const text = mark?.text ?? window.getSelection()?.toString() ?? "";
    if (text) await navigator.clipboard.writeText(text).catch(() => {});
    onClose();
  }
  const kind = $derived(mark?.type ?? "highlight");
</script>

<div class="menu" role="menu" bind:this={menu} style:top="{top}px" style:left="{left}px">
  {#each PALETTE.marker as c (c)}
    <button class="swatch" role="menuitemradio" aria-checked={mark?.color === c} aria-label={c} style:--c={c} onclick={() => apply(kind === "highlight" ? "highlight" : kind, c)}></button>
  {/each}
  <span class="sep"></span>
  <button role="menuitemradio" aria-checked={kind === "underline"} title={t("tools.kind.underline")} aria-label={t("tools.kind.underline")} onclick={() => apply(kind === "underline" ? "highlight" : "underline", mark?.color ?? settings.value.annotate.markColor)}>
    <Icon name="underline" size={15} />
  </button>
  <button role="menuitemradio" aria-checked={kind === "strike"} title={t("tools.kind.strike")} aria-label={t("tools.kind.strike")} onclick={() => apply(kind === "strike" ? "highlight" : "strike", mark?.color ?? settings.value.annotate.markColor)}>
    <Icon name="strike" size={15} />
  </button>
  <button role="menuitem" title={mark?.note ? t("mark.editComment") : t("mark.comment")} aria-label={t("mark.comment")} onclick={comment}>
    <Icon name="comment" size={15} />
  </button>
  <button role="menuitem" title={t("mark.copy")} aria-label={t("mark.copy")} onclick={copy}>
    <Icon name="copy" size={15} />
  </button>
  {#if mark}
    <button
      role="menuitem"
      class="danger"
      title={t("mark.delete")}
      aria-label={t("mark.delete")}
      onclick={() => {
        annotations.remove(new Set([mark.id]));
        onClose();
      }}
    >
      <Icon name="trash" size={15} />
    </button>
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
    padding: 5px 6px;
    border-radius: 12px;
    background: var(--surface-raised);
    box-shadow: var(--pop-shadow);
    animation: pop var(--fast) var(--ease);
  }
  .swatch {
    width: 22px;
    height: 22px;
    margin: 0 1px;
    padding: 0;
    border: none;
    border-radius: 11px;
    background: var(--c);
    box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.15);
  }
  .swatch[aria-checked="true"] {
    box-shadow: 0 0 0 2px var(--surface-raised), 0 0 0 4px var(--accent);
  }
  button:not(.swatch) {
    width: 30px;
    height: 30px;
    border: none;
    border-radius: 8px;
    background: transparent;
    color: var(--text-soft);
    display: grid;
    place-items: center;
  }
  button:not(.swatch):hover {
    background: var(--hover);
    color: var(--text);
  }
  button[aria-checked="true"]:not(.swatch) {
    background: var(--pressed);
    color: var(--text);
  }
  .danger:hover {
    color: var(--danger) !important;
  }
  .sep {
    width: 1px;
    height: 18px;
    margin: 0 2px;
    background: var(--hairline);
  }
  @keyframes pop {
    from {
      opacity: 0;
      transform: translate(-50%, 4px);
    }
  }
</style>
