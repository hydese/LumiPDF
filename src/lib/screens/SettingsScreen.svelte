<script lang="ts">
  import { formatWhen, t, type MessageKey } from "../i18n";
  import { AVAILABLE_LOCALES } from "../i18n";
  import { formatShortcut } from "../platform/shortcuts";
  import { platform } from "../platform/window";
  import { settings } from "../settings/store.svelte";
  import type { Appearance, StartScreen, TimerSettings } from "../settings/schema";
  import { TIMER_LIMITS } from "../settings/schema";
  import { navigation, type SettingsSection } from "../app/navigation.svelte";
  import { updates, RELEASES_PAGE } from "../updates/updates.svelte";
  import { library } from "../library/library.svelte";
  import { timer } from "../timer/timer.svelte";
  import { openExternal } from "../ipc/system";
  import { whatsNew } from "../whatsnew/whatsnewState.svelte";
  import TitleBar from "../ui/TitleBar.svelte";
  import Icon, { type IconName } from "../ui/Icon.svelte";
  import AppMark from "../ui/AppMark.svelte";
  import ReadingSettingsPanel from "../ui/ReadingSettingsPanel.svelte";
  import DurationField from "../timer/ui/DurationField.svelte";

  const GITHUB = "https://github.com/hydese/LumiPDF";
  const AUTHOR = "https://github.com/hydese";

  const SECTIONS: Array<{ id: SettingsSection; icon: IconName; color: string }> = [
    { id: "general", icon: "gear", color: "#3d6bf0" },
    { id: "appearance", icon: "sun", color: "#7a5af5" },
    { id: "reading", icon: "moon", color: "#1d1d1f" },
    { id: "library", icon: "cloud", color: "#2f9be8" },
    { id: "timer", icon: "timer", color: "#f08a4b" },
    { id: "shortcuts", icon: "keyboard", color: "#8e8e93" },
    { id: "about", icon: "info", color: "#8e8e93" },
  ];

  const section = $derived(navigation.settingsSection);
  const s = $derived(settings.value);
  const sc = (k: string) => formatShortcut(k, platform);

  const SHORTCUTS: Array<[MessageKey, string]> = [
    ["settings.shortcuts.open", "mod+o"],
    ["settings.shortcuts.search", "mod+k"],
    ["settings.shortcuts.find", "mod+f"],
    ["settings.shortcuts.dark", "mod+shift+d"],
    ["settings.shortcuts.bookmark", "mod+d"],
    ["settings.shortcuts.sidebar", "mod+\\"],
    ["settings.shortcuts.zoomIn", "mod+="],
    ["settings.shortcuts.zoomOut", "mod+-"],
    ["settings.shortcuts.fit", "mod+0"],
    ["settings.shortcuts.timer", "mod+shift+t"],
    ["settings.shortcuts.settings", "mod+,"],
    ["settings.shortcuts.close", "mod+w"],
  ];

  function setTimer(key: keyof TimerSettings, value: number | boolean) {
    settings.update((x) => ((x.timer as unknown as Record<string, number | boolean>)[key] = value));
    timer.syncWithSettings();
  }

  const updateTitle = $derived.by(() => {
    switch (updates.status) {
      case "available":
        return t("settings.update.available", { version: updates.available!.version });
      case "up-to-date":
        return t("settings.update.upToDate");
      case "checking":
        return t("settings.update.checking");
      case "error":
        return t("settings.update.error");
      default:
        return t("settings.update.idle", { current: updates.current });
    }
  });
  const updateDetail = $derived.by(() => {
    const current = updates.current;
    switch (updates.status) {
      case "available":
        return t("settings.update.availableDetail", { current });
      case "up-to-date":
        return t("settings.update.upToDateDetail", { current });
      case "error":
        return t("settings.update.errorDetail", { current });
      default:
        return t("settings.update.idleDetail");
    }
  });
  const notesLines = $derived(
    (updates.available?.notes ?? "")
      .split(/\r?\n/)
      .map((l) => l.replace(/^\s*[-*]\s+/, "").replace(/[#*_`]/g, "").trim())
      .filter((l) => l.length > 0)
      .slice(0, 8),
  );
</script>

<div class="screen">
  <TitleBar>
    {#snippet left()}
      <button class="back" onclick={() => navigation.closeSettings()}>
        <Icon name="back" size={16} stroke={2} />
        {t("nav.back")}
      </button>
    {/snippet}
    {#snippet center()}
      <h1 data-tauri-drag-region>{t("settings.title")}</h1>
    {/snippet}
  </TitleBar>

  <div class="layout">
    <nav aria-label={t("settings.title")}>
      {#each SECTIONS as item (item.id)}
        <button aria-current={section === item.id ? "page" : undefined} onclick={() => (navigation.settingsSection = item.id)}>
          <span class="icon" style:background={item.id === "reading" ? "var(--text)" : item.color}>
            <Icon name={item.icon} size={13} stroke={2.2} />
          </span>
          {t(`settings.section.${item.id}` as MessageKey)}
        </button>
      {/each}
    </nav>

    <main>
      <h2>{t(`settings.section.${section}` as MessageKey)}</h2>

      {#if section === "general"}
        <section class="card update">
          <div class="update-head">
            <AppMark size={44} />
            <div class="update-text">
              <h3>{updateTitle}</h3>
              <span>{updateDetail}</span>
            </div>
            {#if updates.status === "available" && updates.available}
              <button class="btn primary" onclick={() => openExternal(updates.available!.url)}>
                <Icon name="update" size={14} stroke={2.2} />
                {t("settings.update.download")}
              </button>
            {/if}
          </div>
          {#if updates.status === "available" && notesLines.length}
            <div class="notes">
              <span>{t("settings.update.whatsNew")}</span>
              <ul>
                {#each notesLines as line, i (i)}<li>{line}</li>{/each}
              </ul>
            </div>
          {/if}
          <label class="row">
            <span class="label">
              <span>{t("settings.update.auto")}</span>
              <span class="hint">
                {updates.lastChecked ? t("settings.update.lastChecked", { time: formatWhen(updates.lastChecked) }) : t("settings.update.neverChecked")}
                ·
                <button class="link-button" disabled={updates.status === "checking"} onclick={() => updates.check()}>{t("settings.update.checkNow")}</button>
              </span>
            </span>
            <input type="checkbox" class="switch" checked={s.app.checkForUpdates} onchange={(e) => settings.update((x) => (x.app.checkForUpdates = e.currentTarget.checked))} />
          </label>
        </section>

        <section class="card list">
          <h3 class="group">{t("settings.group.startup")}</h3>
          <label class="row">
            <span class="label"><span>{t("settings.startScreen")}</span><span class="hint">{t("settings.startScreen.hint")}</span></span>
            <select class="select" value={s.app.startScreen} onchange={(e) => settings.update((x) => (x.app.startScreen = e.currentTarget.value as StartScreen))}>
              <option value="library">{t("settings.startScreen.library")}</option>
              <option value="last-document">{t("settings.startScreen.last")}</option>
            </select>
          </label>
          <label class="row">
            <span class="label"><span>{t("settings.language")}</span><span class="hint">{t("settings.language.hint")}</span></span>
            <select class="select" value={s.app.locale} onchange={(e) => settings.update((x) => (x.app.locale = e.currentTarget.value))}>
              {#each AVAILABLE_LOCALES as code (code)}
                <option value={code}>{new Intl.DisplayNames([code], { type: "language" }).of(code)}</option>
              {/each}
            </select>
          </label>
        </section>
      {:else if section === "appearance"}
        <section class="card">
          <div class="label"><span>{t("settings.appearance.app")}</span><span class="hint">{t("settings.appearance.hint")}</span></div>
          <div class="appearance" role="radiogroup" aria-label={t("settings.appearance.app")}>
            {#each ["system", "light", "dark"] as const as option (option)}
              <button role="radio" aria-checked={s.app.appearance === option} onclick={() => settings.update((x) => (x.app.appearance = option as Appearance))}>
                <span class="preview {option}"><span class="bar"></span><span class="side"></span><span class="page"></span></span>
                {t(`settings.appearance.${option}`)}
              </button>
            {/each}
          </div>
        </section>
      {:else if section === "reading"}
        <section class="card">
          <ReadingSettingsPanel embedded />
        </section>
      {:else if section === "library"}
        <section class="card list">
          <h3 class="group">{t("settings.library.folders")}</h3>
          <p class="hint pad">{t("settings.library.foldersHint")}</p>
          {#each library.view?.folders ?? [] as folder (folder.path)}
            <div class="row">
              <span class="label">
                <span>{folder.name}</span>
                <span class="hint">{t(`settings.library.kind.${folder.kind}` as MessageKey)} · {folder.path}</span>
              </span>
              <button class="btn small" onclick={() => library.removeFolder(folder)}>{t("settings.library.remove")}</button>
            </div>
          {:else}
            <p class="hint pad">{t("settings.library.none")}</p>
          {/each}
          <div class="row actions">
            <button class="btn small" onclick={() => library.addFolder("folder")}><Icon name="plus" size={13} stroke={2} />{t("library.addFolder")}</button>
            {#if !library.icloud}
              <button class="btn small" onclick={() => library.addFolder("icloud")}><Icon name="cloud" size={13} />{t("icloud.add")}</button>
            {/if}
            {#if !library.goodnotes}
              <button class="btn small" onclick={() => library.addFolder("goodnotes")}><Icon name="notebook" size={13} />{t("goodnotes.choose")}</button>
            {/if}
          </div>
        </section>
      {:else if section === "timer"}
        <section class="card">
          <div class="durations">
            <DurationField label={t("timer.focus")} value={s.timer.focus} onChange={(m) => setTimer("focus", m)} />
            <DurationField label={t("timer.shortBreak")} value={s.timer.shortBreak} onChange={(m) => setTimer("shortBreak", m)} />
            <DurationField label={t("timer.longBreak")} value={s.timer.longBreak} onChange={(m) => setTimer("longBreak", m)} />
          </div>
          <p class="hint">{t("timer.hint")}</p>
        </section>
        <section class="card list">
          <label class="row">
            <span class="label"><span>{t("timer.sessions")}</span></span>
            <select class="select" value={s.timer.sessionsBeforeLong} onchange={(e) => setTimer("sessionsBeforeLong", Number(e.currentTarget.value))}>
              {#each Array.from({ length: TIMER_LIMITS.maxSessions }, (_, i) => i + 1) as n (n)}
                <option value={n}>{n}</option>
              {/each}
            </select>
          </label>
          <label class="row">
            <span class="label"><span>{t("timer.sound")}</span></span>
            <input type="checkbox" class="switch" checked={s.timer.sound} onchange={(e) => setTimer("sound", e.currentTarget.checked)} />
          </label>
        </section>
      {:else if section === "shortcuts"}
        <section class="card list">
          {#each SHORTCUTS as [label, keys] (label)}
            <div class="row">
              <span>{t(label)}</span>
              <kbd>{sc(keys)}</kbd>
            </div>
          {/each}
        </section>
      {:else if section === "about"}
        <section class="card about">
          <AppMark size={56} />
          <h3>{t("app.name")} {updates.current}</h3>
          <p>{t("settings.about.text")}</p>
          <button class="btn" onclick={() => whatsNew.showCurrent()}>{t("settings.about.showWhatsNew")}</button>
        </section>
      {/if}

      <p class="footer">
        {t("app.name")} {updates.current} ·
        {t("app.madeBy")} <button class="link-button" onclick={() => openExternal(AUTHOR)}>hydese</button> ·
        <button class="link-button" onclick={() => openExternal(GITHUB)}>{t("settings.about.github")}</button> ·
        <button class="link-button" onclick={() => openExternal(RELEASES_PAGE)}>{t("settings.about.releaseNotes")}</button> ·
        {t("app.license")}
      </p>
    </main>
  </div>
</div>

<style>
  .screen {
    height: 100%;
    display: flex;
    flex-direction: column;
    background: var(--bg);
  }
  .back {
    display: flex;
    align-items: center;
    gap: 4px;
    height: 30px;
    padding: 0 10px 0 6px;
    border: none;
    border-radius: var(--radius-m);
    background: transparent;
    color: var(--text-soft);
    font-weight: 500;
  }
  .back:hover {
    background: var(--hover);
    color: var(--text);
  }
  h1 {
    margin: 0;
    font-size: 14px;
    font-weight: 600;
  }
  .layout {
    flex: 1;
    overflow-y: auto;
    display: flex;
    gap: 32px;
    width: 100%;
    max-width: 1040px;
    margin: 0 auto;
    padding: 32px 32px 48px;
  }
  nav {
    width: 220px;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
    position: sticky;
    top: 0;
    align-self: flex-start;
  }
  nav button {
    display: flex;
    align-items: center;
    gap: 10px;
    height: 34px;
    padding: 0 10px;
    border: none;
    border-radius: var(--radius-m);
    background: transparent;
    color: var(--text-soft);
    text-align: left;
  }
  nav button:hover {
    background: var(--hover);
  }
  nav button[aria-current="page"] {
    background: var(--pressed);
    color: var(--text);
    font-weight: 600;
  }
  .icon {
    width: 22px;
    height: 22px;
    border-radius: 6px;
    display: grid;
    place-items: center;
    color: #fff;
  }
  nav button:nth-child(3) .icon {
    color: var(--bg);
  }
  main {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 20px;
  }
  h2 {
    margin: 0 0 4px;
    font-family: var(--font-display);
    font-size: 22px;
    font-weight: 600;
    letter-spacing: -0.02em;
  }
  .card {
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: 18px;
    border-radius: var(--radius-l);
    background: var(--surface);
    border: 1px solid var(--hairline);
    box-shadow: var(--card-shadow);
  }
  .card.list {
    gap: 0;
    padding: 0;
  }
  .group {
    margin: 0;
    padding: 14px 18px 6px;
    font-size: 12px;
    font-weight: 500;
    color: var(--text-muted);
  }
  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
  }
  .list .row {
    padding: 12px 18px;
    border-top: 1px solid var(--hairline-soft);
  }
  .list .group + .row,
  .list .row:first-child {
    border-top: none;
  }
  .row.actions {
    justify-content: flex-start;
    gap: 8px;
  }
  .label {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }
  .label > span:first-child {
    font-weight: 500;
  }
  .hint {
    font-size: 12px;
    color: var(--text-muted);
    overflow-wrap: anywhere;
    margin: 0;
  }
  .hint.pad {
    padding: 0 18px 10px;
  }
  .update-head {
    display: flex;
    align-items: center;
    gap: 14px;
    flex-wrap: wrap;
  }
  .update-head :global(.mark) {
    border-radius: 11px !important;
  }
  .update-text {
    flex: 1;
    min-width: 220px;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .update-text h3 {
    margin: 0;
    font-size: 15px;
    font-weight: 600;
  }
  .update-text span {
    color: var(--text-muted);
  }
  .notes {
    padding: 12px 14px;
    border-radius: 9px;
    background: var(--inset);
    display: flex;
    flex-direction: column;
    gap: 6px;
    color: var(--text-soft);
  }
  .notes span {
    font-weight: 600;
    font-size: 12px;
  }
  .notes ul {
    margin: 0;
    padding-left: 18px;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .appearance {
    display: flex;
    gap: 16px;
    flex-wrap: wrap;
  }
  .appearance button {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 0;
    border: none;
    background: none;
    color: var(--text-soft);
  }
  .appearance button[aria-checked="true"] {
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
  .appearance button[aria-checked="true"] .preview {
    box-shadow: 0 0 0 2px var(--surface), 0 0 0 4px var(--accent);
  }
  .preview .bar {
    position: absolute;
    inset: 0 0 auto;
    height: 14px;
    background: #fbfbf9;
    border-bottom: 1px solid rgba(0, 0, 0, 0.08);
  }
  .preview .side {
    position: absolute;
    left: 0;
    top: 14px;
    bottom: 0;
    width: 30px;
    background: #efefec;
  }
  .preview .page {
    position: absolute;
    left: 46px;
    top: 24px;
    width: 50px;
    height: 70px;
    border-radius: 2px;
    background: #fff;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
  }
  .preview.dark {
    background: #161618;
  }
  .preview.dark .bar {
    background: #1c1c1f;
    border-color: rgba(255, 255, 255, 0.08);
  }
  .preview.dark .side {
    background: #1f1f22;
  }
  .preview.dark .page {
    background: #2a2a2e;
  }
  .preview.system {
    background: linear-gradient(90deg, #f6f6f4 50%, #161618 50%);
  }
  .preview.system .bar {
    background: linear-gradient(90deg, #fbfbf9 50%, #1c1c1f 50%);
  }
  .preview.system .page {
    background: linear-gradient(90deg, #fff 50%, #2a2a2e 50%);
  }
  .durations {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 160px));
    gap: 12px;
  }
  kbd {
    font-family: inherit;
    font-size: 12px;
    padding: 2px 8px;
    border-radius: 6px;
    border: 1px solid var(--hairline);
    background: var(--inset);
    white-space: nowrap;
  }
  .about {
    align-items: center;
    text-align: center;
    padding: 32px 18px;
  }
  .about :global(.mark) {
    border-radius: 14px !important;
  }
  .about h3 {
    margin: 4px 0 0;
    font-size: 17px;
  }
  .about p {
    margin: 0;
    max-width: 420px;
    color: var(--text-muted);
    line-height: 1.5;
  }
  .footer {
    margin: 0;
    color: var(--text-muted);
    font-size: 12px;
  }
  .footer .link-button {
    font-size: 12px;
  }
</style>
