<!-- BETA BUILDS ONLY: the performance panel (see perf.svelte.ts). Numbers for testers, in English. -->
<script lang="ts">
  import { perf } from "./perf.svelte";
</script>

<aside class="perf" aria-label="Performance">
  <header>
    <strong>Performance</strong>
    <button onclick={() => perf.setOn(false)} aria-label="Close">×</button>
  </header>
  <dl>
    <dt>Frame rate</dt>
    <dd class:bad={perf.fps > 0 && perf.fps < 45}>{perf.fps} fps</dd>
    <dt>Slowest frame</dt>
    <dd class:bad={perf.worstFrame > 80}>{perf.worstFrame} ms</dd>
    <dt>Slow frames</dt>
    <dd>{perf.slowFrames}</dd>
    <dt>Pages drawn / drawing</dt>
    <dd>{perf.drawn} / {perf.drawing}</dd>
    <dt>Last page drawn in</dt>
    <dd class:bad={perf.lastPageMs > 400}>{perf.lastPageMs} ms</dd>
    <dt>Page memory</dt>
    <dd>{perf.canvasMegapixels} MP</dd>
    <dt>Zoom · pixel density</dt>
    <dd>{Math.round(perf.scale * 100)}% · {window.devicePixelRatio}x</dd>
  </dl>
  {#if perf.logPath}<p title={perf.logPath}>Log: {perf.logPath}</p>{/if}
</aside>

<style>
  .perf {
    position: fixed;
    left: 12px;
    bottom: 12px;
    z-index: 300;
    width: 250px;
    padding: 10px 12px;
    border-radius: 12px;
    background: rgba(18, 18, 22, 0.88);
    color: #e8e8ee;
    font: 11.5px/1.4 ui-monospace, "SF Mono", Menlo, Consolas, monospace;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35);
    backdrop-filter: none;
    pointer-events: auto;
  }
  header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 6px;
  }
  header button {
    border: 0;
    background: none;
    color: inherit;
    font-size: 16px;
    cursor: pointer;
  }
  dl {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 2px 10px;
    margin: 0;
  }
  dt {
    color: #9a9aa8;
  }
  dd {
    margin: 0;
    text-align: right;
  }
  .bad {
    color: #ff8a7a;
  }
  p {
    margin: 8px 0 0;
    color: #9a9aa8;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
