<script lang="ts">
  /** Light / dark / system, with small window previews (Settings and the welcome). */
  import { t } from "../i18n";
  import { settings } from "../settings/store.svelte";
  import type { Appearance } from "../settings/schema";

  const OPTIONS: Appearance[] = ["system", "light", "dark"];
</script>

<div class="appearance" role="radiogroup" aria-label={t("settings.appearance.app")}>
  {#each OPTIONS as option (option)}
    <button role="radio" aria-checked={settings.value.app.appearance === option} onclick={() => settings.update((x) => (x.app.appearance = option))}>
      <span class="preview {option}"><span class="bar"></span><span class="side"></span><span class="page"></span></span>
      {t(`settings.appearance.${option}`)}
    </button>
  {/each}
</div>

<style>
  .appearance {
    display: flex;
    gap: 16px;
    flex-wrap: wrap;
  }
  button {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 0;
    border: none;
    background: none;
    color: var(--text-soft);
  }
  button[aria-checked="true"] {
    color: var(--text);
    font-weight: 500;
  }
  .preview {
    position: relative;
    width: 128px;
    height: 84px;
    border-radius: 10px;
    overflow: hidden;
    box-shadow: 0 0 0 1px var(--hairline);
    background: #f6f6f4;
  }
  button[aria-checked="true"] .preview {
    box-shadow: 0 0 0 2px var(--bg), 0 0 0 4px var(--accent);
  }
  .bar {
    position: absolute;
    inset: 0 0 auto;
    height: 14px;
    background: #fbfbf9;
    border-bottom: 1px solid rgba(0, 0, 0, 0.08);
  }
  .side {
    position: absolute;
    left: 0;
    top: 14px;
    bottom: 0;
    width: 30px;
    background: #efefec;
  }
  .page {
    position: absolute;
    left: 46px;
    top: 24px;
    width: 50px;
    height: 70px;
    border-radius: 2px;
    background: #fff;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
  }
  .dark {
    background: #161618;
  }
  .dark .bar {
    background: #1c1c1f;
    border-color: rgba(255, 255, 255, 0.08);
  }
  .dark .side {
    background: #1f1f22;
  }
  .dark .page {
    background: #2a2a2e;
  }
  .system {
    background: linear-gradient(90deg, #f6f6f4 50%, #161618 50%);
  }
  .system .bar {
    background: linear-gradient(90deg, #fbfbf9 50%, #1c1c1f 50%);
  }
  .system .page {
    background: linear-gradient(90deg, #fff 50%, #2a2a2e 50%);
  }
</style>
