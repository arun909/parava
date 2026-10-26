<script lang="ts">
import type { GlobeState } from "@/lib/globe/state.svelte";
import { PREPARED } from "@/lib/model";
import EbirdDialog from "./EbirdDialog.svelte";

let { globe, compact = false }: { globe: GlobeState; compact?: boolean } =
	$props();
</script>

<div class="paths" class:compact role="group" aria-label="Paths">
	{#if !compact}<span class="mono">Paths</span>{/if}
	{#each ["active", "all", "focus"] as const as m}
		<button type="button" class:on={globe.pathMode === m} aria-pressed={globe.pathMode === m} onclick={() => (globe.pathMode = m)}>{m}</button>
	{/each}
	{#if !compact}
		<label class="away"><input type="checkbox" bind:checked={globe.showAway} /> Off-path sightings</label>
	{/if}
	{#if globe.focus && !compact}
		<button type="button" class="chip" onclick={() => { globe.focus = undefined; globe.card = undefined; }}>
			Focus: {PREPARED.find((x) => x.id === globe.focus)?.name} ×
		</button>
	{/if}
	{#if !compact}<EbirdDialog {globe} />{/if}
	<ul class="legend" aria-label="Legend">
		<li><i style="background:var(--violet)"></i>Spring</li>
		<li><i style="background:var(--rose)"></i>Autumn</li>
		<li><i class="thick"></i>Flown</li>
		<li><i class="thin"></i>Ahead</li>
		<li><i class="ring"></i>Off path</li>
	</ul>
</div>

<style>
	.away { display: flex; gap: var(--s2); align-items: center; font-size: 0.8rem; color: var(--muted); cursor: pointer; }
	.away input { accent-color: var(--violet); }
	.compact { flex-direction: row; }
	.compact button { padding: 4px 12px; }
	.compact .legend { display: none; }
	.paths { display: flex; flex-direction: column; gap: var(--s2); align-items: stretch; }
	button { background: var(--surface-2); color: var(--muted); border: 1px solid var(--line); border-radius: 99px; padding: 6px 12px; font: inherit; text-transform: capitalize; cursor: pointer; }
	button.on { color: #fff; background: var(--violet-strong); border-color: var(--violet-strong); }
	.chip { text-transform: none; color: var(--text); }
	.legend { list-style: none; padding: 0; display: grid; grid-template-columns: 1fr 1fr; gap: 2px var(--s3); font-size: 0.75rem; color: var(--muted); margin: var(--s2) 0 0; }
	.legend i { display: inline-block; width: 16px; height: 3px; margin-right: 6px; vertical-align: middle; border-radius: 2px; }
	.legend i.thick { height: 5px; background: var(--text); }
	.legend i.ring { width: 10px; height: 10px; border: 1.6px solid var(--text); background: none; border-radius: 50%; }
	.legend i.thin { background: var(--muted); opacity: 0.5; }
</style>
