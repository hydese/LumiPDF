<script lang="ts">
  /** Document tabs in the top bar. Middle-click closes; drag to reorder. */
  import { t } from "../../i18n";
  import { navigation } from "../../app/navigation.svelte";
  import { session } from "../session.svelte";
  import Icon from "../../ui/Icon.svelte";
  import { listWindows } from "../../ipc/windows";

  let dragging = $state<number | null>(null);

  // Right-click menu on a tab: move it to a new window or another window, or close it.
  let menu = $state<{ id: number; x: number; y: number; windows: Array<{ label: string; title: string }> } | null>(null);
  async function openMenu(e: MouseEvent, id: number) {
    e.preventDefault();
    const x = e.clientX, y = e.clientY;
    menu = { id, x, y, windows: [] };
    const windows = await listWindows();
    if (menu?.id === id) menu = { id, x, y, windows };
  }
  function pick(action: () => void) {
    menu = null;
    action();
  }
  let strip: HTMLDivElement;

  // Keep the active tab in view when it changes.
  $effect(() => {
    const id = session.activeId;
    queueMicrotask(() => strip?.querySelector(`[data-tab="${id}"]`)?.scrollIntoView({ block: "nearest", inline: "nearest" }));
  });
</script>

<div class="strip" role="tablist" aria-label={t("tabs.label")} bind:this={strip} data-tauri-drag-region>
  {#each session.tabs as tab, i (tab.id)}
    <div
      class="tab"
      class:active={tab.id === session.activeId}
      class:asleep={!tab.pdf && tab.kind === "pdf"}
      class:dragging={dragging === tab.id}
      data-tab={tab.id}
      role="tab"
      tabindex="0"
      aria-selected={tab.id === session.activeId}
      title={tab.kind === "sheet" ? t("sheets.tabTitle", { title: tab.title }) : tab.pdf ? tab.path : t("tabs.asleep", { title: tab.title })}
      draggable="true"
      onclick={() => session.activate(tab.id)}
      onkeydown={(e) => (e.key === "Enter" || e.key === " ") && session.activate(tab.id)}
      onauxclick={(e) => e.button === 1 && session.close(tab.id)}
      onmousedown={(e) => e.button === 1 && e.preventDefault()}
      ondragstart={(e) => {
        dragging = tab.id;
        e.dataTransfer?.setData("text/plain", String(tab.id));
        if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
      }}
      ondragover={(e) => {
        if (dragging === null) return;
        e.preventDefault();
        if (dragging !== tab.id) session.move(dragging, i);
      }}
      ondragend={() => (dragging = null)}
      oncontextmenu={(e) => void openMenu(e, tab.id)}
    >
      {#if tab.kind === "sheet"}<span class="kind"><Icon name="sheet" size={12} stroke={2} /></span>{/if}
      <span class="title">{tab.title}</span>
      {#if tab.kind === "pdf"}
        <button
          class="close popout"
          tabindex="-1"
          aria-label={t("tabs.newWindow")}
          title={t("tabs.newWindow")}
          onclick={(e) => {
            e.stopPropagation();
            void session.moveToNewWindow(tab.id);
          }}
        >
          <Icon name="popout" size={11} stroke={2.4} />
        </button>
      {/if}
      <button
        class="close"
        tabindex="-1"
        aria-label={t("tabs.close", { title: tab.title })}
        onclick={(e) => {
          e.stopPropagation();
          void session.close(tab.id);
        }}
      >
        <Icon name="close" size={11} stroke={2.4} />
      </button>
    </div>
  {/each}
  <button class="new" aria-label={t("tabs.new")} title={t("tabs.new")} onclick={() => navigation.go("library")}>
    <Icon name="plus" size={14} stroke={2.2} />
  </button>
</div>

<svelte:window
  onpointerdown={(e) => menu && !(e.target as HTMLElement).closest(".tab-menu") && (menu = null)}
  onkeydown={(e) => e.key === "Escape" && menu && (menu = null)}
  onblur={() => (menu = null)}
/>
{#if menu}
  {@const id = menu.id}
  {@const tab = session.tabs.find((x) => x.id === id)}
  <div class="tab-menu" role="menu" style:left="{menu.x}px" style:top="{menu.y}px">
    {#if tab?.kind === "pdf"}
      <button role="menuitem" onclick={() => pick(() => void session.moveToNewWindow(id))}><Icon name="popout" size={13} stroke={2} />{t("tabs.newWindow")}</button>
      {#each menu.windows as w (w.label)}
        <button role="menuitem" onclick={() => pick(() => void session.moveToWindow(id, w.label))}><Icon name="forward" size={13} stroke={2} />{t("tabs.moveTo", { window: w.title })}</button>
      {/each}
    {/if}
    <button role="menuitem" onclick={() => pick(() => void session.close(id))}><Icon name="close" size={13} stroke={2} />{t("tabs.closeTab")}</button>
  </div>
{/if}

<style>
  .strip {
    display: flex;
    align-items: center;
    gap: 4px;
    min-width: 0;
    width: 100%;
    height: 100%;
    overflow-x: auto;
    scrollbar-width: none;
  }
  .tab {
    position: relative;
    flex: 0 1 200px;
    min-width: 96px;
    height: 32px;
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 0 6px 0 12px;
    border-radius: 9px;
    color: var(--text-muted);
    transition: background var(--fast) var(--ease), color var(--fast) var(--ease);
  }
  .tab:hover {
    background: var(--hover);
    color: var(--text);
  }
  .tab.active {
    background: var(--segment-on);
    color: var(--text);
    box-shadow: var(--segment-shadow), 0 0 0 1px var(--hairline);
  }
  .tab.asleep .title {
    opacity: 0.75;
  }
  .tab.dragging {
    opacity: 0.5;
  }
  .tab + .tab:not(.active)::before {
    content: "";
    position: absolute;
    left: -3px;
    top: 9px;
    bottom: 9px;
    width: 1px;
    background: var(--hairline);
  }
  .tab.active + .tab::before,
  .tab:hover + .tab::before {
    display: none;
  }
  .kind {
    display: flex;
    color: var(--warm-text, #c46a1a);
    flex-shrink: 0;
  }
  .title {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: 500;
  }
  .close {
    width: 20px;
    height: 20px;
    flex-shrink: 0;
    border: none;
    border-radius: 6px;
    background: none;
    color: inherit;
    display: grid;
    place-items: center;
    opacity: 0;
  }
  .tab:hover .close,
  .tab.active .close {
    opacity: 0.8;
  }
  .popout {
    margin-right: -4px;
  }
  .tab-menu {
    position: fixed;
    z-index: 50;
    min-width: 210px;
    max-width: 320px;
    padding: 4px;
    border-radius: 10px;
    background: var(--surface-raised);
    box-shadow: var(--pop-shadow);
    display: flex;
    flex-direction: column;
  }
  .tab-menu button {
    display: flex;
    align-items: center;
    gap: 8px;
    height: 30px;
    padding: 0 10px;
    border: none;
    border-radius: 6px;
    background: none;
    color: var(--text);
    font-size: 13px;
    text-align: left;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .tab-menu button:hover {
    background: var(--hover);
  }
  .close:hover {
    background: var(--pressed);
    opacity: 1;
  }
  .new {
    width: 30px;
    height: 30px;
    flex-shrink: 0;
    border: none;
    border-radius: 8px;
    background: none;
    color: var(--text-muted);
    display: grid;
    place-items: center;
  }
  .new:hover {
    background: var(--hover);
    color: var(--text);
  }
</style>
