<script lang="ts">
import type { GlobeState } from "@/lib/globe/state.svelte";
import MapLegend from "./MapLegend.svelte";
import SightingsControls from "./SightingsControls.svelte";

let { globe }: { globe: GlobeState } = $props();

const SHOW = [
	["density", "Density"],
	["routes", "Routes"],
] as const;
</script>

<!-- every map setting in one column, for the phone's bottom sheet; wider screens spread them over the map -->
<div class="layers" role="group" aria-label="Map layers">
	<div class="seg" role="group" aria-label="What the map shows">
		{#each SHOW as [k, label]}
			<button type="button" class:on={globe.show === k} aria-pressed={globe.show === k} onclick={() => (globe.show = k)}>{label}</button>
		{/each}
	</div>
	<MapLegend {globe} />
	<section class="sightings" aria-label="Sightings">
		<h3>Sightings</h3>
		<SightingsControls {globe} />
	</section>
</div>

<style>
	.layers { display: flex; flex-direction: column; gap: var(--s3); width: 100%; }
	h3 { font-size: 0.7rem; margin: 0 0 var(--s2); color: var(--muted); text-transform: uppercase; letter-spacing: 0.08em; }
	.sightings { padding-top: var(--s3); border-top: 1px solid var(--line); }
	.seg { display: flex; background: var(--bg); border: 1px solid var(--line); border-radius: 99px; padding: 3px; }
	.seg button { flex: 1; background: none; border: 0; color: var(--muted); border-radius: 99px; padding: 5px 4px; font: 0.8rem var(--font); cursor: pointer; }
	.seg button.on { background: var(--accent-strong); color: #fff; }
</style>
