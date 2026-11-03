<script lang="ts">
  import { t, type MessageKey } from "../i18n";
  import { settings } from "../settings/store.svelte";
  import { DEFAULT_TUNING, READING_THEMES, type DarkTuning, type ThemeId } from "../dark/themes";
  import type { AutoThemeMode } from "../settings/schema";

  interface Props {
    onClose: () => void;
  }
  let { onClose }: Props = $props();

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
</script>

<aside class="panel" aria-label={t("dark.settings")}>
  <header>
    <h2>{t("dark.settings")}</h2>
    <button onclick={onClose} aria-label={t("dark.close")}>×</button>
  </header>

  <section>
    <h3>{t("dark.theme")}</h3>
    <div class="themes">
      {#each READING_THEMES as theme (theme.id)}
        <button class="theme" class:selected={reading.theme === theme.id} onclick={() => setTheme(theme.id)}>
          <span class="swatch" style:background={theme.background} style:color={theme.text}>Aa</span>
          {t(`theme.${theme.id}` as MessageKey)}
        </button>
      {/each}
    </div>
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
          oninput={(e) => setTuning(s.key, Number(e.currentTarget.value))}
        />
      </label>
    {/each}
    <label class="check">
      <input type="checkbox" checked={reading.tuning.dimPhotos} onchange={(e) => setTuning("dimPhotos", e.currentTarget.checked)} />
      {t("dark.dimPhotos")}
    </label>
    <button class="link" onclick={() => settings.update((s) => (s.reading.tuning = { ...DEFAULT_TUNING }))}>{t("dark.reset")}</button>
  </section>

  <section>
    <h3>{t("dark.auto")}</h3>
    <select value={reading.auto.mode} onchange={(e) => setAuto({ mode: e.currentTarget.value as AutoThemeMode })}>
      <option value="off">{t("dark.auto.off")}</option>
      <option value="system">{t("dark.auto.system")}</option>
      <option value="schedule">{t("dark.auto.schedule")}</option>
    </select>
    {#if reading.auto.mode === "schedule"}
      <div class="times">
        {t("dark.auto.from")}
        <input type="time" value={reading.auto.darkFrom} onchange={(e) => setAuto({ darkFrom: e.currentTarget.value })} />
        {t("dark.auto.until")}
        <input type="time" value={reading.auto.darkUntil} onchange={(e) => setAuto({ darkUntil: e.currentTarget.value })} />
      </div>
    {/if}
  </section>
</aside>

<style>
  .panel {
    position: absolute;
    top: var(--space-2);
    right: var(--space-2);
    width: 300px;
    max-height: calc(100% - 2 * var(--space-2));
    overflow: auto;
    padding: var(--space-3);
    border-radius: 10px;
    background: var(--bg);
    border: 1px solid var(--border);
    box-shadow: 0 12px 40px rgb(0 0 0 / 0.25);
    font-size: 13px;
    z-index: 5;
    display: grid;
    gap: var(--space-3);
  }
  header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  h2 {
    margin: 0;
    font-size: 14px;
  }
  h3 {
    margin: 0 0 var(--space-2);
    font-size: 12px;
    color: var(--text-muted);
    font-weight: 500;
  }
  section {
    display: grid;
    gap: var(--space-2);
  }
  .themes {
    display: grid;
    gap: var(--space-1);
  }
  .theme {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    text-align: left;
    padding: 4px;
    border-radius: 6px;
    border: 1px solid transparent;
    background: none;
    color: inherit;
    font: inherit;
  }
  .theme.selected {
    border-color: var(--text-muted);
  }
  .swatch {
    width: 36px;
    height: 24px;
    border-radius: 4px;
    display: grid;
    place-items: center;
    font-family: Georgia, serif;
  }
  .slider {
    display: grid;
    gap: 2px;
  }
  .check {
    display: flex;
    gap: var(--space-2);
    align-items: center;
  }
  .times {
    display: flex;
    gap: var(--space-1);
    align-items: center;
  }
  .link {
    justify-self: start;
    background: none;
    border: none;
    padding: 0;
    color: var(--text-muted);
    text-decoration: underline;
    font: inherit;
  }
</style>
