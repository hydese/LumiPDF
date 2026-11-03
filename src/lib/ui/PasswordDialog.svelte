<script lang="ts">
  import { t } from "../i18n";

  interface Props {
    name: string;
    retry: boolean;
    onSubmit: (password: string | null) => void;
  }

  let { name, retry, onSubmit }: Props = $props();
  let password = $state("");
  let input: HTMLInputElement;

  $effect(() => input.focus());

  function submit(event: SubmitEvent) {
    event.preventDefault();
    onSubmit(password);
  }
</script>

<div class="backdrop" role="presentation">
  <form class="dialog" onsubmit={submit} aria-labelledby="password-title">
    <h2 id="password-title">{t("password.title")}</h2>
    <p>{retry ? t("password.retry") : t("password.prompt", { name })}</p>
    <input type="password" bind:value={password} bind:this={input} autocomplete="off" />
    <div class="actions">
      <button type="button" onclick={() => onSubmit(null)}>{t("password.cancel")}</button>
      <button type="submit">{t("password.open")}</button>
    </div>
  </form>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    display: grid;
    place-items: center;
    background: rgb(0 0 0 / 0.35);
    z-index: 10;
  }
  .dialog {
    width: 340px;
    padding: var(--space-3);
    border-radius: 10px;
    background: var(--bg);
    box-shadow: 0 12px 40px rgb(0 0 0 / 0.25);
    display: grid;
    gap: var(--space-2);
  }
  h2 {
    margin: 0;
    font-size: 15px;
  }
  p {
    margin: 0;
    font-size: 13px;
    color: var(--text-muted);
  }
  .actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-2);
  }
</style>
