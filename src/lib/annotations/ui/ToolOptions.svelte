<script lang="ts">
  /** Floating options for the active tool (colour, thickness, mark style) and undo/redo. */
  import { t, type MessageKey } from "../../i18n";
  import { settings } from "../../settings/store.svelte";
  import Icon, { type IconName } from "../../ui/Icon.svelte";
  import { PALETTE, WIDTHS, type MarkKind } from "../model";
  import { annotations } from "../store.svelte";
  import HexPicker from "./HexPicker.svelte";

  const tool = $derived(annotations.tool);
  const a = $derived(settings.value.annotate);
  const colors = $derived(tool === "pen" ? PALETTE.ink : tool === "note" ? PALETTE.note : PALETTE.marker);
  const current = $derived(tool === "pen" ? a.inkColor : tool === "marker" ? a.markerColor : tool === "note" ? a.noteColor : a.markColor);
  const widths = $derived(tool === "pen" ? WIDTHS.ink : tool === "marker" ? WIDTHS.marker : null);
  const width = $derived(tool === "pen" ? a.inkWidth : a.markerWidth);
  const KINDS: Array<{ kind: MarkKind; icon: IconName }> = [
    { kind: "highlight", icon: "highlighter" },
    { kind: "underline", icon: "underline" },
    { kind: "strike", icon: "strike" },
  ];
  const hint = $derived(
    tool === "pen" || tool === "marker"
      ? t("tools.drawHint")
      : tool === "eraser"
        ? t("tools.eraserHint")
        : tool === "note"
          ? t("tools.noteHint")
          : tool === "snip"
            ? t("tools.snipHint")
            : t("tools.highlightHint"),
  );
  const WIDTH_LABEL = ["tools.thin", "tools.medium", "tools.thick"] as const;
  /** Same limits as the settings schema. */
  const limits = $derived(tool === "pen" ? { min: 0.5, max: 10 } : { min: 4, max: 40 });

  function setColor(c: string) {
    settings.update((s) => {
      if (tool === "pen") s.annotate.inkColor = c;
      else if (tool === "marker") s.annotate.markerColor = c;
      else if (tool === "note") s.annotate.noteColor = c;
      else s.annotate.markColor = c;
    });
  }
  function setWidth(w: number) {
    settings.update((s) => {
      if (tool === "pen") s.annotate.inkWidth = w;
      else s.annotate.markerWidth = w;
    });
  }
</script>

{#if tool !== "select" && tool !== "hand"}
  <div class="options" role="toolbar" aria-label={t(`tools.${tool}` as MessageKey)}>
    {#if tool !== "eraser" && tool !== "snip"}
      <div class="group" role="radiogroup" aria-label={t("tools.color")}>
        {#each colors as c (c)}
          <button class="swatch" role="radio" aria-checked={current === c} aria-label={c} style:--c={c} onclick={() => setColor(c)}></button>
        {/each}
        <HexPicker value={current} presets={colors} onPick={setColor} />
      </div>
    {/if}
    {#if widths}
      <span class="sep"></span>
      <div class="group" role="radiogroup" aria-label={t("tools.width")}>
        {#each widths as w, i (w)}
          <button class="width" role="radio" aria-checked={width === w} aria-label={t(WIDTH_LABEL[i]!)} title={t(WIDTH_LABEL[i]!)} onclick={() => setWidth(w)}>
            <span style:height="{2 + i * 3}px" style:background={current}></span>
          </button>
        {/each}
        <label class="px" title={t("tools.customWidth")}>
          <input
            type="number"
            min={limits.min}
            max={limits.max}
            step="0.5"
            value={width}
            aria-label={t("tools.customWidth")}
            onchange={(e) => {
              const v = Number(e.currentTarget.value);
              if (Number.isFinite(v)) setWidth(Math.min(limits.max, Math.max(limits.min, v)));
            }}
          />
          px
        </label>
      </div>
    {/if}
    {#if tool === "eraser"}
      <div class="group" role="radiogroup" aria-label={t("tools.eraser")}>
        {#each ["stroke", "partial"] as const as m (m)}
          <button class="mode" role="radio" aria-checked={a.eraserMode === m} onclick={() => settings.update((s) => (s.annotate.eraserMode = m))}>
            {t(m === "stroke" ? "tools.eraserStroke" : "tools.eraserPartial")}
          </button>
        {/each}
      </div>
      {#if a.eraserMode === "partial"}
        <span class="sep"></span>
        <label class="px" title={t("tools.eraserSize")}>
          <input
            type="range"
            min="3"
            max="40"
            value={a.eraserSize}
            aria-label={t("tools.eraserSize")}
            oninput={(e) => {
              const v = Number(e.currentTarget.value);
              settings.update((s) => (s.annotate.eraserSize = v));
            }}
          />
          <span class="dot" style:width="{Math.min(22, a.eraserSize)}px" style:height="{Math.min(22, a.eraserSize)}px"></span>
        </label>
      {/if}
    {/if}
    {#if tool === "highlight"}
      <span class="sep"></span>
      <div class="group" role="radiogroup" aria-label={t("tools.highlight")}>
        {#each KINDS as k (k.kind)}
          <button class="kind" role="radio" aria-checked={a.markKind === k.kind} title={t(`tools.kind.${k.kind}` as MessageKey)} aria-label={t(`tools.kind.${k.kind}` as MessageKey)} onclick={() => settings.update((s) => (s.annotate.markKind = k.kind))}>
            <Icon name={k.icon} size={14} />
          </button>
        {/each}
      </div>
    {/if}
    <span class="hint">{hint}</span>
    <span class="sep"></span>
    <button class="kind" title="{t('tools.undo')} (Ctrl+Z)" aria-label={t("tools.undo")} disabled={!annotations.canUndo} onclick={() => annotations.undo()}><Icon name="undo" size={14} /></button>
    <button class="kind" title="{t('tools.redo')} (Ctrl+Shift+Z)" aria-label={t("tools.redo")} disabled={!annotations.canRedo} onclick={() => annotations.redo()}><Icon name="redo" size={14} /></button>
  </div>
{/if}

<style>
  .options {
    position: absolute;
    top: 12px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 6;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 5px 6px 5px 10px;
    border-radius: 12px;
    background: color-mix(in srgb, var(--surface-raised) 94%, transparent);
    backdrop-filter: blur(16px) saturate(1.4);
    box-shadow: var(--pop-shadow);
    animation: drop var(--medium) var(--ease);
    white-space: nowrap;
  }
  .mode {
    height: 26px;
    padding: 0 10px;
    border: none;
    border-radius: 7px;
    background: transparent;
    color: var(--text-soft);
  }
  .mode[aria-checked="true"] {
    background: color-mix(in srgb, var(--accent) 18%, transparent);
    color: var(--text);
  }
  .px input[type="range"] {
    width: 90px;
  }
  .dot {
    display: inline-block;
    border-radius: 50%;
    border: 1.5px solid var(--text-soft);
  }
  .group {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .swatch {
    width: 20px;
    height: 20px;
    padding: 0;
    border: none;
    border-radius: 10px;
    background: var(--c);
    box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.15);
  }
  .swatch[aria-checked="true"] {
    box-shadow: 0 0 0 2px var(--surface-raised), 0 0 0 4px var(--accent);
  }
  .width,
  .kind {
    width: 28px;
    height: 28px;
    border: none;
    border-radius: 7px;
    background: transparent;
    color: var(--text-soft);
    display: grid;
    place-items: center;
  }
  .width span {
    width: 16px;
    border-radius: 3px;
  }
  .width:hover,
  .kind:hover:not(:disabled) {
    background: var(--hover);
  }
  .width[aria-checked="true"],
  .kind[aria-checked="true"] {
    background: var(--pressed);
    color: var(--text);
  }
  .px {
    display: flex;
    align-items: center;
    gap: 3px;
    margin-left: 2px;
    font-size: 11.5px;
    color: var(--text-muted);
  }
  .px input {
    width: 44px;
    height: 26px;
    padding: 0 4px;
    border: 1px solid var(--hairline);
    border-radius: 6px;
    background: var(--field);
    text-align: center;
    font-variant-numeric: tabular-nums;
    outline: none;
  }
  .px input:focus {
    border-color: var(--accent);
  }
  .kind:disabled {
    opacity: 0.35;
  }
  .sep {
    width: 1px;
    height: 18px;
    background: var(--hairline);
  }
  .hint {
    margin-left: 4px;
    font-size: 12px;
    color: var(--text-muted);
  }
  @keyframes drop {
    from {
      opacity: 0;
      transform: translate(-50%, -4px);
    }
  }
</style>
