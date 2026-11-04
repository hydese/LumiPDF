<script lang="ts">
  /** A stored snip picture (loaded from LumiPDF's sheet folder). */
  import { sheetImageUrl } from "../../ipc/sheets";

  interface Props {
    name: string;
    alt?: string;
  }
  let { name, alt = "" }: Props = $props();
  let src = $state<string | null>(null);
  $effect(() => {
    const current = name;
    src = null;
    sheetImageUrl(current)
      .then((url) => {
        if (current === name) src = url;
      })
      .catch(() => {});
  });
</script>

{#if src}
  <img {src} {alt} draggable="false" />
{:else}
  <span class="loading"></span>
{/if}

<style>
  img,
  .loading {
    display: block;
    width: 100%;
    height: 100%;
  }
  img {
    object-fit: fill;
    user-select: none;
  }
  .loading {
    background: repeating-linear-gradient(135deg, transparent 0 6px, rgba(128, 128, 128, 0.08) 6px 12px);
  }
</style>
