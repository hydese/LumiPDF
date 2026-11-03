<script lang="ts">
  /** A document in the Folders grid or search results. */
  import { formatDate, t } from "../../i18n";
  import type { FileEntry } from "../../ipc/library";
  import { titleOf } from "../titles";
  import Thumb from "./Thumb.svelte";

  interface Props {
    file: FileEntry;
    /** Shown under the title instead of the date, e.g. reading progress or the folder. */
    meta?: string;
    progress?: number;
    onOpen: () => void;
  }
  let { file, meta, progress, onOpen }: Props = $props();
</script>

<button class="item" onclick={onOpen} title={file.cloudOnly ? `${file.path}\n${t("library.cloudOnly")}` : file.path}>
  <span class="cover">
    <Thumb {file} height={168} />
    {#if progress !== undefined && progress > 0}
      <span class="progress" style:width="{progress}%"></span>
    {/if}
  </span>
  <span class="title">{titleOf(file.name)}</span>
  <span class="meta">{meta ?? t("library.modified", { date: formatDate(file.modified, { day: "numeric", month: "short", year: "numeric" }) })}</span>
</button>

<style>
  .item {
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-width: 0;
    padding: 0;
    border: none;
    background: none;
    text-align: left;
  }
  .cover {
    position: relative;
    aspect-ratio: 3 / 4;
    border-radius: var(--radius-m);
    background: var(--thumb-bg);
    border: 1px solid var(--hairline);
    display: grid;
    place-items: center;
    padding: 12%;
    overflow: hidden;
    transition: border-color var(--medium) var(--ease), transform var(--medium) var(--ease);
  }
  .cover :global(.thumb) {
    height: 100% !important;
    width: 100%;
  }
  .cover :global(img),
  .cover :global(.placeholder) {
    max-height: 100% !important;
    max-width: 100%;
  }
  .cover :global(.placeholder) {
    height: 100% !important;
    width: auto !important;
    aspect-ratio: 3 / 4;
  }
  .item:hover .cover {
    border-color: color-mix(in srgb, var(--accent) 35%, var(--hairline));
    transform: translateY(-1px);
  }
  .progress {
    position: absolute;
    left: 0;
    bottom: 0;
    height: 3px;
    background: var(--accent);
  }
  .title {
    font-weight: 500;
    font-size: 12.5px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .meta {
    margin-top: -6px;
    color: var(--text-muted);
    font-size: 11.5px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
