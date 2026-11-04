<script lang="ts">
  /**
   * A big number you can type, scroll, or change with the arrows above and below it.
   * Used for the timer length and the alarm hours/minutes.
   */
  import Icon from "../../ui/Icon.svelte";

  interface Props {
    value: number;
    min: number;
    max: number;
    step: number;
    /** Wrap around (minutes 55 → 00) instead of stopping at the ends. */
    wrap?: boolean;
    pad?: number;
    label: string;
    upLabel: string;
    downLabel: string;
    onChange: (value: number) => void;
  }
  let { value, min, max, step, wrap = false, pad = 0, label, upLabel, downLabel, onChange }: Props = $props();
  let draft = $state<string | null>(null);

  function clamp(n: number): number {
    if (wrap) {
      const span = max - min + 1;
      return ((((n - min) % span) + span) % span) + min;
    }
    return Math.min(max, Math.max(min, n));
  }
  function stepBy(dir: 1 | -1) {
    // Snap to the step grid: 37 → 40 → 45, 37 → 35 → 30.
    const next = dir > 0 ? Math.floor(value / step) * step + step : Math.ceil(value / step) * step - step;
    onChange(clamp(!wrap && next < min ? min : next));
  }
  function commit() {
    if (draft === null) return;
    const n = Number.parseInt(draft, 10);
    draft = null;
    if (Number.isFinite(n)) onChange(clamp(n));
  }
  const shown = $derived(draft ?? String(value).padStart(pad, "0"));
</script>

<div class="stepper">
  <button type="button" class="arrow" aria-label={upLabel} onclick={() => stepBy(1)} disabled={!wrap && value >= max}>
    <Icon name="up" size={16} stroke={2.4} />
  </button>
  <input
    class="big"
    value={shown}
    inputmode="numeric"
    maxlength="3"
    aria-label={label}
    style:width="{Math.max(2, shown.length) + 0.6}ch"
    onfocus={(e) => e.currentTarget.select()}
    oninput={(e) => (draft = e.currentTarget.value.replace(/\D/g, ""))}
    onblur={commit}
    onwheel={(e) => {
      e.preventDefault();
      commit();
      stepBy(e.deltaY < 0 ? 1 : -1);
    }}
    onkeydown={(e) => {
      if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        e.preventDefault();
        commit();
        stepBy(e.key === "ArrowUp" ? 1 : -1);
      } else if (e.key === "Enter") {
        commit();
        e.currentTarget.blur();
      }
    }}
  />
  <button type="button" class="arrow" aria-label={downLabel} onclick={() => stepBy(-1)} disabled={!wrap && value <= min}>
    <Icon name="down" size={16} stroke={2.4} />
  </button>
</div>

<style>
  .stepper {
    display: flex;
    flex-direction: column;
    align-items: center;
  }
  .arrow {
    width: 40px;
    height: 22px;
    border: none;
    border-radius: 7px;
    background: transparent;
    color: var(--text-muted);
    display: grid;
    place-items: center;
  }
  .arrow:hover:not(:disabled) {
    background: var(--hover);
    color: var(--text);
  }
  .arrow:disabled {
    opacity: 0.3;
  }
  input {
    padding: 0;
    border: none;
    border-radius: 8px;
    outline: none;
    background: transparent;
    text-align: center;
    color: var(--text);
  }
  input:hover {
    background: var(--hover);
  }
  input:focus {
    background: var(--field);
    box-shadow: 0 0 0 2px var(--accent);
  }
</style>
