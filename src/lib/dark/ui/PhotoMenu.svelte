<script lang="ts">
  /**
   * BETA BUILDS ONLY — right-click on an image in dark mode: "It's a photo" / "Not a photo"
   * (photoTraining.svelte.ts). Remove before a stable release.
   */
  import { t } from "../../i18n";
  import { teach, type PhotoTarget } from "../photoTraining.svelte";

  interface Props {
    target: PhotoTarget;
    document: string;
    onClose: () => void;
  }
  let { target, document: docName, onClose }: Props = $props();

  let status = $state<"ask" | "saving" | "saved" | "failed">("ask");
  let el = $state<HTMLElement | null>(null);

  async function answer(photo: boolean) {
    status = "saving";
    try {
      await teach(target, photo, { document: docName, version: __APP_VERSION__ });
      status = "saved";
    } catch (err) {
      console.warn("LumiPDF: photo example not saved", err);
      status = "failed";
    }
    setTimeout(onClose, 1600);
  }

  $effect(() => {
    const away = (e: PointerEvent) => {
      if (el && !el.contains(e.target as Node)) onClose();
    };
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("pointerdown", away, true);
    window.addEventListener("keydown", key);
    window.addEventListener("blur", onClose);
    return () => {
      window.removeEventListener("pointerdown", away, true);
      window.removeEventListener("keydown", key);
      window.removeEventListener("blur", onClose);
    };
  });
</script>

<div
  class="photo-menu"
  role="menu"
  bind:this={el}
  style:left="{Math.min(target.at.x, window.innerWidth - 240)}px"
  style:top="{Math.min(target.at.y, window.innerHeight - 130)}px"
>
  <span class="title">{t("photoTrain.title")}</span>
  {#if status === "ask"}
    <button role="menuitemradio" aria-checked={target.photo} onclick={() => void answer(true)}>
      <span class="dot" class:on={target.photo}></span>{t("photoTrain.photo")}
    </button>
    <button role="menuitemradio" aria-checked={!target.photo} onclick={() => void answer(false)}>
      <span class="dot" class:on={!target.photo}></span>{t("photoTrain.notPhoto")}
    </button>
  {:else}
    <span class="status" role="status">{t(status === "failed" ? "photoTrain.failed" : status === "saved" ? "photoTrain.saved" : "photoTrain.saving")}</span>
  {/if}
</div>

<style>
  .photo-menu {
    position: fixed;
    z-index: 50;
    min-width: 220px;
    padding: 4px;
    border-radius: 10px;
    background: var(--surface-raised);
    box-shadow: var(--pop-shadow);
    display: flex;
    flex-direction: column;
    color: var(--text);
  }
  .title {
    padding: 6px 10px 4px;
    font-size: 11px;
    color: var(--text-muted);
  }
  button {
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
  }
  button:hover {
    background: var(--hover);
  }
  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    border: 1.5px solid var(--text-soft);
  }
  .dot.on {
    background: var(--accent);
    border-color: var(--accent);
  }
  .status {
    padding: 6px 10px 8px;
    font-size: 13px;
  }
</style>
