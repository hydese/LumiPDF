<script lang="ts">
  import { t } from "../i18n";
  import Dialog from "./Dialog.svelte";
  import Icon from "./Icon.svelte";

  interface Props {
    name: string;
    retry: boolean;
    onSubmit: (password: string | null, remember: boolean) => void;
  }
  let { name, retry, onSubmit }: Props = $props();
  let password = $state("");
  let remember = $state(true);

  function submit(event: SubmitEvent) {
    event.preventDefault();
    onSubmit(password, remember);
  }
</script>

<Dialog labelledBy="password-title" width={380} onClose={() => onSubmit(null, false)}>
  <form onsubmit={submit}>
    <span class="lock"><Icon name="file" size={22} stroke={1.7} /></span>
    <h2 id="password-title">{t("password.title")}</h2>
    <p class:error={retry}>{retry ? t("password.retry") : t("password.prompt", { name })}</p>
    <input type="password" bind:value={password} autocomplete="off" aria-label={t("password.title")} />
    <label class="remember" title={t("password.rememberHint")}>
      <input type="checkbox" bind:checked={remember} />
      {t("password.remember")}
    </label>
    <div class="actions">
      <button type="button" class="btn" onclick={() => onSubmit(null, false)}>{t("password.cancel")}</button>
      <button type="submit" class="btn primary">{t("password.open")}</button>
    </div>
  </form>
</Dialog>

<style>
  form {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .lock {
    width: 44px;
    height: 44px;
    border-radius: 11px;
    background: var(--accent-soft);
    color: var(--accent-text);
    display: grid;
    place-items: center;
  }
  h2 {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
  }
  p {
    margin: 0;
    color: var(--text-muted);
    overflow-wrap: anywhere;
  }
  p.error {
    color: var(--danger);
  }
  .remember {
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--text-soft);
    font-size: 13px;
  }
  .remember input {
    height: auto;
    width: 15px;
    height: 15px;
    margin: 0;
    accent-color: var(--accent);
  }
  input[type="password"] {
    height: 34px;
    padding: 0 10px;
    border-radius: var(--radius-m);
    border: 1px solid var(--hairline);
    background: var(--field);
    outline: none;
  }
  input:focus {
    border-color: var(--accent);
  }
  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 4px;
  }
</style>
