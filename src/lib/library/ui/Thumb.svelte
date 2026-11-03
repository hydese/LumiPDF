<script lang="ts">
  /** A document's first page, loaded when it scrolls into view. */
  import { onMount } from "svelte";
  import type { FileEntry } from "../../ipc/library";
  import { thumbnail } from "../thumbnails";
  import Icon from "../../ui/Icon.svelte";

  interface Props {
    file: FileEntry | null;
    /** Height of the page image in CSS pixels. */
    height: number;
  }
  let { file, height }: Props = $props();

  let el: HTMLDivElement;
  let url = $state<string | null>(null);
  let visible = $state(false);

  onMount(() => {
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        visible = true;
        io.disconnect();
      }
    }, { rootMargin: "300px" });
    io.observe(el);
    return () => io.disconnect();
  });

  $effect(() => {
    if (!visible || !file) return;
    let cancelled = false;
    void thumbnail(file).then((u) => {
      if (!cancelled) url = u;
    });
    return () => (cancelled = true);
  });
</script>

<div class="thumb" bind:this={el} style:height="{height}px">
  {#if url}
    <img src={url} alt="" draggable="false" style:max-height="{height}px" />
  {:else}
    <div class="placeholder" style:height="{height}px" style:width="{height * 0.77}px">
      {#if file?.cloudOnly}
        <Icon name="cloud" size={20} />
      {:else}
        <span></span><span></span><span class="short"></span><span></span>
      {/if}
    </div>
  {/if}
</div>

<style>
  .thumb {
    display: grid;
    place-items: center;
  }
  img {
    display: block;
    max-width: 100%;
    border-radius: 2px;
    box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.06), 0 1px 3px rgba(0, 0, 0, 0.18);
    background: #fff;
  }
  .placeholder {
    max-width: 100%;
    border-radius: 2px;
    background: #ffffff;
    box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.06), 0 1px 3px rgba(0, 0, 0, 0.18);
    padding: 14% 12%;
    display: flex;
    flex-direction: column;
    gap: 7%;
    color: #8e8e93;
  }
  .placeholder:has(:global(svg)) {
    align-items: center;
    justify-content: center;
  }
  .placeholder span {
    height: 3px;
    border-radius: 1px;
    background: #d8d8d6;
  }
  .placeholder span:first-child {
    width: 60%;
    height: 5px;
    background: #bdbdba;
  }
  .placeholder .short {
    width: 72%;
  }
</style>
