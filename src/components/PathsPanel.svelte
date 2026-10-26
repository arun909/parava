<script lang="ts">
import type { GlobeState } from "@/lib/globe/state.svelte";
import EbirdDialog from "./EbirdDialog.svelte";

let { globe }: { globe: GlobeState } = $props();
</script>

<div class="paths" role="group" aria-label="Paths">
	<span class="mono">Paths</span>
	{#each ["active", "all", "focus"] as const as m}
		<button type="button" class:on={globe.pathMode === m} aria-pressed={globe.pathMode === m} onclick={() => (globe.pathMode = m)}>{m}</button>
	{/each}
	<EbirdDialog {globe} />
	<ul class="legend" aria-label="Legend">
		<li><i style="background:var(--violet)"></i>Spring</li>
		<li><i style="background:var(--rose)"></i>Autumn</li>
		<li><i class="thick"></i>Flown</li>
		<li><i class="thin"></i>Ahead</li>
	</ul>
</div>

<style>
	.paths { display: flex; flex-direction: column; gap: var(--s2); align-items: stretch; }
	button { background: var(--surface-2); color: var(--muted); border: 1px solid var(--line); border-radius: 99px; padding: 6px 12px; font: inherit; text-transform: capitalize; cursor: pointer; }
	button.on { color: #fff; background: var(--violet-strong); border-color: var(--violet-strong); }
	.legend { list-style: none; padding: 0; display: grid; grid-template-columns: 1fr 1fr; gap: 2px var(--s3); font-size: 0.75rem; color: var(--muted); margin: var(--s2) 0 0; }
	.legend i { display: inline-block; width: 16px; height: 3px; margin-right: 6px; vertical-align: middle; border-radius: 2px; }
	.legend i.thick { height: 5px; background: var(--text); }
	.legend i.thin { background: var(--muted); opacity: 0.5; }
</style>
