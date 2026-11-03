<script lang="ts">
  /**
   * The LumiPDF logo as shown inside the app. This is the only place it is drawn, so a new
   * logo means replacing this component (and the files in src-tauri/icons for the app icon).
   */
  interface Props {
    size?: number;
  }
  let { size = 22 }: Props = $props();
</script>

<span class="mark" style:width="{size}px" style:height="{size}px" style:border-radius="{size * 0.27}px">
  <svg width={size * 0.55} height={size * 0.55} viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
  </svg>
</span>

<style>
  .mark {
    display: grid;
    place-items: center;
    flex-shrink: 0;
    background: var(--accent);
  }
</style>
