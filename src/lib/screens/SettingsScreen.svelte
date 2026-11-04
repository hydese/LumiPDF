<script lang="ts">
  import { formatWhen, t, tn, type MessageKey } from "../i18n";
  import { CLOUD_KINDS } from "../ipc/library";
  import { AVAILABLE_LOCALES, languageName } from "../i18n";
  import { formatShortcut } from "../platform/shortcuts";
  import { platform } from "../platform/window";
  import { settings } from "../settings/store.svelte";
  import type { StartScreen, TimerSettings, UpdateMode } from "../settings/schema";
  import { navigation, type SettingsSection } from "../app/navigation.svelte";
  import { updates, RELEASES_PAGE } from "../updates/updates.svelte";
  import { library } from "../library/library.svelte";
  import { timers } from "../timer/timers.svelte";
  import { openExternal } from "../ipc/system";
  import { whatsNew } from "../whatsnew/whatsnewState.svelte";
  import { studyTools } from "../app/studyTools.svelte";
  import { setStudyTools } from "../app/setStudyTools";
  import TitleBar from "../ui/TitleBar.svelte";
  import BackButton from "../ui/BackButton.svelte";
  import Icon, { type IconName } from "../ui/Icon.svelte";
  import AppMark from "../ui/AppMark.svelte";
  import Dialog from "../ui/Dialog.svelte";
  import ReadingSettingsPanel from "../ui/ReadingSettingsPanel.svelte";
  import AppearancePicker from "../ui/AppearancePicker.svelte";

  const GITHUB = "https://github.com/hydese/LumiPDF";
  const AUTHOR = "https://github.com/hydese";

  const SECTIONS: Array<{ id: SettingsSection; icon: IconName; color: string }> = [
    { id: "general", icon: "gear", color: "#3d6bf0" },
    { id: "appearance", icon: "sun", color: "#7a5af5" },
    { id: "reading", icon: "moon", color: "#1d1d1f" },
    { id: "library", icon: "cloud", color: "#2f9be8" },
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
    ["settings.shortcuts.export", "mod+e"],
    ["settings.shortcuts.undo", "mod+z"],
    ["settings.shortcuts.redo", "mod+shift+z"],
    ["settings.shortcuts.nextTab", "mod+tab"],
    ["settings.shortcuts.prevTab", "mod+shift+tab"],
    ["settings.shortcuts.close", "mod+w"],
    ["settings.shortcuts.fullscreen", "f11"],
  ];

  function setTimer(key: keyof TimerSettings, value: number | boolean) {
    settings.update((x) => ((x.timer as unknown as Record<string, number | boolean>)[key] = value));
    timers.syncWithSettings();
  }

  // ---- Beta ----------------------------------------------------------------------------------
  const TAPS = 7;
  let taps = $state(0);
  let tapTimer: ReturnType<typeof setTimeout> | undefined;
  let pulse = $state(0);
  let betaNotice = $state<string | null>(null);
  function tapVersion() {
    pulse++;
    if (updates.betaVisible) {
      betaNotice = t("settings.update.betaAlready");
      return;
    }
    clearTimeout(tapTimer);
    tapTimer = setTimeout(() => {
      taps = 0;
      betaNotice = null;
    }, 2500);
    taps++;
    if (taps < TAPS) {
      // Like Android's developer options: after a few taps, say how many are left.
      betaNotice = taps >= 3 ? tn("settings.update.tapsLeft", TAPS - taps) : null;
      return;
    }
    taps = 0;
    clearTimeout(tapTimer);
    settings.update((x) => (x.app.betaUnlocked = true));
    betaNotice = t("settings.update.betaUnlocked");
  }
  /** Leaving the beta on a beta build: offer the stable version. */
  let leaving = $state<{ version: string; installable: boolean } | "none" | null>(null);
  async function setBeta(on: boolean) {
    if (on) {
      settings.update((x) => (x.app.betaUpdates = true));
      void updates.check();
      return;
    }
    const stable = await updates.leaveBeta();
    if (updates.isBeta) leaving = stable ?? "none";
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
        if (updates.install === "downloading") return t("settings.update.downloading", { percent: Math.round((updates.progress ?? 0) * 100) });
        if (updates.install === "ready") return s.app.updateMode === "auto" ? t("settings.update.readyAuto") : t("settings.update.ready");
        if (updates.install === "installing") return t("settings.update.installing");
        if (updates.install === "failed") return t("settings.update.failed", { reason: updates.installError ?? "" });
        if (updates.signed) return t("settings.update.availableSigned", { current });
        if (updates.signedError !== null)
          return updates.signedError ? t("settings.update.notReadyError", { reason: updates.signedError }) : t("settings.update.notReady");
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
      <BackButton label={t("nav.back")} onclick={() => navigation.closeSettings()} />
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
              {#if updates.signed}
                {#if updates.install === "ready"}
                  <button class="btn primary" onclick={() => updates.installNow()}><Icon name="update" size={14} stroke={2.2} />{t("settings.update.restart")}</button>
                {:else if updates.install === "downloading" || updates.install === "installing"}
                  <span class="progress" role="progressbar" aria-valuenow={Math.round((updates.progress ?? 0) * 100)} aria-valuemin={0} aria-valuemax={100}>
                    <span style:width="{(updates.progress ?? 0.05) * 100}%"></span>
                  </span>
                {:else}
                  <button class="btn primary" onclick={() => updates.installNow()}><Icon name="update" size={14} stroke={2.2} />{t("settings.update.install")}</button>
                {/if}
              {:else if updates.installable}
                <!-- Installed copies never fall back to the website: try the signed update again. -->
                <button class="btn primary" onclick={() => updates.check()}>
                  <Icon name="update" size={14} stroke={2.2} />
                  {t("settings.update.retry")}
                </button>
              {:else}
                <button class="btn primary" onclick={() => openExternal(updates.available!.url)}>
                  <Icon name="update" size={14} stroke={2.2} />
                  {t("settings.update.download")}
                </button>
              {/if}
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
          <label class="row">
            <span class="label">
              <span>{t("settings.update.mode")}</span>
              <span class="hint">{updates.installable ? t("settings.update.modeHint") : t("settings.update.modePortable")}</span>
            </span>
            <select class="select" value={s.app.updateMode} onchange={(e) => settings.update((x) => (x.app.updateMode = e.currentTarget.value as UpdateMode))}>
              <option value="auto">{t("settings.update.modeAuto")}</option>
              <option value="ask">{t("settings.update.modeAsk")}</option>
            </select>
          </label>
          {#if updates.betaVisible}
            <label class="row">
              <span class="label"><span>{t("settings.update.beta")}</span><span class="hint">{t("settings.update.betaHint")}</span></span>
              <input type="checkbox" class="switch" checked={s.app.betaUpdates} onchange={(e) => setBeta(e.currentTarget.checked)} />
            </label>
          {/if}
        </section>

        <section class="card list study-tools">
          <label class="row main">
            <span class="label"><span>{t("settings.study.tools")}</span><span class="hint">{t("settings.study.toolsHint")}</span></span>
            <input type="checkbox" class="switch" checked={s.study.tools} onchange={(e) => setStudyTools({ tools: e.currentTarget.checked })} />
          </label>
          {#each [["timer", "settings.study.timer", "settings.study.timerHint"], ["stats", "settings.study.stats", "settings.study.statsHint"], ["sheets", "settings.study.sheets", "settings.study.sheetsHint"]] as const as [key, label, hint] (key)}
            <label class="row sub" class:disabled={!s.study.tools}>
              <span class="label"><span>{t(label)}</span><span class="hint">{t(hint)}</span></span>
              <input type="checkbox" class="switch" checked={s.study[key]} disabled={!s.study.tools} onchange={(e) => setStudyTools({ [key]: e.currentTarget.checked })} />
            </label>
          {/each}
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
                <option value={code}>{languageName(code)}</option>
              {/each}
            </select>
          </label>
        </section>

        {#if studyTools.timer}
        <section class="card list">
          <h3 class="group">{t("settings.group.timer")}</h3>
          <label class="row">
            <span class="label"><span>{t("timer.sound")}</span></span>
            <input type="checkbox" class="switch" checked={s.timer.sound} onchange={(e) => setTimer("sound", e.currentTarget.checked)} />
          </label>
          <label class="row">
            <span class="label"><span>{t("settings.timer.askOnClose")}</span><span class="hint">{t("settings.timer.askOnCloseHint")}</span></span>
            <input type="checkbox" class="switch" checked={s.timer.askOnClose} onchange={(e) => setTimer("askOnClose", e.currentTarget.checked)} />
          </label>
          <p class="hint pad top">{t("timer.studyNote")}</p>
        </section>
        {/if}
      {:else if section === "appearance"}
        <section class="card">
          <div class="label"><span>{t("settings.appearance.app")}</span><span class="hint">{t("settings.appearance.hint")}</span></div>
          <AppearancePicker />
        </section>
      {:else if section === "reading"}
        <section class="card">
          <ReadingSettingsPanel embedded />
        </section>
        <section class="card list">
          <h3 class="group">{t("settings.group.reader")}</h3>
          <label class="row">
            <span class="label"><span>{t("settings.textClarity")}</span><span class="hint">{t("settings.textClarity.hint")}</span></span>
            <input type="checkbox" class="switch" checked={s.reading.textClarity} onchange={(e) => settings.update((x) => (x.reading.textClarity = e.currentTarget.checked))} />
          </label>
          <label class="row">
            <span class="label"><span>{t("settings.linkPreviews")}</span><span class="hint">{t("settings.linkPreviews.hint")}</span></span>
            <input type="checkbox" class="switch" checked={s.reader.linkPreviews} onchange={(e) => settings.update((x) => (x.reader.linkPreviews = e.currentTarget.checked))} />
          </label>
        </section>
      {:else if section === "library"}
        <section class="card list">
          <h3 class="group">{t("settings.library.folders")}</h3>
          <p class="hint pad">{t("settings.library.foldersHint")}</p>
          {#each library.folders as folder (folder.path)}
            <div class="row">
              <span class="label"><span>{folder.name}</span><span class="hint">{folder.path}</span></span>
              <button class="btn small" onclick={() => library.removeFolder(folder)}>{t("settings.library.remove")}</button>
            </div>
          {:else}
            <p class="hint pad">{t("settings.library.none")}</p>
          {/each}
          <div class="row actions">
            <button class="btn small" onclick={() => library.addFolder("folder")}><Icon name="plus" size={13} stroke={2} />{t("library.addFolder")}</button>
          </div>
        </section>

        <section class="card list">
          <h3 class="group">{t("settings.library.clouds")}</h3>
          <p class="hint pad">{t("cloud.intro")}</p>
          {#each CLOUD_KINDS as kind (kind)}
            {@const connected = library.clouds.find((f) => f.kind === kind)}
            {@const found = library.view?.cloudSuggestions.find((c) => c.kind === kind)}
            {@const name = t(`cloud.${kind}` as MessageKey)}
            <div class="row">
              <span class="label">
                <span>{name}</span>
                <span class="hint" class:ok={!connected && found}>
                  {connected ? connected.path : found ? `${t("cloud.found")} · ${found.path}` : t("cloud.notFound", { name })}
                </span>
              </span>
              {#if connected}
                <button class="btn small" onclick={() => library.removeFolder(connected)}>{t("cloud.disconnect")}</button>
              {:else}
                <button class="btn small" class:primary={found} onclick={() => library.addFolder(kind)}>{found ? t("cloud.connect") : t("cloud.choose")}</button>
              {/if}
            </div>
          {/each}
        </section>

        <section class="card list">
          <h3 class="group">{t("settings.library.goodnotes")}</h3>
          <label class="row">
            <span class="label"><span>{t("settings.library.goodnotesToggle")}</span><span class="hint">{t("settings.library.goodnotesHint")}</span></span>
            <input type="checkbox" class="switch" checked={s.library.goodnotes} onchange={(e) => settings.update((x) => (x.library.goodnotes = e.currentTarget.checked))} />
          </label>
          {#if s.library.goodnotes}
            <div class="row">
              <span class="label">
                <span>{t("settings.library.goodnotesFolder")}</span>
                <span class="hint">{library.goodnotes?.path ?? t("goodnotes.setup")}</span>
              </span>
              {#if library.goodnotes}
                <button class="btn small" onclick={() => library.removeFolder(library.goodnotes!)}>{t("settings.library.remove")}</button>
              {:else}
                <button class="btn small primary" onclick={() => library.addFolder("goodnotes")}>{t("goodnotes.choose")}</button>
              {/if}
            </div>
            <label class="row">
              <span class="label"><span>{t("settings.library.notebooks.title")}</span></span>
              <input
                class="select text"
                value={s.library.notebooks.title}
                placeholder={t("goodnotes.title")}
                maxlength="60"
                onchange={(e) => settings.update((x) => (x.library.notebooks.title = e.currentTarget.value.trim()))}
              />
            </label>
            <label class="row">
              <span class="label"><span>{t("settings.library.notebooks.sort")}</span></span>
              <select class="select" value={s.library.notebooks.sort} onchange={(e) => settings.update((x) => (x.library.notebooks.sort = e.currentTarget.value as "recent" | "name"))}>
                <option value="recent">{t("settings.library.notebooks.sortRecent")}</option>
                <option value="name">{t("settings.library.notebooks.sortName")}</option>
              </select>
            </label>
            <label class="row">
              <span class="label"><span>{t("settings.library.notebooks.count")}</span></span>
              <select class="select" value={s.library.notebooks.count} onchange={(e) => settings.update((x) => (x.library.notebooks.count = Number(e.currentTarget.value)))}>
                {#each [3, 5, 8, 12, 24] as n (n)}<option value={n}>{n}</option>{/each}
              </select>
            </label>
            <label class="row">
              <span class="label"><span>{t("settings.library.notebooks.view")}</span></span>
              <select class="select" value={s.library.notebooks.view} onchange={(e) => settings.update((x) => (x.library.notebooks.view = e.currentTarget.value as "list" | "grid"))}>
                <option value="list">{t("settings.library.notebooks.list")}</option>
                <option value="grid">{t("settings.library.notebooks.grid")}</option>
              </select>
            </label>
            {#if s.library.notebooks.hidden.length}
              <div class="row">
                <span class="label"><span>{tn("notebooks.hiddenCount", s.library.notebooks.hidden.length)}</span></span>
                <button class="btn small" onclick={() => settings.update((x) => (x.library.notebooks.hidden = []))}>{t("notebooks.showHidden")}</button>
              </div>
            {/if}
          {/if}
        </section>
      {:else if section === "shortcuts"}
        <section class="card list">
          {#each SHORTCUTS as [label, keys] (label)}
            <div class="row">
              <span>{t(label)}</span>
              <kbd>{sc(keys)}</kbd>
            </div>
          {/each}
          <div class="row">
            <span>{t("settings.shortcuts.tools")}</span>
            <kbd>G · V · H · P · M · E · N · S</kbd>
          </div>
        </section>
      {:else if section === "about"}
        <section class="card about">
          <AppMark size={56} />
          <!-- Clicking the version 7 times reveals the beta switch (for testers). -->
          <h3>
            {#key pulse}
              <button class="version" class:tapped={pulse > 0} onclick={tapVersion} title={t("settings.about.versionTitle")}>{t("app.name")} {updates.current}</button>
            {/key}
          </h3>
          {#if betaNotice}<p class="beta-notice" role="status">{betaNotice}</p>{/if}
          <p>{t("settings.about.text")}</p>
          <div class="about-actions">
            <button class="btn" onclick={() => whatsNew.showCurrent()}>{t("settings.about.showWhatsNew")}</button>
          </div>
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

{#if leaving}
  <Dialog labelledBy="leave-beta-title" width={420} onClose={() => (leaving = null)}>
    <h2 id="leave-beta-title" class="dialog-title">{t("settings.update.leaveTitle")}</h2>
    {#if leaving === "none"}
      <p class="dialog-text">{t("settings.update.leaveNone")}</p>
      <div class="dialog-actions"><button class="btn primary" onclick={() => (leaving = null)}>{t("export.close")}</button></div>
    {:else}
      {@const target = leaving}
      <p class="dialog-text">{t(target.installable ? "settings.update.leaveText" : "settings.update.leavePortable", { version: target.version })}</p>
      <div class="dialog-actions">
        <button class="btn" onclick={() => (leaving = null)}>{t("settings.update.leaveLater")}</button>
        {#if target.installable}
          <button
            class="btn primary"
            onclick={() => {
              leaving = null;
              void updates.installNow();
            }}>{t("settings.update.leaveNow", { version: target.version })}</button
          >
        {:else}
          <button
            class="btn primary"
            onclick={() => {
              leaving = null;
              void openExternal(RELEASES_PAGE);
            }}>{t("settings.update.download")}</button
          >
        {/if}
      </div>
    {/if}
  </Dialog>
{/if}

<style>
  .dialog-title {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
  }
  .dialog-text {
    margin: -8px 0 0;
    color: var(--text-muted);
    line-height: 1.5;
  }
  .dialog-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }
  .version {
    padding: 4px 12px;
    border: 1px solid var(--hairline);
    border-radius: 999px;
    background: var(--field);
    color: inherit;
    font: inherit;
    cursor: pointer;
    transition:
      background 0.15s ease,
      border-color 0.15s ease;
  }
  .version:hover {
    background: var(--hover);
    border-color: var(--accent);
  }
  .version.tapped {
    animation: tap 0.22s ease;
  }
  @keyframes tap {
    40% {
      transform: scale(0.94);
      background: var(--accent-soft);
      border-color: var(--accent);
    }
  }
  .beta-notice {
    margin: 0;
    color: var(--accent);
    font-weight: 500;
  }
  .progress {
    width: 120px;
    height: 6px;
    border-radius: 3px;
    background: var(--track);
    overflow: hidden;
  }
  .progress span {
    display: block;
    height: 100%;
    border-radius: 3px;
    background: var(--accent);
    transition: width 0.2s ease;
  }
  .study-tools .main .label > span:first-child {
    font-weight: 600;
  }
  .study-tools .sub {
    padding-left: 34px;
  }
  .study-tools .sub.disabled {
    opacity: 0.5;
  }
  .screen {
    height: 100%;
    display: flex;
    flex-direction: column;
    background: var(--bg);
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
  .hint.ok {
    color: var(--ok);
  }
  .select.text {
    width: 220px;
  }
  .hint.pad.top {
    padding-top: 2px;
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
  .about-actions {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    justify-content: center;
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
