<script lang="ts">
  import { studyTools } from "../../app/studyTools.svelte";
  /** A "Continue reading" card: page, title, where you are, progress. */
  import { formatDuration, t } from "../../i18n";
  import type { DocView } from "../../ipc/library";
  import { titleOf } from "../titles";
  import Thumb from "./Thumb.svelte";
  import Icon from "../../ui/Icon.svelte";

  interface Props {
    doc: DocView;
    onOpen: () => void;
    onForget: () => void;
  }
  let { doc, onOpen, onForget }: Props = $props();

  const progress = $derived(doc.pages > 0 ? Math.round((doc.page / doc.pages) * 100) : 0);
  const meta = $derived(
    [doc.pages > 0 ? t("library.pageOf", { page: doc.page, pages: doc.pages }) : t("library.notStarted"), doc.studySeconds >= 60 && studyTools.stats ? t("library.studied", { time: formatDuration(doc.studySeconds) }) : ""]
      .filter(Boolean)
      .join(" · "),
  );
</script>

<div class="card">
  <button class="open" onclick={onOpen} title={doc.path}>
    <span class="cover"><Thumb file={doc.file} height={132} /></span>
    <span class="text">
      <span class="title">{titleOf(doc.name)}</span>
      <span class="meta">{meta}</span>
    </span>
    <span class="track" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} aria-label={meta}>
      <span class="fill" style:width="{progress}%"></span>
    </span>
  </button>
  <button class="forget" aria-label={t("library.forget")} title={t("library.forget")} onclick={onForget}>
    <Icon name="close" size={13} stroke={2.2} />
  </button>
</div>

<style>
  .card {
    position: relative;
  }
  .open {
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 10px;
    border-radius: var(--radius-l);
    background: var(--surface);
    border: 1px solid var(--hairline);
    box-shadow: var(--card-shadow);
    text-align: left;
    transition: transform var(--medium) var(--ease), box-shadow var(--medium) var(--ease), border-color var(--medium) var(--ease);
  }
  .open:hover {
    border-color: color-mix(in srgb, var(--accent) 35%, var(--hairline));
    transform: translateY(-1px);
  }
  .cover {
    height: 150px;
    border-radius: 7px;
    background: var(--thumb-bg);
    display: grid;
    place-items: center;
    overflow: hidden;
  }
  .text {
    display: flex;
    flex-direction: column;
    gap: 3px;
    padding: 0 2px;
    min-width: 0;
  }
  .title {
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .meta {
    color: var(--text-muted);
    font-size: 12px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .track {
    height: 4px;
    border-radius: 2px;
    background: var(--track);
    margin: 0 2px 2px;
    overflow: hidden;
  }
  .fill {
    display: block;
    height: 100%;
    border-radius: 2px;
    background: var(--accent);
  }
  .forget {
    position: absolute;
    top: 16px;
    right: 16px;
    width: 24px;
    height: 24px;
    border-radius: 12px;
    border: none;
    background: rgba(28, 28, 30, 0.72);
    color: #fff;
    display: grid;
    place-items: center;
    opacity: 0;
    transition: opacity var(--fast) var(--ease);
  }
  .card:hover .forget,
  .forget:focus-visible {
    opacity: 1;
  }
</style>
