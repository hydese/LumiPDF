<script lang="ts">
  /** "Time's up" while a Timer or Alarm rings. */
  import { t } from "../../i18n";
  import { settings } from "../../settings/store.svelte";
  import { ringer } from "../ringer.svelte";
  import { formatAlarm } from "../format";
  import Dialog from "../../ui/Dialog.svelte";
  import Icon from "../../ui/Icon.svelte";

  const isAlarm = $derived(ringer.ringing === "alarm");
</script>

<Dialog labelledBy="ring-title" width={360} onClose={() => ringer.stop()}>
  <div class="ring">
    <span class="icon"><Icon name={isAlarm ? "bell" : "timer"} size={26} stroke={1.8} /></span>
    <h2 id="ring-title">{isAlarm ? t("timer.alarmUp") : t("timer.timeUp")}</h2>
    <p>
      {isAlarm ? t("timer.alarmUpText", { time: formatAlarm(settings.value.timer.alarm, settings.value.timer.clock24, t("timer.am"), t("timer.pm")) }) : t("timer.timeUpText", { minutes: settings.value.timer.countdown })}
    </p>
    <div class="actions">
      <button class="btn" onclick={() => ringer.snooze()}>{t("timer.snooze")}</button>
      <button class="btn primary" onclick={() => ringer.stop()}>{t("timer.stop")}</button>
    </div>
  </div>
</Dialog>

<style>
  .ring {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    text-align: center;
  }
  .icon {
    width: 56px;
    height: 56px;
    border-radius: 28px;
    display: grid;
    place-items: center;
    background: var(--orange-soft);
    color: var(--orange-text);
    animation: shake 1.2s var(--ease) infinite;
  }
  h2 {
    margin: 4px 0 0;
    font-size: 18px;
    font-weight: 600;
  }
  p {
    margin: 0;
    color: var(--text-muted);
  }
  .actions {
    display: flex;
    gap: 8px;
    margin-top: 8px;
  }
  @keyframes shake {
    0%,
    60%,
    100% {
      transform: rotate(0);
    }
    10%,
    30%,
    50% {
      transform: rotate(-10deg);
    }
    20%,
    40% {
      transform: rotate(10deg);
    }
  }
</style>
