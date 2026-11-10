<script lang="ts">
  /**
   * App shell: starts the services, routes between the three screens, and owns the global
   * keyboard shortcuts. Screens own their own layout.
   */
  import { onMount } from "svelte";
  import { detectLocale, setLocale, t } from "./lib/i18n";
  import { isFullscreenKey, isPrimaryModifier, isTabCycleKey } from "./lib/platform/shortcuts";
  import { onMenu, setMenuLanguage, type MenuAction } from "./lib/ipc/menu";
  import { openExternal } from "./lib/ipc/system";
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
  import { guardClose, minimizeWindow, platform, quitApp, watchFileDrag } from "./lib/platform/window";
  import Icon from "./lib/ui/Icon.svelte";
  import PerfPanel from "./lib/perf/PerfPanel.svelte";
  import { setSpotTracking } from "./lib/dark/imageSpots";
  import { restorePhotoOverrides } from "./lib/dark/photoTraining.svelte";
  import { keepTimersAwake } from "./lib/timer/keepAwake";
  import { isMainWindow, onSettingsSavedElsewhere, onWindowEvent, openWindow, takeMovedTab, type MovedTab } from "./lib/ipc/windows";
  import { getCurrentWindow } from "@tauri-apps/api/window";
  import { emit, listen } from "@tauri-apps/api/event";
  import { perf } from "./lib/perf/perf.svelte";
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
  // The language is switched while `locale` is computed, before the {#key locale} block below
  // redraws the app, so the new screens read the new language. (Switching it in an effect ran
  // after the redraw and left the old language on screen until the next change.)
  const locale = $derived.by(() => {
    const code = settings.value.app.locale;
    setLocale(code);
    return code;
  });

  // macOS: the menu bar follows the language too.
  $effect(() => {
    void locale;
    if (platform === "macos" && ready) void setMenuLanguage().catch(() => {});
  });
  $effect(() => {
    void settings.value.timer;
    timers.syncWithSettings();
  });
  let askClose = $state(false);
  /** A PDF is being dragged over the window. */
  let dragging = $state(false);
  $effect(() => watchFileDrag((on) => (dragging = on)));

  // Never leave a blank window: a screen with nothing to show (the reader with no tabs left, the
  // Stats screen after study stats were turned off) falls back to the Library.
  $effect(() => {
    if (!ready) return;
    const screen = navigation.screen;
    if ((screen === "reader" && session.tabs.length === 0 && !session.loadingName) || (screen === "stats" && !studyTools.stats)) {
      navigation.go("library");
    }
  });

  /** Closing the window or ⌘Q: ask first if a timer would be lost, else save and quit. */
  function requestQuit() {
    if (settings.value.timer.askOnClose && timers.busy) askClose = true;
    else void quitSaved();
  }

  /** macOS menu bar items (the same actions as the keyboard shortcuts). */
  function onMenuAction(action: MenuAction) {
    const inReader = navigation.screen === "reader" && session.current !== null;
    const typing = (document.activeElement as HTMLElement | null)?.closest?.("input, textarea, [contenteditable='true']");
    switch (action) {
      case "settings":
        return navigation.openSettings();
      case "quit":
        // ⌘Q quits LumiPDF, every window (each saves first).
        return void emitQuitAll();
      case "open":
        return void session.openWithDialog();
      case "close-tab":
        if (navigation.screen === "reader" && session.active) void session.close();
        return;
      case "export":
        if (inReader) exportOpen = true;
        return;
      case "find":
        if (!inReader) return;
        findOpen = true;
        queueMicrotask(() => {
          findInput?.focus();
          findInput?.select();
        });
        return;
      case "undo":
      case "redo":
        // In a text field the field's own undo; elsewhere the annotations'.
        if (typing) document.execCommand(action);
        else if (inReader) action === "undo" ? annotations.undo() : annotations.redo();
        return;
      case "fullscreen":
        return void fullscreen.toggle();
      case "github":
        return void openExternal("https://github.com/hydese/LumiPDF");
    }
  }

  /** Saves annotations and study time, then closes for real. */
  /** Quit from the menu: every window saves and closes. */
  async function emitQuitAll() {
    if (settings.value.timer.askOnClose && timers.busy) return void (askClose = true);
    await emit("app-quit").catch(() => {});
  }

  async function quitSaved() {
    await Promise.allSettled([annotations.flush(), studyClock.flush(), sheets.flush()]);
    // Automatic updates: a downloaded update installs as LumiPDF closes.
    if (updates.installOnQuit) await updates.installNow();
    quitApp();
  }

  function onKeydown(event: KeyboardEvent) {
    if (isFullscreenKey(event, platform)) {
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
    // Back to where a followed link was clicked: Alt+← (⌘[ on the Mac, below).
    if (reading && !typing && event.altKey && event.key === "ArrowLeft" && !event.ctrlKey && !event.metaKey) {
      if (session.controller?.goBack()) event.preventDefault();
      return;
    }
    if (reading && !typing && !event.ctrlKey && !event.metaKey && !event.altKey) {
      // Hold O: the page in its original colours, while the key is down.
      if (event.key.toLowerCase() === "o") {
        event.preventDefault();
        if (!event.repeat) readingMode.original = true;
        return;
      }
      // Page by page: ← → (when the page fits the width), PgUp/PgDn, Space, Home/End.
      const c = session.controller;
      if (c) {
        const page = session.view?.page ?? 1;
        const fits = c.container.scrollWidth <= c.container.clientWidth + 2;
        const turn: Record<string, number | undefined> = {
          ArrowRight: fits ? page + 1 : undefined,
          ArrowLeft: fits ? page - 1 : undefined,
          PageDown: page + 1,
          PageUp: page - 1,
          " ": event.shiftKey ? page - 1 : page + 1,
          Home: 1,
          End: Number.MAX_SAFE_INTEGER,
        };
        const target = turn[event.key];
        if (target !== undefined) {
          event.preventDefault();
          c.goToPage(target);
          return;
        }
      }
      const tools: Record<string, Tool> = { g: "hand", v: "select", h: "select", p: "pen", m: "marker", e: "eraser", n: "note", s: "snip" };
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
    if (isTabCycleKey(event, platform) && session.tabs.length) {
      event.preventDefault();
      session.cycle(event.shiftKey ? -1 : 1);
      return;
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
      case "[":
        return run(() => c?.goBack());
      case "n":
        // Ctrl/⌘+Shift+N: a new window.
        if (event.shiftKey) return run(() => void openWindow().catch(() => {}));
        return;
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
      // Timers, updates and "What's new" belong to the main window; extra windows only read.
      if (isMainWindow) timers.syncWithSettings();
      // Every close goes through here: save what's pending, or ask first if a timer is running.
      stops.push(
        guardClose(
          () => true,
          requestQuit,
        ),
      );
      ready = true;
      updates.beforeInstall = () => Promise.allSettled([annotations.flush(), studyClock.flush(), sheets.flush()]);
      updates.syncBeta(settings.value.app.lastSeenVersion);
      if (isMainWindow) {
        whatsNew.onLaunch();
        if (settings.value.app.checkForUpdates) stops.push(updates.checkSoon());
      }
      await Promise.all([library.refresh(), sheets.refresh()]);
      if (!isMainWindow) {
        // An extra window: the tab it was opened for, or the Library.
        const moved = await takeMovedTab();
        if (moved) await session.openMoved(moved);
        return;
      }
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
    const unlistenMenu = platform === "macos" ? onMenu(onMenuAction) : null;
    // Other windows: a tab moved here, a PDF this window has, settings changed elsewhere.
    const unlistenWindows = [
      onWindowEvent<string>("window-tab", (json) => void session.openMoved(JSON.parse(json) as MovedTab)),
      onWindowEvent<string>("window-show-doc", (path) => session.showDoc(path)),
      listen("app-quit", () => void quitSaved()).catch(() => () => {}),
      onSettingsSavedElsewhere(() =>
        void settings.load((loaded, current) => {
          // Each window keeps its own open tabs.
          loaded.reader.openTabs = current.reader.openTabs;
          loaded.reader.activeTab = current.reader.activeTab;
        }),
      ),
    ];

    return () => {
      void unlistenMenu?.then((stop) => stop());
      for (const u of unlistenWindows) void u.then((stop) => stop());
      for (const stop of stops) stop();
      window.removeEventListener("focus", onFocus);
      void unlisten.then((stop) => stop());
    };
  });
  // The window is named after the PDF being read (taskbar, Alt+Tab, the Window menu).
  $effect(() => {
    const title = navigation.screen === "reader" && session.active ? `${session.active.title} – LumiPDF` : "LumiPDF";
    try {
      void getCurrentWindow().setTitle(title).catch(() => {});
    } catch {
      document.title = title;
    }
  });
  // Mac: the green button's native full screen becomes LumiPDF's own.
  $effect(() => fullscreen.watchNative());
  // Timers ring on time even while the window is hidden or minimised.
  $effect(() => keepTimersAwake(timers.busy));
  // Beta only: bring the performance panel back if it was on last time.
  $effect(() => {
    if (updates.isBeta) {
      perf.restore();
      setSpotTracking(true);
    }
    restorePhotoOverrides();
  });
</script>

<svelte:window
  onkeydown={onKeydown}
  onkeyup={(e) => {
    if (e.key.toLowerCase() === "o") readingMode.original = false;
  }}
  onblur={() => (readingMode.original = false)}
/>

{#if perf.on && updates.isBeta}<PerfPanel />{/if}

{#if dragging}
  <div class="drop-overlay" aria-hidden="true">
    <div class="drop-card">
      <span class="drop-icon"><Icon name="open" size={28} stroke={1.8} /></span>
      <strong>{t("open.dropHere")}</strong>
      <span>{t("open.dropHereHint")}</span>
    </div>
  </div>
{/if}

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
      <PasswordDialog name={session.password.name} retry={session.password.retry} onSubmit={(p, keep) => session.answerPassword(p, keep)} />
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
  .drop-overlay {
    position: fixed;
    inset: 0;
    z-index: 200;
    display: grid;
    place-items: center;
    pointer-events: none;
    background: color-mix(in srgb, var(--accent) 10%, transparent);
    box-shadow: inset 0 0 0 3px var(--accent);
    animation: drop-in 140ms var(--ease);
  }
  .drop-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: 26px 36px;
    border-radius: 18px;
    border: 2px dashed var(--accent);
    background: var(--surface);
    box-shadow: var(--card-shadow), 0 20px 60px rgba(0, 0, 0, 0.12);
    color: var(--text);
  }
  .drop-card strong {
    font-size: 17px;
  }
  .drop-card span:last-child {
    color: var(--text-muted);
    font-size: 13px;
  }
  .drop-icon {
    width: 52px;
    height: 52px;
    display: grid;
    place-items: center;
    margin-bottom: 4px;
    border-radius: 14px;
    background: var(--accent);
    color: var(--on-accent);
  }
  @keyframes drop-in {
    from {
      opacity: 0;
    }
  }
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
