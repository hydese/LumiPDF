<script lang="ts">
  /**
   * Right side of the top bar, shared by the Library and the Reader: update (only when one is
   * available), study timer, dark mode, and settings.
   */
  import type { Snippet } from "svelte";
  import { t } from "../i18n";
  import { formatShortcut } from "../platform/shortcuts";
  import { platform } from "../platform/window";
  import { navigation } from "../app/navigation.svelte";
  import { readingMode } from "../dark/readingMode.svelte";
  import { updates } from "../updates/updates.svelte";
  import { formatClock, timer } from "../timer/timer.svelte";
  import TimerPanel from "../timer/ui/TimerPanel.svelte";
  import ReadingSettingsPanel from "./ReadingSettingsPanel.svelte";
  import IconButton from "./IconButton.svelte";
  import Icon from "./Icon.svelte";
  import Popover from "./Popover.svelte";

  interface Props {
    compactUpdate?: boolean;
    /** Show the reading settings button (Reader) instead of the app settings button (Library). */
    readingSettings?: boolean;
    before?: Snippet;
  }
  let { compactUpdate = false, readingSettings = false, before }: Props = $props();

  let open = $state<"timer" | "reading" | null>(null);
  let timerButton = $state<HTMLButtonElement | null>(null);
  let readingButton = $state<HTMLButtonElement | null>(null);

  const PHASE = { focus: "timer.focus", short: "timer.shortBreak", long: "timer.longBreak" } as const;
  const ringDash = $derived(`${88 * timer.progress} 88`);
  const toggle = (which: "timer" | "reading") => (open = open === which ? null : which);

  export function toggleTimer() {
    toggle("timer");
  }
</script>

{@render before?.()}

{#if updates.available}
  {@const title = t("update.title", { version: updates.available.version })}
  {#if compactUpdate}
    <IconButton icon="update" label={title} onclick={() => navigation.openSettings("general")}>
      <span class="dot"></span>
    </IconButton>
  {:else}
    <button class="update-pill" {title} onclick={() => navigation.openSettings("general")}>
      <Icon name="update" size={13} stroke={2.2} />
      {t("update.button")}
    </button>
  {/if}
{/if}

{#if timer.active}
  <button
    class="timer-pill"
    class:on={open === "timer"}
    bind:this={timerButton}
    title={t("timer.pillTitle", { phase: t(PHASE[timer.phase]), time: formatClock(timer.remainingMs) })}
    aria-label={t("timer.open")}
    aria-expanded={open === "timer"}
    onclick={() => toggle("timer")}
  >
    <svg width="20" height="20" viewBox="0 0 36 36" aria-hidden="true">
      <circle cx="18" cy="18" r="14" fill="none" stroke="var(--track)" stroke-width="4" />
      <circle cx="18" cy="18" r="14" fill="none" stroke={timer.phase === "focus" ? "var(--timer)" : "var(--ok)"} stroke-width="4" stroke-linecap="round" stroke-dasharray={ringDash} transform="rotate(-90 18 18)" />
    </svg>
    <span class:paused={!timer.running}>{formatClock(timer.remainingMs)}</span>
  </button>
{:else}
  <IconButton icon="timer" label={t("timer.open")} pressed={open === "timer"} bind:el={timerButton} onclick={() => toggle("timer")} />
{/if}

<IconButton
  icon="moon"
  label={t("dark.toggle")}
  title={t("dark.toggleTitle", { shortcut: formatShortcut("mod+shift+d", platform) })}
  pressed={readingMode.isDark}
  onclick={() => readingMode.toggle()}
/>

{#if readingSettings}
  <IconButton icon="sliders" label={t("dark.settings")} pressed={open === "reading"} bind:el={readingButton} onclick={() => toggle("reading")} />
{:else}
  <IconButton
    icon="gear"
    label={t("nav.settings")}
    title={t("nav.settingsTitle", { shortcut: formatShortcut("mod+,", platform) })}
    onclick={() => navigation.openSettings()}
  />
{/if}

{#if open === "timer"}
  <Popover anchor={timerButton} label={t("timer.title")} width={360} onClose={() => (open = null)}>
    <TimerPanel />
  </Popover>
{:else if open === "reading"}
  <Popover anchor={readingButton} label={t("dark.settings")} width={320} onClose={() => (open = null)}>
    <ReadingSettingsPanel
      onAllSettings={() => {
        open = null;
        navigation.openSettings("reading");
      }}
    />
  </Popover>
{/if}

<style>
  .update-pill {
    display: flex;
    align-items: center;
    gap: 6px;
    height: 26px;
    padding: 0 10px;
    margin-right: 6px;
    border-radius: 13px;
    border: none;
    background: var(--accent-soft);
    color: var(--accent-text);
    font-size: 12px;
    font-weight: 600;
    animation: arrive 400ms var(--ease);
  }
  .update-pill:hover {
    filter: brightness(0.97);
  }
  .dot {
    position: absolute;
    top: 6px;
    right: 6px;
    width: 7px;
    height: 7px;
    border-radius: 4px;
    background: var(--accent);
    box-shadow: 0 0 0 2px var(--bar);
  }
  .timer-pill {
    display: flex;
    align-items: center;
    gap: 7px;
    height: 30px;
    padding: 0 10px 0 6px;
    margin-right: 4px;
    border-radius: 15px;
    border: none;
    background: var(--field);
    font-weight: 500;
    font-variant-numeric: tabular-nums;
  }
  .timer-pill:hover,
  .timer-pill.on {
    background: var(--pressed);
  }
  .paused {
    color: var(--text-muted);
  }
  @keyframes arrive {
    from {
      opacity: 0;
      transform: translateY(-3px);
    }
  }
</style>
