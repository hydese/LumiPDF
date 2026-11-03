<script lang="ts">
  import { formatDate, t } from "../i18n";
  import { openExternal } from "../ipc/system";
  import { RELEASES_PAGE } from "../updates/updates.svelte";
  import AppMark from "../ui/AppMark.svelte";
  import Dialog from "../ui/Dialog.svelte";
  import type { ReleaseNotes } from "./whatsnew";

  interface Props {
    notes: ReleaseNotes;
    previousVersion: string;
    onClose: () => void;
  }
  let { notes, previousVersion, onClose }: Props = $props();

  const subtitle = $derived(
    [
      previousVersion ? t("whatsnew.updatedFrom", { version: previousVersion }) : "",
      notes.date ? formatDate(new Date(`${notes.date}T12:00:00`), { dateStyle: "long" }) : "",
    ]
      .filter(Boolean)
      .join(" · "),
  );
</script>

<Dialog labelledBy="whatsnew-title" width={460} {onClose}>
  <div class="head">
    <AppMark size={56} />
    <h2 id="whatsnew-title">{t("whatsnew.title", { version: notes.version })}</h2>
    {#if subtitle}<span>{subtitle}</span>{/if}
  </div>
  <ul>
    {#each notes.items as item, i (i)}
      <li>
        <span class="tag {item.tag}">{t(`whatsnew.tag.${item.tag}`)}</span>
        <span class="text">
          <span class="title">{item.title}</span>
          <span class="detail">{item.text}</span>
        </span>
      </li>
    {/each}
  </ul>
  <div class="foot">
    <button class="link-button" onclick={() => openExternal(`${RELEASES_PAGE}/tag/v${notes.version}`)}>{t("whatsnew.fullNotes")}</button>
    <button class="btn primary" onclick={onClose}>{t("whatsnew.continue")}</button>
  </div>
</Dialog>

<style>
  .head {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    text-align: center;
  }
  .head :global(.mark) {
    border-radius: 14px !important;
  }
  h2 {
    margin: 0;
    font-family: var(--font-display);
    font-size: 19px;
    font-weight: 600;
    letter-spacing: -0.015em;
  }
  .head span {
    color: var(--text-muted);
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 12px;
    max-height: 50vh;
    overflow-y: auto;
  }
  li {
    display: flex;
    gap: 12px;
    align-items: flex-start;
  }
  .tag {
    flex-shrink: 0;
    min-width: 46px;
    height: 20px;
    padding: 0 7px;
    border-radius: 6px;
    font-size: 11px;
    font-weight: 600;
    display: grid;
    place-items: center;
  }
  .tag.new {
    background: var(--accent-soft);
    color: var(--accent-text);
  }
  .tag.better {
    background: var(--green-soft);
    color: var(--green-text);
  }
  .tag.fixed {
    background: var(--orange-soft);
    color: var(--orange-text);
  }
  .text {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .title {
    font-weight: 500;
  }
  .detail {
    color: var(--text-muted);
    font-size: 12.5px;
    line-height: 1.45;
  }
  .foot {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-top: 14px;
    border-top: 1px solid var(--hairline);
  }
  .foot .link-button {
    font-size: 12.5px;
  }
</style>
