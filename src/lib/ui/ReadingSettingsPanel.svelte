<script lang="ts">
  /** Reading theme and adjustments for dark pages (popover in the Reader, section in Settings). */
  import { t, type MessageKey } from "../i18n";
  import { settings } from "../settings/store.svelte";
  import { readingMode } from "../dark/readingMode.svelte";
  import { DEFAULT_TUNING, READING_THEMES, type DarkTuning, type ThemeId } from "../dark/themes";
  import type { AutoThemeMode } from "../settings/schema";
  import Icon from "./Icon.svelte";

  interface Props {
    /** Shown as a link at the bottom (popover only). */
    onAllSettings?: () => void;
    embedded?: boolean;
  }
  let { onAllSettings, embedded = false }: Props = $props();

  const reading = $derived(settings.value.reading);

  function setTheme(id: ThemeId) {
    settings.update((s) => (s.reading.theme = id));
  }
  function setTuning<K extends keyof DarkTuning>(key: K, value: DarkTuning[K]) {
    settings.update((s) => (s.reading.tuning[key] = value));
  }
  function setAuto(patch: Partial<{ mode: AutoThemeMode; darkFrom: string; darkUntil: string }>) {
    settings.update((s) => Object.assign(s.reading.auto, patch));
  }
  const sliders: Array<{ key: "brightness" | "contrast" | "textWeight"; label: MessageKey; min: number; max: number; step: number }> = [
    { key: "brightness", label: "dark.brightness", min: 0.7, max: 1.15, step: 0.01 },
    { key: "contrast", label: "dark.contrast", min: 0.7, max: 1.4, step: 0.01 },
    { key: "textWeight", label: "dark.textWeight", min: 0, max: 0.6, step: 0.05 },
  ];
  const fill = (v: number, min: number, max: number) => `${((v - min) / (max - min)) * 100}%`;
</script>

<div class="panel" class:embedded>
  {#if !embedded}
    <h2>{t("dark.settings")}</h2>
  {/if}

  <section aria-label={t("dark.theme")}>
    <h3>{t("dark.theme")}</h3>
    <div class="themes" role="radiogroup" aria-label={t("dark.theme")}>
      {#each READING_THEMES as theme (theme.id)}
        <button
          class="theme"
          role="radio"
          aria-checked={reading.theme === theme.id}
          title={t(`theme.${theme.id}` as MessageKey)}
          onclick={() => setTheme(theme.id)}
        >
          <span class="swatch" style:background={theme.background} style:color={theme.text}>Aa</span>
          <span class="name">{t(`theme.${theme.id}` as MessageKey)}</span>
        </button>
      {/each}
    </div>
    {#if !readingMode.isDark}
      <p class="note">{t("dark.offHint")}</p>
    {/if}
  </section>

  <section>
    {#each sliders as s (s.key)}
      <label class="slider">
        <span>{t(s.label)}</span>
        <input
          type="range"
          min={s.min}
          max={s.max}
          step={s.step}
          value={reading.tuning[s.key]}
          style:--fill={fill(reading.tuning[s.key], s.min, s.max)}
          oninput={(e) => setTuning(s.key, Number(e.currentTarget.value))}
        />
      </label>
    {/each}
    <label class="row">
      <span>{t("dark.dimPhotos")}</span>
      <input type="checkbox" class="switch" checked={reading.tuning.dimPhotos} onchange={(e) => setTuning("dimPhotos", e.currentTarget.checked)} />
    </label>
    <button class="link" onclick={() => settings.update((s) => (s.reading.tuning = { ...DEFAULT_TUNING }))}>{t("dark.reset")}</button>
  </section>

  <section>
    <label class="row">
      <span>{t("dark.auto")}</span>
      <select class="select" value={reading.auto.mode} onchange={(e) => setAuto({ mode: e.currentTarget.value as AutoThemeMode })}>
        <option value="off">{t("dark.auto.off")}</option>
        <option value="system">{t("dark.auto.system")}</option>
        <option value="schedule">{t("dark.auto.schedule")}</option>
      </select>
    </label>
    {#if reading.auto.mode === "schedule"}
      <div class="times">
        {t("dark.auto.from")}
        <input class="select" type="time" value={reading.auto.darkFrom} onchange={(e) => setAuto({ darkFrom: e.currentTarget.value })} />
        {t("dark.auto.until")}
        <input class="select" type="time" value={reading.auto.darkUntil} onchange={(e) => setAuto({ darkUntil: e.currentTarget.value })} />
      </div>
    {/if}
  </section>

  {#if onAllSettings}
    <button class="all" onclick={onAllSettings}>
      {t("dark.allSettings")}
      <Icon name="forward" size={14} />
    </button>
  {/if}
</div>

<style>
  .panel {
    display: flex;
    flex-direction: column;
    gap: 18px;
    padding: 18px;
  }
  .panel.embedded {
    padding: 0;
  }
  h2 {
    margin: 0;
    font-size: 14px;
    font-weight: 600;
  }
  h3 {
    margin: 0 0 10px;
    font-size: 12px;
    font-weight: 500;
    color: var(--text-muted);
  }
  section {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .themes {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 6px;
  }
  .embedded .themes {
    grid-template-columns: repeat(auto-fill, minmax(92px, 1fr));
    gap: 10px;
  }
  .theme {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: 0;
    border: none;
    background: none;
    min-width: 0;
  }
  .swatch {
    width: 100%;
    aspect-ratio: 1.15;
    border-radius: 9px;
    display: grid;
    place-items: center;
    font-family: Georgia, "Times New Roman", serif;
    font-size: 15px;
    box-shadow: 0 0 0 1px var(--hairline);
    transition: box-shadow var(--fast) var(--ease);
  }
  .theme[aria-checked="true"] .swatch {
    box-shadow: 0 0 0 2px var(--surface-raised), 0 0 0 4px var(--accent);
  }
  .name {
    font-size: 11px;
    color: var(--text-muted);
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .theme[aria-checked="true"] .name {
    color: var(--text);
    font-weight: 500;
  }
  .note {
    margin: 0;
    font-size: 12px;
    color: var(--text-muted);
  }
  .slider {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  input[type="range"] {
    appearance: none;
    width: 100%;
    height: 4px;
    margin: 6px 0;
    border-radius: 2px;
    background: linear-gradient(var(--accent), var(--accent)) 0 / var(--fill) 100% no-repeat, var(--track);
  }
  input[type="range"]::-webkit-slider-thumb {
    appearance: none;
    width: 16px;
    height: 16px;
    border-radius: 8px;
    background: #fff;
    box-shadow: 0 0 0 0.5px rgba(0, 0, 0, 0.2), 0 1px 3px rgba(0, 0, 0, 0.3);
  }
  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }
  .times {
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--text-muted);
  }
  .link {
    align-self: flex-start;
    padding: 0;
    border: none;
    background: none;
    color: var(--accent-text);
    font-size: 12px;
  }
  .all {
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 34px;
    padding: 0 10px;
    margin: -4px -6px -6px;
    border: none;
    border-radius: var(--radius-m);
    background: transparent;
    color: var(--text-soft);
  }
  .all:hover {
    background: var(--hover);
  }
</style>
