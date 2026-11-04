<script lang="ts">
  /**
   * The welcome: a few choices on the first launch (or the steps an update asks for again).
   * Every choice is saved as soon as it is made, so closing early loses nothing.
   */
  import { t, AVAILABLE_LOCALES, type MessageKey } from "../i18n";
  import { settings } from "../settings/store.svelte";
  import { READING_THEMES } from "../dark/themes";
  import { library } from "../library/library.svelte";
  import { CLOUD_KINDS } from "../ipc/library";
  import type { WelcomeStep } from "../whatsnew/whatsnew";
  import TitleBar from "../ui/TitleBar.svelte";
  import AppMark from "../ui/AppMark.svelte";
  import AppearancePicker from "../ui/AppearancePicker.svelte";
  import Icon from "../ui/Icon.svelte";
  import { setStudyTools } from "../app/setStudyTools";

  interface Props {
    steps: WelcomeStep[];
    onDone: () => void;
  }
  let { steps, onDone }: Props = $props();
  let index = $state(0);
  const step = $derived(steps[index]!);
  const last = $derived(index === steps.length - 1);
  const s = $derived(settings.value);

  function next() {
    if (last) onDone();
    else index++;
  }
</script>

<div class="welcome">
  <TitleBar />
  <div class="stage">
    <section class="card" aria-labelledby="welcome-title">
      {#if steps.length > 1}
        <div class="dots" aria-label={t("welcome.step", { n: index + 1, total: steps.length })}>
          {#each steps as st, i (st)}<span class:on={i === index}></span>{/each}
        </div>
      {/if}

      {#key step}
        <div class="body">
          {#if step === "language"}
            <AppMark size={64} />
            <h1 id="welcome-title">{t("welcome.language.title")}</h1>
            <p>{t("welcome.language.text")}</p>
            <label class="field">
              <span>{t("welcome.language.label")}</span>
              <select class="select" value={s.app.locale} onchange={(e) => settings.update((x) => (x.app.locale = e.currentTarget.value))}>
                {#each AVAILABLE_LOCALES as code (code)}
                  <option value={code}>{new Intl.DisplayNames([code], { type: "language" }).of(code)}</option>
                {/each}
              </select>
            </label>
          {:else if step === "usage"}
            <h1 id="welcome-title">{t("welcome.usage.title")}</h1>
            <p>{t("welcome.usage.text")}</p>
            <div class="usage" role="radiogroup" aria-label={t("welcome.usage.title")}>
              <button role="radio" aria-checked={s.study.tools} onclick={() => setStudyTools({ tools: true })}>
                <span class="usage-icon study"><Icon name="timer" size={22} stroke={1.8} /></span>
                <strong>{t("welcome.usage.study")}</strong>
                <span>{t("welcome.usage.studyText")}</span>
              </button>
              <button role="radio" aria-checked={!s.study.tools} onclick={() => setStudyTools({ tools: false })}>
                <span class="usage-icon read"><Icon name="file" size={22} stroke={1.8} /></span>
                <strong>{t("welcome.usage.read")}</strong>
                <span>{t("welcome.usage.readText")}</span>
              </button>
            </div>
            <p class="later">{t("welcome.usage.later")}</p>
          {:else if step === "appearance"}
            <h1 id="welcome-title">{t("welcome.appearance.title")}</h1>
            <p>{t("welcome.appearance.text")}</p>
            <AppearancePicker />
          {:else if step === "reading"}
            <h1 id="welcome-title">{t("welcome.reading.title")}</h1>
            <p>{t("welcome.reading.text")}</p>
            <div class="themes" role="radiogroup" aria-label={t("dark.theme")}>
              {#each READING_THEMES as theme (theme.id)}
                <button role="radio" aria-checked={s.reading.theme === theme.id} onclick={() => settings.update((x) => (x.reading.theme = theme.id))}>
                  <span class="page" style:background={theme.background} style:color={theme.text}>
                    <strong>Aa</strong>
                    <span class="line" style:background={theme.text}></span>
                    <span class="line short" style:background={theme.text}></span>
                    <span class="line" style:background={theme.text}></span>
                  </span>
                  {t(`theme.${theme.id}` as MessageKey)}
                </button>
              {/each}
            </div>
            <div class="callout">
              <span class="moon"><Icon name="moon" size={18} stroke={2} /></span>
              <span><strong>{t("welcome.reading.calloutTitle")}</strong> {t("welcome.reading.calloutText")}</span>
            </div>
            <label class="row">
              <span class="label"><span>{t("welcome.reading.dark")}</span></span>
              <input type="checkbox" class="switch" checked={s.reading.darkEnabled} onchange={(e) => settings.update((x) => (x.reading.darkEnabled = e.currentTarget.checked))} />
            </label>
          {:else if step === "library"}
            <h1 id="welcome-title">{t("welcome.library.title")}</h1>
            <p>{t("welcome.library.text")}</p>
            <div class="list">
              {#each library.folders as f (f.path)}
                <div class="row"><span class="label"><span><Icon name="folder" size={14} /> {f.name}</span><span class="hint">{f.path}</span></span><Icon name="check" size={16} stroke={2.4} /></div>
              {/each}
              <div class="row">
                <span class="label"><span>{t("library.folders")}</span></span>
                <button class="btn small" onclick={() => library.addFolder("folder")}><Icon name="plus" size={13} stroke={2} />{t("library.addFolder")}</button>
              </div>
              {#each CLOUD_KINDS as kind (kind)}
                {@const connected = library.clouds.some((f) => f.kind === kind)}
                {@const found = library.view?.cloudSuggestions.some((c) => c.kind === kind)}
                <div class="row">
                  <span class="label">
                    <span>{t(`cloud.${kind}` as MessageKey)}</span>
                    {#if found && !connected}<span class="hint ok">{t("cloud.found")}</span>{/if}
                  </span>
                  {#if connected}
                    <span class="connected"><Icon name="check" size={16} stroke={2.4} /></span>
                  {:else}
                    <button class="btn small" class:primary={found} onclick={() => library.addFolder(kind)}>{found ? t("cloud.connect") : t("cloud.choose")}</button>
                  {/if}
                </div>
              {/each}
              <label class="row">
                <span class="label"><span>{t("welcome.library.goodnotes")}</span><span class="hint">{t("welcome.library.goodnotesHint")}</span></span>
                <input type="checkbox" class="switch" checked={s.library.goodnotes} onchange={(e) => settings.update((x) => (x.library.goodnotes = e.currentTarget.checked))} />
              </label>
            </div>
          {/if}
        </div>
      {/key}

      <footer>
        {#if index > 0}
          <button class="btn ghost" onclick={() => index--}><Icon name="back" size={14} stroke={2} />{t("welcome.back")}</button>
        {:else}
          <span></span>
        {/if}
        <div class="right">
          {#if !last}<button class="btn ghost" onclick={onDone}>{t("welcome.skip")}</button>{/if}
          <button class="btn primary" onclick={next}>{last ? t("welcome.done") : t("welcome.next")}</button>
        </div>
      </footer>
    </section>
  </div>
</div>

<style>
  .welcome {
    position: fixed;
    inset: 0;
    z-index: 90;
    display: flex;
    flex-direction: column;
    background: var(--bg);
  }
  .welcome :global(.bar) {
    border-bottom-color: transparent;
    background: transparent;
  }
  .stage {
    flex: 1;
    overflow-y: auto;
    display: grid;
    place-items: center;
    padding: 24px;
  }
  .card {
    width: min(620px, 100%);
    display: flex;
    flex-direction: column;
    gap: 24px;
    padding: 32px 36px 24px;
    border-radius: 20px;
    background: var(--surface);
    border: 1px solid var(--hairline);
    box-shadow: var(--card-shadow), 0 30px 80px rgba(0, 0, 0, 0.08);
  }
  .usage {
    width: 100%;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
    margin-top: 6px;
  }
  .usage button {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 6px;
    padding: 18px;
    border-radius: 14px;
    border: 1.5px solid var(--hairline);
    background: transparent;
    color: var(--text);
    text-align: left;
  }
  .usage button:hover {
    background: var(--hover);
  }
  .usage button[aria-checked="true"] {
    border-color: var(--accent);
    background: var(--accent-soft);
  }
  .usage strong {
    font-size: 15px;
    margin-top: 4px;
  }
  .usage button > span:last-child {
    color: var(--text-muted);
    font-size: 12.5px;
    line-height: 1.45;
  }
  .usage-icon {
    width: 42px;
    height: 42px;
    display: grid;
    place-items: center;
    border-radius: 12px;
  }
  .usage-icon.study {
    background: var(--accent);
    color: var(--on-accent);
  }
  .usage-icon.read {
    background: var(--segment);
    color: var(--text);
  }
  .later {
    font-size: 12.5px;
    color: var(--text-muted);
  }
  .dots {
    display: flex;
    justify-content: center;
    gap: 6px;
  }
  .dots span {
    width: 6px;
    height: 6px;
    border-radius: 3px;
    background: var(--track);
    transition: width var(--medium) var(--ease), background var(--medium) var(--ease);
  }
  .dots span.on {
    width: 20px;
    background: var(--accent);
  }
  .body {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 14px;
    text-align: center;
    min-height: 300px;
    animation: enter 260ms var(--ease);
  }
  .body :global(.mark) {
    border-radius: 16px !important;
    margin-bottom: 4px;
  }
  h1 {
    margin: 0;
    font-family: var(--font-display);
    font-size: 26px;
    font-weight: 600;
    letter-spacing: -0.02em;
  }
  p {
    margin: 0 0 8px;
    max-width: 460px;
    color: var(--text-muted);
    line-height: 1.55;
  }
  .field {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .field .select {
    min-width: 200px;
  }
  .themes {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 12px;
    width: 100%;
  }
  .themes button {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 0;
    border: none;
    background: none;
    color: var(--text-muted);
    font-size: 12px;
  }
  .themes button[aria-checked="true"] {
    color: var(--text);
    font-weight: 500;
  }
  .page {
    width: 100%;
    aspect-ratio: 3 / 4;
    border-radius: 8px;
    padding: 14% 12%;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 7%;
    box-shadow: 0 0 0 1px var(--hairline);
    font-family: Georgia, "Times New Roman", serif;
    transition: box-shadow var(--fast) var(--ease);
  }
  .themes button[aria-checked="true"] .page {
    box-shadow: 0 0 0 2px var(--surface), 0 0 0 4px var(--accent);
  }
  .page strong {
    font-size: 18px;
    font-weight: 600;
  }
  .line {
    width: 100%;
    height: 3px;
    border-radius: 2px;
    opacity: 0.55;
  }
  .line.short {
    width: 70%;
  }
  .list {
    width: 100%;
    display: flex;
    flex-direction: column;
    text-align: left;
    border: 1px solid var(--hairline);
    border-radius: var(--radius-l);
  }
  .list .row + .row {
    border-top: 1px solid var(--hairline-soft);
  }
  .row {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 10px 14px;
    text-align: left;
  }
  .label {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }
  .label > span:first-child {
    font-weight: 500;
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .hint {
    font-size: 12px;
    color: var(--text-muted);
    overflow-wrap: anywhere;
  }
  .hint.ok,
  .connected,
  .row > :global(svg) {
    color: var(--ok);
  }
  .callout {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 14px;
    border-radius: var(--radius-l);
    background: var(--accent-soft);
    color: var(--text);
    text-align: left;
    line-height: 1.45;
  }
  .callout strong {
    color: var(--accent-text);
  }
  .moon {
    width: 34px;
    height: 34px;
    flex-shrink: 0;
    border-radius: 17px;
    background: var(--accent);
    color: var(--on-accent);
    display: grid;
    place-items: center;
  }
  footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .right {
    display: flex;
    gap: 8px;
  }
  @keyframes enter {
    from {
      opacity: 0;
      transform: translateX(12px);
    }
  }
</style>
