<script lang="ts">
  /**
   * A length in minutes: type any value, or use the arrows (and ↑/↓ keys) to change it by 5.
   * Arrow steps snap to multiples of 5, so 37 → 40 → 45.
   */
  import { t } from "../../i18n";
  import Icon from "../../ui/Icon.svelte";
  import { TIMER_LIMITS } from "../../settings/schema";

  interface Props {
    label: string;
    value: number;
    highlighted?: boolean;
    onChange: (minutes: number) => void;
  }
  let { label, value, highlighted = false, onChange }: Props = $props();
  const { minMinutes: MIN, maxMinutes: MAX, step: STEP } = TIMER_LIMITS;

  let draft = $state<string | null>(null);
  const shown = $derived(draft ?? String(value));

  const clamp = (n: number) => Math.min(MAX, Math.max(MIN, n));
  function stepBy(direction: 1 | -1) {
    const next = direction > 0 ? Math.floor(value / STEP) * STEP + STEP : Math.ceil(value / STEP) * STEP - STEP;
    onChange(clamp(next === 0 ? MIN : next));
  }
  function commit() {
    if (draft === null) return;
    const n = Number.parseInt(draft, 10);
    draft = null;
    if (Number.isFinite(n)) onChange(clamp(n));
  }
  function onKeydown(e: KeyboardEvent) {
    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      commit();
      stepBy(e.key === "ArrowUp" ? 1 : -1);
    } else if (e.key === "Enter") {
      commit();
      (e.currentTarget as HTMLInputElement).blur();
    } else if (e.key === "Escape" && draft !== null) {
      e.stopPropagation();
      draft = null;
    }
  }
</script>

<label class="field">
  <span class="label">{label}</span>
  <span class="box" class:highlighted>
    <span class="number">
      <input
        value={shown}
        inputmode="numeric"
        maxlength="3"
        aria-label={t("timer.minutesLabel", { label })}
        oninput={(e) => (draft = e.currentTarget.value.replace(/\D/g, ""))}
        onblur={commit}
        onkeydown={onKeydown}
        onfocus={(e) => e.currentTarget.select()}
      />
      <span class="unit">{t("timer.minutes")}</span>
    </span>
    <span class="arrows">
      <button type="button" tabindex="-1" aria-label={t("timer.more", { label })} disabled={value >= MAX} onclick={() => stepBy(1)}>
        <Icon name="up" size={9} stroke={2.4} />
      </button>
      <button type="button" tabindex="-1" aria-label={t("timer.less", { label })} disabled={value <= MIN} onclick={() => stepBy(-1)}>
        <Icon name="down" size={9} stroke={2.4} />
      </button>
    </span>
  </span>
</label>

<style>
  .field {
    display: flex;
    flex-direction: column;
    gap: 5px;
    min-width: 0;
  }
  .label {
    font-size: 11.5px;
    color: var(--text-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .box {
    display: flex;
    align-items: stretch;
    height: 40px;
    border-radius: 9px;
    background: var(--field);
    border: 1px solid var(--hairline);
    overflow: hidden;
    transition: border-color var(--fast) var(--ease);
  }
  .box.highlighted {
    background: color-mix(in srgb, var(--timer) 16%, transparent);
    border-color: color-mix(in srgb, var(--timer) 45%, transparent);
  }
  .box:focus-within {
    border-color: var(--accent);
  }
  .number {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: baseline;
    justify-content: center;
    gap: 3px;
    padding-left: 6px;
  }
  input {
    width: 32px;
    padding: 0;
    border: none;
    outline: none;
    background: transparent;
    text-align: right;
    font-size: 17px;
    font-weight: 600;
    line-height: 38px;
    font-variant-numeric: tabular-nums;
  }
  .unit {
    font-size: 11.5px;
    color: var(--text-muted);
  }
  .arrows {
    width: 18px;
    display: flex;
    flex-direction: column;
    border-left: 1px solid var(--hairline);
  }
  .arrows button {
    flex: 1;
    padding: 0;
    border: none;
    background: transparent;
    color: var(--text-faint);
    display: grid;
    place-items: center;
  }
  .arrows button + button {
    border-top: 1px solid var(--hairline);
  }
  .arrows button:hover:not(:disabled) {
    background: var(--hover);
    color: var(--text);
  }
  .arrows button:disabled {
    opacity: 0.35;
  }
</style>
