<script lang="ts">
  /** Compact list of PDFs (cloud and notebook cards). */
  import { t } from "../../i18n";
  import type { FileEntry } from "../../ipc/library";
  import { library } from "../library.svelte";
  import { titleOf } from "../titles";
  import { session } from "../../reader/session.svelte";
  import Thumb from "./Thumb.svelte";
  import Icon from "../../ui/Icon.svelte";

  interface Props {
    files: FileEntry[];
    /** Adds a small "hide" button to each row. */
    onHide?: (file: FileEntry) => void;
  }
  let { files, onHide }: Props = $props();

  function meta(file: FileEntry): string {
    const d = library.doc(file.path);
    return d && d.pages ? t("library.pageOf", { page: d.page, pages: d.pages }) : "";
  }
</script>

<ul>
  {#each files as file (file.path)}
    <li>
      <button class="row" onclick={() => session.openFromLibrary(file.path)} title={file.path}>
        <span class="mini"><Thumb {file} height={28} /></span>
        <span class="name">{titleOf(file.name)}</span>
        {#if file.cloudOnly}
          <span class="meta" title={t("library.cloudOnly")}><Icon name="cloud" size={13} /></span>
        {:else}
          <span class="meta">{meta(file)}</span>
        {/if}
      </button>
      {#if onHide}
        <button class="hide" aria-label={t("notebooks.hide")} title={t("notebooks.hide")} onclick={() => onHide(file)}>
          <Icon name="close" size={12} stroke={2.2} />
        </button>
      {/if}
    </li>
  {/each}
</ul>

<style>
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  li {
    display: flex;
    align-items: center;
    border-radius: 7px;
  }
  li:hover {
    background: var(--hover);
  }
  .row {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 6px 8px;
    border: none;
    background: transparent;
    text-align: left;
  }
  .mini {
    width: 24px;
    height: 28px;
    flex-shrink: 0;
    display: grid;
    place-items: center;
  }
  .mini :global(.placeholder) {
    padding: 0;
    gap: 0;
  }
  .mini :global(.placeholder span) {
    display: none;
  }
  .name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .meta {
    font-size: 11.5px;
    color: var(--text-muted);
    white-space: nowrap;
  }
  .hide {
    width: 24px;
    height: 24px;
    margin-right: 4px;
    border: none;
    border-radius: 6px;
    background: none;
    color: var(--text-muted);
    display: grid;
    place-items: center;
    opacity: 0;
  }
  li:hover .hide,
  .hide:focus-visible {
    opacity: 1;
  }
  .hide:hover {
    background: var(--pressed);
  }
</style>
