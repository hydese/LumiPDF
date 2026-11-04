<script lang="ts">
  /** GoodNotes notebooks (PDFs from GoodNotes Auto Backup), arranged the way the user chose. */
  import { t, tn } from "../../i18n";
  import type { FileEntry, FolderView } from "../../ipc/library";
  import { settings } from "../../settings/store.svelte";
  import { library } from "../library.svelte";
  import { session } from "../../reader/session.svelte";
  import { titleOf } from "../titles";
  import SourceCard from "./SourceCard.svelte";
  import MiniList from "./MiniList.svelte";
  import Thumb from "./Thumb.svelte";

  interface Props {
    folder: FolderView | null;
  }
  let { folder }: Props = $props();
  const opts = $derived(settings.value.library.notebooks);

  const notebooks = $derived.by((): FileEntry[] => {
    if (!folder) return [];
    const hidden = new Set(opts.hidden);
    const list = folder.files.filter((f) => !hidden.has(f.path));
    if (opts.sort === "name") list.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }));
    return list.slice(0, opts.count);
  });

  function hide(file: FileEntry) {
    settings.update((s) => s.library.notebooks.hidden.push(file.path));
  }
</script>

<SourceCard icon="notebook" tone="amber" title={opts.title || t("goodnotes.title")} subtitle={folder ? tn("goodnotes.count", folder.files.length) : t("goodnotes.readOnly")}>
  {#snippet action()}
    {#if !folder}
      <button class="btn small" onclick={() => library.addFolder("goodnotes")}>{t("goodnotes.choose")}</button>
    {:else if folder.files.length}
      <button class="btn small" onclick={() => library.browse(folder.path)}>{t("cloud.showAll")}</button>
    {/if}
  {/snippet}
  {#if !folder}
    <p class="card-note">{t("goodnotes.setup")}</p>
  {:else if !folder.available}
    <p class="card-note">{t("library.folderMissing")}</p>
  {:else if !notebooks.length}
    <p class="card-note">{t("cloud.empty")}</p>
  {:else if opts.view === "list"}
    <MiniList files={notebooks} onHide={hide} />
  {:else}
    <div class="grid">
      {#each notebooks as file (file.path)}
        <button class="nb" onclick={() => session.openFromLibrary(file.path)} title={file.path}>
          <span class="cover"><Thumb {file} height={96} /></span>
          <span class="name">{titleOf(file.name)}</span>
        </button>
      {/each}
    </div>
  {/if}
</SourceCard>

<style>
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(84px, 1fr));
    gap: 12px;
  }
  .nb {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 0;
    border: none;
    background: none;
    min-width: 0;
  }
  .cover {
    height: 112px;
    border-radius: 7px;
    background: var(--thumb-bg);
    display: grid;
    place-items: center;
  }
  .nb:hover .cover {
    outline: 1px solid color-mix(in srgb, var(--accent) 40%, transparent);
  }
  .name {
    font-size: 11.5px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
