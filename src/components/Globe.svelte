<script lang="ts">
import "maplibre-gl/dist/maplibre-gl.css";
import { onMount } from "svelte";
import { persist } from "@/lib/data/client";
import { GlobeController } from "@/lib/globe/GlobeController";
import { GlobeState } from "@/lib/globe/state.svelte";
import MobileSheet from "./MobileSheet.svelte";
import PathsPanel from "./PathsPanel.svelte";
import SpeciesCard from "./SpeciesCard.svelte";
import SpeciesList from "./SpeciesList.svelte";
import Timeline from "./Timeline.svelte";

const globe = new GlobeState(); // queries must be created during component init
let el: HTMLDivElement;
let ctl: GlobeController | undefined;

const rgb = (h: string) =>
	[1, 3, 5].map((i) => Number.parseInt(h.slice(i, i + 2), 16)) as [
		number,
		number,
		number,
	];

onMount(() => {
	persist();
	ctl = new GlobeController(el);
	return () => ctl?.destroy();
});
$effect(() => ctl?.update(globe.shown, globe.day, globe.paths));
$effect(() => {
	ctl?.setReports(
		globe.shown.flatMap((s) =>
			(globe.classified.get(s.id)?.items ?? []).map((r) => ({
				pos: [r.lon, r.lat] as [number, number],
				c: rgb(s.color),
			})),
		),
	);
});
</script>

<h1 class="sr">Bird migration globe</h1>
<div class="stage">
	<div bind:this={el} class="map" role="application" aria-label="Interactive globe. Arrow keys pan, plus and minus zoom."></div>
	<aside class="panel left">
		<h2>Species</h2>
		<SpeciesList {globe} />
	</aside>
	{#if globe.card}
		<div class="panel card"><SpeciesCard {globe} /></div>
	{/if}
	<div class="panel paths"><PathsPanel {globe} /></div>
	<div class="bar">
		<span class="mono" aria-live="polite">{#if globe.loading}Loading {globe.loading}…{/if}</span>
		<Timeline {globe} />
		<div class="sheet-btn"><MobileSheet {globe} /></div>
	</div>
</div>

<style>
	.sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
	.stage { position: fixed; inset: 60px 0 0 0; }
	.map { position: absolute; inset: 0; }
	.panel { position: absolute; background: color-mix(in srgb, var(--surface) 92%, transparent); border: 1px solid var(--line); border-radius: var(--r); padding: var(--s3); overflow: auto; }
	.left { top: 12px; left: 12px; bottom: 150px; width: 260px; }
	.left h2 { font-size: 1rem; }
	.paths { top: 12px; right: 12px; overflow: visible; }
	.card { top: 250px; right: 12px; bottom: 12px; width: 320px; padding: var(--s4); z-index: 5; }
	.bar { position: absolute; left: 12px; right: 12px; bottom: 12px; display: flex; flex-direction: column; gap: var(--s2); background: color-mix(in srgb, var(--surface) 92%, transparent); border: 1px solid var(--line); border-radius: var(--r); padding: var(--s3) var(--s4); }
	.sheet-btn { display: none; }
	@media (max-width: 700px) {
		.stage :global(.maplibregl-ctrl-bottom-right) { bottom: 170px; }
		.left, .paths, .card { display: none; }
		.sheet-btn { display: block; align-self: center; }
		.bar { left: 8px; right: 8px; bottom: 8px; }
	}
</style>
