<script lang="ts">
  /** The annotation tools in the reader's top bar. */
  import { t, type MessageKey } from "../../i18n";
  import Icon, { type IconName } from "../../ui/Icon.svelte";
  import { annotations, DEFAULT_TOOL, type Tool } from "../store.svelte";

  const TOOLS: Array<{ id: Tool; icon: IconName; key: string }> = [
    { id: "hand", icon: "hand", key: "G" },
    { id: "select", icon: "textmark", key: "V" },
    { id: "pen", icon: "pen", key: "P" },
    { id: "marker", icon: "highlighter", key: "M" },
    { id: "eraser", icon: "eraser", key: "E" },
    { id: "note", icon: "sticky", key: "N" },
    { id: "snip", icon: "snip", key: "S" },
  ];
</script>

<div class="tools" role="toolbar" aria-label={t("tools.label")}>
  {#each TOOLS as tool (tool.id)}
    {@const name = t(`tools.${tool.id}` as MessageKey)}
    <button
      aria-label={name}
      title={t("tools.withKey", { name, key: tool.key })}
      aria-pressed={annotations.tool === tool.id}
      onclick={() => (annotations.tool = annotations.tool === tool.id ? DEFAULT_TOOL : tool.id)}
      oncontextmenu={(e) => {
        // Right-click on the snip tool: a screenshot of the whole page at once.
        if (tool.id !== "snip") return;
        e.preventDefault();
        annotations.tool = "snip";
        annotations.wholePageSnip++;
      }}
    >
      <Icon name={tool.icon} size={15} />
    </button>
  {/each}
</div>

<style>
  .tools {
    display: flex;
    gap: 2px;
    padding: 3px;
    margin-right: 6px;
    border-radius: 9px;
    background: var(--segment);
  }
  button {
    width: 30px;
    height: 28px;
    border: none;
    border-radius: 7px;
    background: transparent;
    color: var(--text-soft);
    display: grid;
    place-items: center;
  }
  button:hover {
    color: var(--text);
  }
  button[aria-pressed="true"] {
    background: var(--segment-on);
    color: var(--text);
    box-shadow: var(--segment-shadow);
  }
</style>
