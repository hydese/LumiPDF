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
  /** Earlier custom colours: not the one in use, not the presets, no near-duplicates. */
  const recent = $derived(distinct(settings.value.annotate.recentColors.filter((c) => !presets.includes(c) && !similar(c, value))).slice(0, 6));

  /** Colours closer than this (RGB distance) count as the same choice. */
  const SAME = 40;
  function rgb(hex: string): [number, number, number] {
    const n = Number.parseInt(hex.replace("#", ""), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function similar(a: string, b: string): boolean {
    const [r1, g1, b1] = rgb(a);
    const [r2, g2, b2] = rgb(b);
    return Math.hypot(r1 - r2, g1 - g2, b1 - b2) < SAME;
  }
  function distinct(list: string[]): string[] {
    const out: string[] = [];
    for (const c of list) if (!out.some((o) => similar(o, c))) out.push(c);
    return out;
  }

  // A small in-app picker (saturation/brightness square and a hue strip) instead of the
  // system colour window, which on the Mac is a big separate panel.
  let hue = $state(0);
  let sat = $state(1);
  let val = $state(1);
  function toHsv(hex: string): [number, number, number] {
    const [r, g, b] = rgb(hex).map((x) => x / 255) as [number, number, number];
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    let h = 0;
    if (d) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return [((h * 60) + 360) % 360, max ? d / max : 0, max];
  }
  function fromHsv(h: number, s: number, v: number): string {
    const f = (n: number) => {
      const k = (n + h / 60) % 6;
      return Math.round((v - v * s * Math.max(0, Math.min(k, 4 - k, 1))) * 255);
    };
    return "#" + [f(5), f(3), f(1)].map((x) => x.toString(16).padStart(2, "0")).join("");
  }
  function drag(e: PointerEvent, area: "sv" | "hue") {
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    const apply = (ev: PointerEvent) => {
      const r = el.getBoundingClientRect();
      const x = Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width));
      const y = Math.min(1, Math.max(0, (ev.clientY - r.top) / r.height));
      if (area === "sv") {
        sat = x;
        val = 1 - y;
      } else hue = x * 360;
      pick(fromHsv(hue, sat, val), false);
    };
    apply(e);
    const up = () => {
      el.removeEventListener("pointermove", apply);
      el.removeEventListener("pointerup", up);
      remember(fromHsv(hue, sat, val));
    };
    el.addEventListener("pointermove", apply);
    el.addEventListener("pointerup", up);
  }

  function normalize(input: string): string | null {
    let v = input.trim().replace(/^#/, "").toLowerCase();
    if (/^[0-9a-f]{3}$/.test(v)) v = v.replace(/./g, (c) => c + c);
    return /^[0-9a-f]{6}$/.test(v) ? `#${v}` : null;
  }

  /** Applies a colour. `keep`: also remember it among the recent colours (a final choice). */
  function pick(hex: string, keep = true) {
    const c = normalize(hex);
    if (!c) return;
    draft = c.slice(1);
    if (c !== value.toLowerCase()) onPick(c);
    if (keep) remember(c);
  }
  function remember(c: string) {
    if (presets.includes(c)) return;
    const list = settings.value.annotate.recentColors;
    if (list[0] === c) return;
    settings.update((s) => (s.annotate.recentColors = distinct([c, ...s.annotate.recentColors.filter((x) => !similar(x, c))]).slice(0, 8)));
  }

  function toggle() {
    open = !open;
    draft = value.replace(/^#/, "");
    [hue, sat, val] = toHsv(normalize(value) ?? "#ff0000");
  }
  const valid = $derived(normalize(draft) !== null);

  let wrap: HTMLSpanElement;
  $effect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => !wrap.contains(e.target as Node) && (open = false);
    window.addEventListener("pointerdown", onDown, true);
    return () => {
      window.removeEventListener("pointerdown", onDown, true);
      // Closing the panel keeps the colour you ended on among the recent ones.
      const c = normalize(value);
      if (c && !presets.includes(c)) remember(c);
    };
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
      <div class="sv" role="slider" aria-label={t("tools.pickColor")} aria-valuenow={Math.round(sat * 100)} tabindex="-1" style:--hue={hue} onpointerdown={(e) => drag(e, "sv")}>
        <span class="knob" style:left="{sat * 100}%" style:top="{(1 - val) * 100}%" style:--c={value}></span>
      </div>
      <div class="hue" role="slider" aria-label={t("tools.pickColor")} aria-valuenow={Math.round(hue)} tabindex="-1" onpointerdown={(e) => drag(e, "hue")}>
        <span class="knob" style:left="{(hue / 360) * 100}%" style:top="50%" style:--c="hsl({hue} 100% 50%)"></span>
      </div>
      <div class="row">
        <span class="native" style:--c={value}></span>
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
            onblur={() => valid && pick(draft, false)}
          />
        </label>
      </div>
      {#if recent.length}
        <div class="recent" aria-label={t("tools.recentColors")}>
          {#each recent as c (c)}
            <button class="dot" aria-label={c} title={c} style:--c={c} onclick={() => {
                pick(c);
                open = false;
              }}></button>
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
  .sv {
    position: relative;
    width: 168px;
    height: 104px;
    border-radius: 7px;
    background:
      linear-gradient(to top, #000, transparent),
      linear-gradient(to right, #fff, hsl(var(--hue) 100% 50%));
    cursor: crosshair;
    touch-action: none;
  }
  .hue {
    position: relative;
    width: 168px;
    height: 12px;
    border-radius: 6px;
    background: linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00);
    cursor: pointer;
    touch-action: none;
  }
  .knob {
    position: absolute;
    width: 12px;
    height: 12px;
    margin: -6px 0 0 -6px;
    border-radius: 50%;
    background: var(--c);
    box-shadow:
      0 0 0 2px #fff,
      0 0 0 3px rgba(0, 0, 0, 0.35);
    pointer-events: none;
  }
  .native {
    cursor: default;
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
