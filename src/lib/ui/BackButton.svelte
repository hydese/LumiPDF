<script lang="ts">
  /** The "‹ Library" / "‹ Back" pill at the left of the top bar. */
  import Icon from "./Icon.svelte";

  interface Props {
    label: string;
    title?: string;
    onclick: () => void;
  }
  let { label, title, onclick }: Props = $props();
</script>

<button class="back" {onclick} title={title ?? label}>
  <Icon name="back" size={15} stroke={2.2} />
  <span>{label}</span>
</button>

<style>
  .back {
    display: flex;
    align-items: center;
    gap: 3px;
    height: 28px;
    padding: 0 12px 0 8px;
    border: none;
    border-radius: 14px;
    background: var(--field);
    color: var(--text);
    font-weight: 500;
    white-space: nowrap;
    transition: background var(--fast) var(--ease);
  }
  .back:hover {
    background: var(--pressed);
  }
</style>
