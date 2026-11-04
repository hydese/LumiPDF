<script lang="ts">
  /**
   * The "any colour" swatch next to the preset colours: opens a small panel with the system
   * colour picker, a hex field (#RRGGBB) and the last custom colours used.
   * The panel lives inside the parent menu, so opening it never closes that menu.
   */
  import { t } from "../../i18n";
  import { settings } from "../../settings/store.svelte";

  interface Props {
    /** Current colour. */
    value: string;
    /** The preset colours shown next to it (a custom colour is one not among them). */
    presets: readonly string[];
    onPick: (hex: string) => void;
    /** Open the panel upwards (menus near the bottom of the window). */
    up?: boolean;
  }
  let { value, presets, onPick, up = false }: Props = $props();

  let open = $state(false);
  let draft = $state("");
  const custom = $derived(!presets.some((p) => p.toLowerCase() === value.toLowerCase()));
  const recent = $derived(settings.value.annotate.recentColors.filter((c) => !presets.includes(c)).slice(0, 6));

  function normalize(input: string): string | null {
    let v = input.trim().replace(/^#/, "").toLowerCase();
    if (/^[0-9a-f]{3}$/.test(v)) v = v.replace(/./g, (c) => c + c);
    return /^[0-9a-f]{6}$/.test(v) ? `#${v}` : null;
  }

  function pick(hex: string) {
    const c = normalize(hex);
    if (!c) return;
    draft = c.slice(1);
    onPick(c);
    if (!presets.includes(c)) {
      settings.update((s) => (s.annotate.recentColors = [c, ...s.annotate.recentColors.filter((x) => x !== c)].slice(0, 8)));
    }
  }

  function toggle() {
    open = !open;
    draft = value.replace(/^#/, "");
  }
  const valid = $derived(normalize(draft) !== null);

  let wrap: HTMLSpanElement;
  $effect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => !wrap.contains(e.target as Node) && (open = false);
    window.addEventListener("pointerdown", onDown, true);
    return () => window.removeEventListener("pointerdown", onDown, true);
  });
</script>

<span class="wrap" bind:this={wrap}>
  <button
    class="any"
    class:custom
    aria-pressed={custom}
    aria-expanded={open}
    aria-label={t("tools.customColor")}
    title={t("tools.customColor")}
    style:--c={custom ? value : undefined}
    onclick={toggle}
  ></button>
  {#if open}
    <div class="panel" class:up role="dialog" aria-label={t("tools.customColor")}>
      <div class="row">
        <label class="native" title={t("tools.pickColor")} style:--c={value}>
          <input type="color" value={value} aria-label={t("tools.pickColor")} oninput={(e) => pick(e.currentTarget.value)} />
        </label>
        <label class="hex" class:invalid={!valid}>
          <span>#</span>
          <input
            type="text"
            maxlength="7"
            spellcheck="false"
            autocomplete="off"
            bind:value={draft}
            aria-label={t("tools.hex")}
            onkeydown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter") pick(draft);
              else if (e.key === "Escape") open = false;
            }}
            onblur={() => valid && pick(draft)}
          />
        </label>
      </div>
      {#if recent.length}
        <div class="recent" aria-label={t("tools.recentColors")}>
          {#each recent as c (c)}
            <button class="dot" aria-label={c} title={c} style:--c={c} onclick={() => pick(c)}></button>
          {/each}
        </div>
      {/if}
    </div>
  {/if}
</span>

<style>
  .wrap {
    position: relative;
    display: inline-flex;
  }
  .any {
    width: 20px;
    height: 20px;
    padding: 0;
    border: none;
    border-radius: 10px;
    background: conic-gradient(#ff5b5b, #ffd84d, #6ee36e, #4dd2ff, #5b6bff, #e05bff, #ff5b5b);
    box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.15);
  }
  .any.custom {
    background:
      radial-gradient(circle, var(--c) 0 5.5px, transparent 6px),
      conic-gradient(#ff5b5b, #ffd84d, #6ee36e, #4dd2ff, #5b6bff, #e05bff, #ff5b5b);
  }
  .any[aria-pressed="true"] {
    box-shadow:
      0 0 0 2px var(--surface-raised),
      0 0 0 4px var(--accent);
  }
  .panel {
    position: absolute;
    top: calc(100% + 10px);
    left: 50%;
    transform: translateX(-50%);
    z-index: 5;
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 8px;
    border-radius: 10px;
    background: var(--surface-raised);
    box-shadow: var(--pop-shadow);
  }
  .panel.up {
    top: auto;
    bottom: calc(100% + 10px);
  }
  .row {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .native {
    position: relative;
    width: 30px;
    height: 30px;
    flex-shrink: 0;
    border-radius: 8px;
    background: var(--c);
    box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.18);
    cursor: pointer;
    overflow: hidden;
  }
  .native input {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    opacity: 0;
    cursor: pointer;
  }
  .hex {
    display: flex;
    align-items: center;
    height: 30px;
    padding: 0 8px;
    border-radius: 8px;
    border: 1px solid var(--hairline);
    background: var(--field);
    color: var(--text-muted);
    font-family: ui-monospace, "Cascadia Mono", Consolas, monospace;
  }
  .hex:focus-within {
    border-color: var(--accent);
  }
  .hex.invalid {
    border-color: var(--danger);
  }
  .hex input {
    width: 64px;
    border: none;
    background: transparent;
    color: var(--text);
    font: inherit;
    text-transform: lowercase;
    outline: none;
  }
  .recent {
    display: flex;
    gap: 5px;
  }
  .dot {
    width: 18px;
    height: 18px;
    padding: 0;
    border: none;
    border-radius: 9px;
    background: var(--c);
    box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.15);
  }
</style>
