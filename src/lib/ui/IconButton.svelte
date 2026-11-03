<script lang="ts">
  import type { Snippet } from "svelte";
  import Icon, { type IconName } from "./Icon.svelte";

  interface Props {
    icon: IconName;
    label: string;
    /** Shown on hover; defaults to the label. Include the shortcut here. */
    title?: string;
    pressed?: boolean;
    size?: "s" | "m";
    disabled?: boolean;
    onclick?: (event: MouseEvent) => void;
    children?: Snippet;
    el?: HTMLButtonElement | null;
  }
  let { icon, label, title, pressed, size = "m", disabled, onclick, children, el = $bindable(null) }: Props = $props();
</script>

<button
  bind:this={el}
  class="icon-button {size}"
  class:on={pressed}
  aria-label={label}
  aria-pressed={pressed}
  title={title ?? label}
  {disabled}
  {onclick}
>
  <Icon name={icon} size={size === "m" ? 17 : 15} />
  {@render children?.()}
</button>

<style>
  .icon-button {
    position: relative;
    border: none;
    border-radius: var(--radius-m);
    background: transparent;
    color: var(--text-soft);
    display: grid;
    place-items: center;
    flex-shrink: 0;
    transition: background var(--fast) var(--ease), color var(--fast) var(--ease);
  }
  .m {
    width: 34px;
    height: 34px;
  }
  .s {
    width: 30px;
    height: 30px;
  }
  .icon-button:hover:not(:disabled) {
    background: var(--hover);
    color: var(--text);
  }
  .icon-button:active:not(:disabled) {
    background: var(--pressed);
  }
  .on {
    background: var(--accent-soft);
    color: var(--accent-text);
  }
  .on:hover:not(:disabled) {
    background: var(--accent-soft);
    color: var(--accent-text);
  }
  .icon-button:disabled {
    opacity: 0.4;
  }
</style>
