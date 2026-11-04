<script lang="ts">
  /**
   * Browse a library folder level by level: subfolders first, then the PDFs at this level.
   * The path bar walks back up.
   */
  import { t, tn, type MessageKey } from "../../i18n";
  import { library, type Subfolder } from "../library.svelte";
  import { session } from "../../reader/session.svelte";
  import type { FileEntry, FolderView } from "../../ipc/library";
  import ShelfItem from "./ShelfItem.svelte";
  import Thumb from "./Thumb.svelte";
  import Icon from "../../ui/Icon.svelte";
  import { settings } from "../../settings/store.svelte";
  import type { FolderSort } from "../../settings/schema";
  import { sortFiles, sortFolders } from "../sorting";

  interface Props {
    /** Top-level folders, shown when nothing is open yet. */
    folders: FolderView[];
  }
  let { folders }: Props = $props();

  const loc = $derived(library.location);
  const root = $derived(library.locationFolder);
  const crumbs = $derived(loc?.dir ? loc.dir.split("/") : []);

  function rootName(f: FolderView): string {
    return f.kind === "folder" || f.kind === "goodnotes" ? f.name : t(`cloud.${f.kind}` as MessageKey);
  }
  function metaOf(file: FileEntry): string | undefined {
    const d = library.doc(file.path);
    return d && d.pages ? t("library.pageOf", { page: d.page, pages: d.pages }) : undefined;
  }
  function progressOf(file: FileEntry): number | undefined {
    const d = library.doc(file.path);
    return d && d.pages ? Math.round((d.page / d.pages) * 100) : undefined;
  }
  const sort = $derived(settings.value.library.sort);
  const opened = (path: string) => library.doc(path)?.lastOpened ?? 0;
  /** Most recent opening of any file inside a subfolder (for "Recently opened"). */
  function folderRecency(files: FileEntry[], dir: string): number {
    let best = 0;
    for (const f of files) if (f.dir === dir || f.dir.startsWith(dir + "/")) best = Math.max(best, opened(f.path));
    return best;
  }
  const topFolders = $derived(sortFolders(folders, sort, (f) => rootName(f), (f) => folderRecency(f.files, "")));
  const subfolders = $derived(
    library.level && root ? sortFolders(library.level.subfolders, sort, (s) => s.name, (s) => folderRecency(root.files, s.dir)) : [],
  );
  const files = $derived(library.level ? sortFiles(library.level.files, sort, opened) : []);
  const asSubfolder = (f: FolderView): Subfolder => ({ name: rootName(f), dir: "", count: f.files.length, preview: f.files.slice(0, 3) });
</script>

{#snippet tile(sub: Subfolder, onOpen: () => void, title: string)}
  <button class="folder" onclick={onOpen} {title}>
    <span class="stack">
      {#each sub.preview.slice(0, 3).reverse() as file, i (file.path)}
        <span class="sheet s{sub.preview.length - 1 - i}"><Thumb {file} height={92} /></span>
      {:else}
        <span class="empty-folder"><Icon name="folder" size={30} stroke={1.4} /></span>
      {/each}
    </span>
    <span class="label">
      <Icon name="folder" size={14} />
      <span class="name">{sub.name}</span>
    </span>
    <span class="count">{tn("folders.count", sub.count)}</span>
  </button>
{/snippet}

<div class="toolbar">
<nav class="path" aria-label={t("folders.root")}>
  <button class="crumb" class:current={!loc} onclick={() => (library.location = null)}>{t("folders.root")}</button>
  {#if root && loc}
    <Icon name="forward" size={12} />
    <button class="crumb" class:current={!loc.dir} onclick={() => library.browse(root.path)}>{rootName(root)}</button>
    {#each crumbs as name, i (i)}
      <Icon name="forward" size={12} />
      <button class="crumb" class:current={i === crumbs.length - 1} onclick={() => library.browse(root.path, crumbs.slice(0, i + 1).join("/"))}>{name}</button>
    {/each}
  {/if}
</nav>
<label class="sort">
  <Icon name="list" size={13} />
  <span class="visually-hidden">{t("folders.sort")}</span>
  <select class="select" value={sort} aria-label={t("folders.sort")} onchange={(e) => settings.update((s) => (s.library.sort = e.currentTarget.value as FolderSort))}>
    <option value="name">{t("folders.sort.name")}</option>
    <option value="name-desc">{t("folders.sort.nameDesc")}</option>
    <option value="recent">{t("folders.sort.recent")}</option>
  </select>
</label>
</div>

{#if !root}
  <div class="grid">
    {#each topFolders as f (f.path)}
      {@render tile(asSubfolder(f), () => library.browse(f.path), f.path)}
    {/each}
  </div>
{:else if !root.available}
  <p class="note">{t("library.folderMissing")}</p>
{:else if library.level}
  {#if root.truncated}
    <p class="note">{t("library.folderTruncated", { count: root.files.length })}</p>
  {/if}
  {#if library.level.subfolders.length || library.level.files.length}
    <div class="grid">
      {#each subfolders as sub (sub.dir)}
        {@render tile(sub, () => library.browse(root.path, sub.dir), sub.dir)}
      {/each}
      {#each files as file (file.path)}
        <ShelfItem {file} meta={metaOf(file)} progress={progressOf(file)} onOpen={() => session.openFromLibrary(file.path)} />
      {/each}
    </div>
  {:else}
    <p class="note">{t("folders.empty")}</p>
  {/if}
{/if}

<style>
  .toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }
  .sort {
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--text-muted);
    flex-shrink: 0;
  }
  .sort .select {
    height: 28px;
    font-size: 12.5px;
  }
  .path {
    display: flex;
    align-items: center;
    gap: 2px;
    flex-wrap: wrap;
    color: var(--text-faint);
    min-height: 28px;
  }
  .crumb {
    height: 28px;
    padding: 0 8px;
    border: none;
    border-radius: 7px;
    background: none;
    color: var(--text-muted);
    font-size: 15px;
    font-weight: 600;
    max-width: 260px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .crumb:first-child {
    margin-left: -8px;
  }
  .crumb:hover {
    background: var(--hover);
    color: var(--text);
  }
  .crumb.current {
    color: var(--text);
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 22px 18px;
  }
  .folder {
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-width: 0;
    padding: 0;
    border: none;
    background: none;
    text-align: left;
  }
  .stack {
    position: relative;
    aspect-ratio: 3 / 4;
    border-radius: var(--radius-m);
    background: color-mix(in srgb, var(--accent) 7%, var(--thumb-bg));
    border: 1px solid var(--hairline);
    display: grid;
    place-items: center;
    overflow: hidden;
    transition: border-color var(--medium) var(--ease), transform var(--medium) var(--ease);
  }
  .folder:hover .stack {
    border-color: color-mix(in srgb, var(--accent) 35%, var(--hairline));
    transform: translateY(-1px);
  }
  .sheet {
    position: absolute;
    width: 56%;
    display: grid;
    place-items: center;
  }
  .sheet :global(.thumb),
  .sheet :global(img) {
    max-width: 100%;
  }
  .s0 {
    transform: translate(0, 4px);
    z-index: 3;
  }
  .s1 {
    transform: translate(-14%, -6px) rotate(-6deg);
    z-index: 2;
  }
  .s2 {
    transform: translate(14%, -8px) rotate(6deg);
    z-index: 1;
  }
  .empty-folder {
    color: var(--text-faint);
  }
  .label {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    color: var(--accent-text);
  }
  .name {
    color: var(--text);
    font-weight: 500;
    font-size: 12.5px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .count {
    margin-top: -6px;
    color: var(--text-muted);
    font-size: 11.5px;
  }
  .note {
    margin: 0;
    color: var(--text-muted);
    font-size: 12px;
  }
</style>
