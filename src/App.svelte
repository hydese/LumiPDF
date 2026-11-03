<script lang="ts">
  /**
   * App shell: starts the services, routes between the three screens, and owns the global
   * keyboard shortcuts. Screens own their own layout.
   */
  import { onMount } from "svelte";
  import { setLocale, t } from "./lib/i18n";
  import { isPrimaryModifier } from "./lib/platform/shortcuts";
  import { platform } from "./lib/platform/window";
  import { onDocumentsOpened, takePendingDocuments } from "./lib/ipc/documents";
  import { settings } from "./lib/settings/store.svelte";
  import { readingMode } from "./lib/dark/readingMode.svelte";
  import { appearance } from "./lib/app/appearance.svelte";
  import { navigation } from "./lib/app/navigation.svelte";
  import { library } from "./lib/library/library.svelte";
  import { session } from "./lib/reader/session.svelte";
  import { timer } from "./lib/timer/timer.svelte";
  import { studyClock } from "./lib/timer/study.svelte";
  import { updates } from "./lib/updates/updates.svelte";
  import { whatsNew } from "./lib/whatsnew/whatsnewState.svelte";
  import LibraryScreen from "./lib/screens/LibraryScreen.svelte";
  import ReaderScreen from "./lib/screens/ReaderScreen.svelte";
  import SettingsScreen from "./lib/screens/SettingsScreen.svelte";
  import PasswordDialog from "./lib/ui/PasswordDialog.svelte";
  import WhatsNewDialog from "./lib/whatsnew/WhatsNewDialog.svelte";
  import type BarActions from "./lib/ui/BarActions.svelte";

  let ready = $state(false);
  let searchInput = $state<HTMLInputElement | null>(null);
  let findOpen = $state(false);
  let findInput = $state<HTMLInputElement | null>(null);
  let barActions = $state<BarActions | null>(null);
  const locale = $derived(settings.value.app.locale);

  $effect(() => setLocale(locale));
  $effect(() => {
    void settings.value.timer;
    timer.syncWithSettings();
  });

  function onKeydown(event: KeyboardEvent) {
    if (event.key === "Escape" && navigation.screen === "settings" && !event.defaultPrevented) {
      navigation.closeSettings();
      return;
    }
    if (!isPrimaryModifier(event, platform) || event.altKey) return;
    const key = event.key.toLowerCase();
    const inReader = navigation.screen === "reader" && session.current !== null;
    const c = session.controller;
    const run = (action: () => void) => {
      event.preventDefault();
      action();
    };

    if (event.shiftKey) {
      if (key === "d") run(() => readingMode.toggle());
      else if (key === "t") run(() => timer.toggle());
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
      setLocale(settings.value.app.locale);
      stops.push(appearance.start(), readingMode.start(), studyClock.start());
      timer.syncWithSettings();
      ready = true;
      whatsNew.onLaunch();
      if (settings.value.app.checkForUpdates) stops.push(updates.checkSoon());
      await library.refresh();
      const [pending] = await takePendingDocuments().catch(() => []);
      if (pending) {
        await session.open(pending);
      } else if (settings.value.app.startScreen === "last-document" && library.continueReading[0]) {
        await session.openFromLibrary(library.continueReading[0].path);
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
    <div class="app">
      <!-- The reader stays mounted while Settings is open, so the document keeps its place. -->
      {#if session.current}
        <div class="layer" hidden={navigation.screen !== "reader"}>
          <ReaderScreen bind:findOpen bind:findInput bind:barActions />
        </div>
      {/if}
      {#if navigation.screen === "library"}
        <div class="layer"><LibraryScreen bind:searchInput bind:barActions /></div>
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
  .toast.error {
    color: var(--danger);
  }
</style>
