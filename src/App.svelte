<script lang="ts">
  import { onMount } from "svelte";
  import { getAppInfo, type AppInfo } from "./lib/ipc/commands";
  import { t } from "./lib/i18n";

  let info = $state<AppInfo | null>(null);

  onMount(async () => {
    info = await getAppInfo();
  });
</script>

<main class="placeholder">
  <h1>{t("app.name")}</h1>
  <p>{t("app.tagline")}</p>
  <p class="muted">
    {info ? t("app.devBuild", { version: info.version }) : t("app.loading")}
  </p>
</main>

<style>
  .placeholder {
    height: 100vh;
    display: grid;
    place-content: center;
    text-align: center;
    gap: var(--space-2);
  }
  h1 {
    margin: 0;
    font-size: 28px;
    font-weight: 600;
  }
  p {
    margin: 0;
  }
  .muted {
    color: var(--text-muted);
    font-size: 13px;
  }
</style>
