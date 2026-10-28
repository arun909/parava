<script lang="ts">
import { HEAT_RAMP } from "@/lib/globe/GlobeController";
import type { GlobeState } from "@/lib/globe/state.svelte";
import { PREPARED } from "@/lib/model";
import EbirdDialog from "./EbirdDialog.svelte";

let { globe, compact = false }: { globe: GlobeState; compact?: boolean } =
	$props();

const ramp = `linear-gradient(90deg, ${HEAT_RAMP.map(([r, g, b], i) => `rgb(${r} ${g} ${b}) ${Math.round((i / (HEAT_RAMP.length - 1)) * 100)}%`).join(", ")})`;
const HEAT = [
	["now", "Now"],
	["flyways", "Flyways"],
	["off", "Off"],
] as const;
const ROUTES = [
	["active", "Active"],
	["all", "All"],
	["focus", "Focus"],
] as const;
</script>

<div class="layers" class:compact role="group" aria-label="Map layers">
	<div class="seg" role="group" aria-label="Heat map">
		{#each HEAT as [k, label]}
			<button type="button" class:on={globe.heat === k} aria-pressed={globe.heat === k} onclick={() => (globe.heat = k)}>{label}</button>
		{/each}
	</div>

	{#if !compact}
		<div class="legend" aria-label="Legend">
			{#if globe.heat === "now"}
				<div class="bar" style:background={ramp}></div>
				<div class="ends"><span>fewer birds</span><span>more</span></div>
				<p>Where birds are on the date shown. Flocks in flight stream along their route.</p>
			{:else if globe.heat === "flyways"}
				<ul>
					<li><i style="background:var(--violet)"></i>Spring</li>
					<li><i style="background:var(--rose)"></i>Autumn</li>
					<li><i class="hot"></i>Brighter: already flown</li>
				</ul>
			{:else}
				<p>Heat is off. Hover a flock to trace its route.</p>
			{/if}
		</div>

		<span class="label">Routes</span>
		<div class="seg" role="group" aria-label="Routes">
			{#each ROUTES as [k, label]}
				<button type="button" class:on={globe.pathMode === k} aria-pressed={globe.pathMode === k} onclick={() => (globe.pathMode = k)}>{label}</button>
			{/each}
		</div>

		<label class="check"><input type="checkbox" bind:checked={globe.showAway} /> Off-path sightings <small>(zoom in)</small></label>

		{#if globe.focus}
			<button type="button" class="chip" onclick={() => { globe.focus = undefined; globe.card = undefined; }}>
				Focus: {PREPARED.find((x) => x.id === globe.focus)?.name} ×
			</button>
		{/if}
		<EbirdDialog {globe} />
	{/if}
</div>

<style>
	.layers { display: flex; flex-direction: column; gap: var(--s3); width: 100%; }
	.label { font: 0.65rem var(--mono); color: var(--muted); text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: calc(-1 * var(--s2)); }
	.seg { display: flex; background: var(--bg); border: 1px solid var(--line); border-radius: 99px; padding: 3px; }
	.seg button { flex: 1; background: none; border: 0; color: var(--muted); border-radius: 99px; padding: 5px 4px; font: 0.8rem var(--font); cursor: pointer; }
	.seg button.on { background: var(--violet-strong); color: #fff; }
	.legend { font-size: 0.75rem; color: var(--muted); }
	.legend p { margin: var(--s2) 0 0; line-height: 1.35; }
	.bar { height: 8px; border-radius: 99px; border: 1px solid var(--line); }
	.ends { display: flex; justify-content: space-between; font: 0.6rem var(--mono); text-transform: uppercase; margin-top: 3px; }
	.legend ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 3px; }
	.legend i { display: inline-block; width: 16px; height: 4px; margin-right: 6px; vertical-align: middle; border-radius: 2px; }
	.legend i.hot { height: 6px; background: var(--text); }
	.check { display: flex; gap: var(--s2); align-items: center; font-size: 0.8rem; color: var(--muted); cursor: pointer; }
	.check input { accent-color: var(--violet); }
	.check small { opacity: 0.7; }
	.chip { background: var(--surface-2); color: var(--text); border: 1px solid var(--line); border-radius: 99px; padding: 5px 10px; font: 0.8rem var(--font); cursor: pointer; }
</style>
