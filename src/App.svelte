<script lang="ts">
  /**
   * App shell: starts the services, routes between the three screens, and owns the global
   * keyboard shortcuts. Screens own their own layout.
   */
  import { onMount } from "svelte";
  import { detectLocale, setLocale, t } from "./lib/i18n";
  import { isPrimaryModifier } from "./lib/platform/shortcuts";
    import { onDocumentsOpened, takePendingDocuments } from "./lib/ipc/documents";
  import { settings } from "./lib/settings/store.svelte";
  import { readingMode } from "./lib/dark/readingMode.svelte";
  import { appearance } from "./lib/app/appearance.svelte";
  import { navigation } from "./lib/app/navigation.svelte";
  import { library } from "./lib/library/library.svelte";
  import { session } from "./lib/reader/session.svelte";
  import { timers } from "./lib/timer/timers.svelte";
  import { ringer } from "./lib/timer/ringer.svelte";
  import { annotations, DEFAULT_TOOL, type Tool } from "./lib/annotations/store.svelte";
  import { guardClose, minimizeWindow, platform, quitApp } from "./lib/platform/window";
  import RingingDialog from "./lib/timer/ui/RingingDialog.svelte";
  import Dialog from "./lib/ui/Dialog.svelte";
  import { studyClock } from "./lib/timer/study.svelte";
  import { sheets } from "./lib/sheets/sheets.svelte";
  import { studyTools } from "./lib/app/studyTools.svelte";
  import { fullscreen } from "./lib/app/fullscreen.svelte";
  import { updates } from "./lib/updates/updates.svelte";
  import { whatsNew } from "./lib/whatsnew/whatsnewState.svelte";
  import LibraryScreen from "./lib/screens/LibraryScreen.svelte";
  import ReaderScreen from "./lib/screens/ReaderScreen.svelte";
  import SettingsScreen from "./lib/screens/SettingsScreen.svelte";
  import StatsScreen from "./lib/screens/StatsScreen.svelte";
  import PasswordDialog from "./lib/ui/PasswordDialog.svelte";
  import WhatsNewDialog from "./lib/whatsnew/WhatsNewDialog.svelte";
  import Welcome from "./lib/welcome/Welcome.svelte";
  import type BarActions from "./lib/ui/BarActions.svelte";

  let ready = $state(false);
  let searchInput = $state<HTMLInputElement | null>(null);
  let findOpen = $state(false);
  let exportOpen = $state(false);
  let findInput = $state<HTMLInputElement | null>(null);
  let barActions = $state<BarActions | null>(null);
  const locale = $derived(settings.value.app.locale);

  $effect(() => setLocale(locale));
  $effect(() => {
    void settings.value.timer;
    timers.syncWithSettings();
  });
  let askClose = $state(false);

  // Never leave a blank window: a screen with nothing to show (the reader with no tabs left, the
  // Stats screen after study stats were turned off) falls back to the Library.
  $effect(() => {
    if (!ready) return;
    const screen = navigation.screen;
    if ((screen === "reader" && session.tabs.length === 0 && !session.loadingName) || (screen === "stats" && !studyTools.stats)) {
      navigation.go("library");
    }
  });

  /** Saves annotations and study time, then closes for real. */
  async function quitSaved() {
    await Promise.allSettled([annotations.flush(), studyClock.flush(), sheets.flush()]);
    // Automatic updates: a downloaded update installs as LumiPDF closes.
    if (updates.installOnQuit) await updates.installNow();
    quitApp();
  }

  function onKeydown(event: KeyboardEvent) {
    if (event.key === "F11") {
      event.preventDefault();
      void fullscreen.toggle();
      return;
    }
    if (event.key === "Escape" && fullscreen.on && !event.defaultPrevented && !(event.target as HTMLElement | null)?.closest?.("input, textarea, [role='dialog']")) {
      event.preventDefault();
      void fullscreen.exit();
      return;
    }
    if (event.key === "Escape" && navigation.screen === "settings" && !event.defaultPrevented) {
      navigation.closeSettings();
      return;
    }
    if (event.key === "Escape" && navigation.screen === "stats" && !event.defaultPrevented) {
      navigation.go("library");
      return;
    }
    const typing = (event.target as HTMLElement | null)?.closest?.("input, textarea, select, [contenteditable='true']");
    const reading = navigation.screen === "reader" && session.current !== null;
    if (reading && !typing && !event.ctrlKey && !event.metaKey && !event.altKey) {
      const tools: Record<string, Tool> = { g: "hand", v: "select", h: "highlight", p: "pen", m: "marker", e: "eraser", n: "note", s: "snip" };
      const tool = tools[event.key.toLowerCase()];
      if (tool) {
        event.preventDefault();
        annotations.tool = tool;
        return;
      }
      if (event.key === "Escape" && annotations.tool !== DEFAULT_TOOL && !event.defaultPrevented) {
        annotations.tool = DEFAULT_TOOL;
        return;
      }
    }
    if (!isPrimaryModifier(event, platform) || event.altKey) return;
    if (reading && !typing) {
      const k = event.key.toLowerCase();
      if (k === "z" || k === "y") {
        event.preventDefault();
        if (k === "y" || event.shiftKey) annotations.redo();
        else annotations.undo();
        return;
      }
    }
    const key = event.key.toLowerCase();
    const inReader = navigation.screen === "reader" && session.current !== null;
    const c = session.controller;
    const run = (action: () => void) => {
      event.preventDefault();
      action();
    };

    if (key === "tab" && session.tabs.length) {
      return run(() => session.cycle(event.shiftKey ? -1 : 1));
    }
    if (!event.shiftKey && /^[1-9]$/.test(key) && session.tabs.length) {
      return run(() => session.activateIndex(Number(key)));
    }
    if (event.shiftKey) {
      if (key === "d") run(() => readingMode.toggle());
      else if (key === "t" && studyTools.timer) run(() => timers.toggleCurrent());
      return;
    }
    switch (key) {
      case "o":
        return run(() => void session.openWithDialog());
      case "k":
        return run(() => {
          navigation.go("library");
          queueMicrotask(() => searchInput?.focus());
        });
      case ",":
        return run(() => navigation.openSettings());
    }
    if (key === "w" && navigation.screen === "reader" && session.active) return run(() => void session.close());
    if (!inReader) return;
    switch (key) {
      case "f":
        return run(() => {
          findOpen = true;
          findInput?.focus();
          findInput?.select();
        });
      case "d":
        return run(() => session.toggleBookmark());
      case "e":
        return run(() => (exportOpen = true));
      case "\\":
        return run(() => settings.update((s) => (s.reader.sidebarOpen = !s.reader.sidebarOpen)));
      case "=":
      case "+":
        return run(() => c?.zoomIn());
      case "-":
        return run(() => c?.zoomOut());
      case "0":
        return run(() => c?.setScale("page-width"));
      case "w":
        return run(() => void session.close());
    }
  }

  onMount(() => {
    const stops: Array<() => void> = [];
    const unlisten = onDocumentsOpened(([first]) => first && session.open(first));

    void (async () => {
      // Settings first, so the first screen is already in the right theme and language.
      await settings.load();
      // First start: the Windows language, if LumiPDF speaks it (changeable in the welcome).
      if (!settings.value.app.locale) settings.update((s) => (s.app.locale = detectLocale()));
      setLocale(settings.value.app.locale);
      stops.push(appearance.start(), readingMode.start(), studyClock.start());
      timers.syncWithSettings();
      // Every close goes through here: save what's pending, or ask first if a timer is running.
      stops.push(
        guardClose(
          () => true,
          () => {
            if (settings.value.timer.askOnClose && timers.busy) askClose = true;
            else void quitSaved();
          },
        ),
      );
      ready = true;
      updates.beforeInstall = () => Promise.allSettled([annotations.flush(), studyClock.flush(), sheets.flush()]);
      updates.syncBeta(settings.value.app.lastSeenVersion);
      whatsNew.onLaunch();
      if (settings.value.app.checkForUpdates) stops.push(updates.checkSoon());
      await Promise.all([library.refresh(), sheets.refresh()]);
      const [pending] = await takePendingDocuments().catch(() => []);
      if (pending) {
        await session.open(pending);
      } else if (settings.value.app.startScreen === "last-document") {
        const titles = studyTools.sheets ? Object.fromEntries(sheets.list.map((x) => [x.id, x.title])) : {};
        await session.restore(settings.value.reader.openTabs, settings.value.reader.activeTab, titles);
      }
    })();

    // The library may change outside LumiPDF (files added to a folder): refresh on return.
    let lastRefresh = Date.now();
    const onFocus = () => {
      if (navigation.screen === "library" && Date.now() - lastRefresh > 5000) {
        lastRefresh = Date.now();
        void library.refresh();
      }
    };
    window.addEventListener("focus", onFocus);

    return () => {
      for (const stop of stops) stop();
      window.removeEventListener("focus", onFocus);
      void unlisten.then((stop) => stop());
    };
  });
</script>

<svelte:window onkeydown={onKeydown} />

{#if ready}
  {#key locale}
    <div class="app" class:fullscreen={fullscreen.on}>
      <!-- The reader stays mounted while Settings is open, so the document keeps its place. -->
      {#if session.tabs.length}
        <div class="layer" hidden={navigation.screen !== "reader"}>
          <ReaderScreen bind:exportOpen bind:findOpen bind:findInput bind:barActions />
        </div>
      {/if}
      {#if navigation.screen === "library"}
        <div class="layer"><LibraryScreen bind:searchInput bind:barActions /></div>
      {:else if navigation.screen === "stats" && studyTools.stats}
        <div class="layer"><StatsScreen bind:barActions /></div>
      {:else if navigation.screen === "settings"}
        <div class="layer"><SettingsScreen /></div>
      {/if}

      {#if session.loadingName}
        <div class="toast" role="status">{t("open.loading", { name: session.loadingName })}</div>
      {:else if session.error && navigation.screen !== "library"}
        <div class="toast error" role="alert">
          {session.error}
          <button class="link-button" onclick={() => (session.error = null)}>{t("dark.close")}</button>
        </div>
      {/if}
    </div>

    {#if session.password}
      <PasswordDialog name={session.password.name} retry={session.password.retry} onSubmit={(p) => session.answerPassword(p)} />
    {/if}
    {#if ringer.ringing}
      <RingingDialog />
    {/if}
    {#if askClose}
      <Dialog labelledBy="close-title" width={400} onClose={() => (askClose = false)}>
        <h2 id="close-title" class="dialog-title">{t("close.title")}</h2>
        <p class="dialog-text">{t("close.text")}</p>
        <div class="dialog-actions">
          <button class="btn" onclick={() => quitSaved()}>{t("close.quit")}</button>
          <button
            class="btn primary"
            onclick={() => {
              askClose = false;
              minimizeWindow();
            }}>{t("close.keep")}</button
          >
        </div>
      </Dialog>
    {/if}
    {#if whatsNew.welcome}
      <Welcome steps={whatsNew.welcome} notes={whatsNew.welcomeNotes} onDone={() => whatsNew.finishWelcome()} />
    {/if}
    {#if whatsNew.notes}
      <WhatsNewDialog notes={whatsNew.notes} previousVersion={whatsNew.previousVersion} onClose={() => whatsNew.dismiss()} />
    {/if}
  {/key}
{/if}

<style>
  .app {
    height: 100%;
    position: relative;
  }
  /* Full screen: the top bar floats over the page and hides until the pointer reaches the top. */
  .app.fullscreen :global(.screen > .bar) {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    z-index: 50;
    transform: translateY(calc(-100% + 4px));
    opacity: 0;
    transition:
      transform 0.18s ease,
      opacity 0.18s ease;
    box-shadow: var(--pop-shadow);
  }
  .app.fullscreen :global(.screen > .bar:hover),
  .app.fullscreen :global(.screen > .bar:focus-within) {
    transform: none;
    opacity: 1;
  }
  .layer {
    position: absolute;
    inset: 0;
  }
  .layer[hidden] {
    display: block;
    visibility: hidden;
    pointer-events: none;
  }
  .toast {
    position: fixed;
    left: 50%;
    bottom: 24px;
    transform: translateX(-50%);
    z-index: 60;
    display: flex;
    align-items: center;
    gap: 12px;
    max-width: min(560px, calc(100vw - 48px));
    padding: 10px 16px;
    border-radius: 10px;
    background: var(--surface-raised);
    box-shadow: var(--pop-shadow);
    color: var(--text);
  }
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
  .toast.error {
    color: var(--danger);
  }
</style>
