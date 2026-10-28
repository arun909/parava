<script lang="ts">
import "maplibre-gl/dist/maplibre-gl.css";
import { onMount, tick, untrack } from "svelte";
import { persist } from "@/lib/data/client";
import { GlobeController, type Hover } from "@/lib/globe/GlobeController";
import { GlobeState } from "@/lib/globe/state.svelte";
import { PREPARED, speciesState } from "@/lib/model";
import MobileSheet from "./MobileSheet.svelte";
import PathsPanel from "./PathsPanel.svelte";
import SpeciesCard from "./SpeciesCard.svelte";
import SpeciesPicker from "./SpeciesPicker.svelte";
import SpeciesSearch from "./SpeciesSearch.svelte";
import Timeline from "./Timeline.svelte";

const globe = new GlobeState(); // queries must be created during component init
let el: HTMLDivElement;
let ctl: GlobeController | undefined;
let stage: HTMLDivElement;
let tip = $state<Hover | null>(null);

const rgb = (h: string) =>
	[1, 3, 5].map((i) => Number.parseInt(h.slice(i, i + 2), 16)) as [
		number,
		number,
		number,
	];

const fit = () => {
	if (!ctl) return;
	const box = stage.getBoundingClientRect();
	const rect = (sel: string) => {
		const e = stage.querySelector<HTMLElement>(sel);
		return e && e.offsetParent ? e.getBoundingClientRect() : null;
	};
	const left = rect(":scope > .left, :scope > .card");
	const right = rect(":scope > .paths");
	const bar = rect(":scope > .bar");
	ctl.fit({
		top: 12,
		left: left ? left.right - box.left + 16 : 12,
		right: right ? box.right - right.left + 16 : 12,
		bottom: bar ? box.bottom - bar.top + 8 : 8,
	});
};

onMount(() => {
	const ro = new ResizeObserver(fit);
	ro.observe(stage);
	for (const e of stage.querySelectorAll(".panel, .bar")) ro.observe(e);
	persist();
	ctl = new GlobeController(el, {
		onHover: (h) => (tip = h),
		onPick: (id) => {
			globe.open(id, false);
		},
	});
	ctl.whenPainted(() => (globe.ready = true));
	// arriving from a species page (?species=id): focus it and fly to where it is today
	const id = new URLSearchParams(location.search).get("species");
	const sp = PREPARED.find((x) => x.id === id);
	if (sp) {
		globe.open(sp.id);
		globe.pathMode = "focus";
		ctl.flyTo(speciesState(sp, globe.day).pos);
	}
	queueMicrotask(fit);
	return () => {
		ro.disconnect();
		ctl?.destroy();
	};
});
$effect(() => {
	const r = globe.flyRequest;
	const s = r && PREPARED.find((x) => x.id === r.id);
	if (s)
		ctl?.flyTo(
			speciesState(
				s,
				untrack(() => globe.day),
			).pos,
		);
});
// re-fit when a panel appears, disappears or changes size
$effect(() => {
	void globe.card;
	void globe.heat;
	void globe.pathMode;
	tick().then(fit);
});
$effect(() => ctl?.update(globe.shown, globe.day, globe.paths));
$effect(() => {
	const on = globe.shown.map((s) => ({
		s,
		c: globe.classified.get(s.id),
		col: rgb(s.color),
	}));
	ctl?.setReports(
		on.flatMap(({ c, col }) =>
			(c?.items ?? []).map((r) => ({
				pos: [r.lon, r.lat] as [number, number],
				c: col,
			})),
		),
		globe.showAway
			? on.flatMap(({ c, col }) =>
					(c?.away ?? []).map((r) => ({
						pos: [r.lon, r.lat] as [number, number],
						c: col,
					})),
				)
			: [],
	);
});
</script>

<h1 class="sr">Bird migration globe</h1>
<div class="stage" bind:this={stage}>
	<div bind:this={el} class="map" role="application" aria-label="Interactive globe. Arrow keys pan, plus and minus zoom."></div>
	{#if tip}
		<div class="tip" style:left="{tip.x + 14}px" style:top="{tip.y + 14}px" role="status">
			<strong>{tip.title}</strong><br />{tip.sub}<br /><em>Click for details</em>
		</div>
	{/if}
	{#if !globe.card}
	<aside class="panel left">
		<h2>Species</h2>
		<SpeciesPicker {globe} />
	</aside>
	{/if}
	{#if globe.card}
		<div class="panel topsearch"><SpeciesSearch {globe} /></div>
		<div class="panel card"><SpeciesCard {globe} /></div>
	{/if}
	<div class="panel paths"><PathsPanel {globe} compact={!!globe.card} /></div>
	<div class="bar">
		<span class="mono" aria-live="polite">{#if globe.loading}Loading {globe.loading}…{/if}</span>
		<Timeline {globe} />
		<div class="sheet-btn"><MobileSheet {globe} /></div>
	</div>
</div>

<style>
	.tip { position: absolute; z-index: 6; pointer-events: none; max-width: 260px; background: var(--surface); border: 1px solid var(--line); border-radius: 10px; padding: 8px 10px; font-size: 0.8rem; color: var(--muted); }
	.tip strong { color: var(--text); }
	.tip em { color: var(--link); font-style: normal; }
	.sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
	.stage { position: fixed; inset: 60px 0 0 0; }
	.map { position: absolute; inset: 0; }
	.panel { position: absolute; background: color-mix(in srgb, var(--surface) 92%, transparent); border: 1px solid var(--line); border-radius: var(--r); padding: var(--s3); overflow: auto; }
	.left { top: 12px; left: 12px; bottom: 150px; width: 260px; }
	.left h2 { font-size: 1rem; }
	.paths { top: 12px; right: 12px; width: 232px; overflow: visible; }
	.card { top: 12px; left: 12px; bottom: 150px; width: 300px; padding: var(--s4); z-index: 5; }
	.bar { position: absolute; left: 12px; right: 12px; bottom: 12px; display: flex; flex-direction: column; gap: var(--s2); background: color-mix(in srgb, var(--surface) 92%, transparent); border: 1px solid var(--line); border-radius: var(--r); padding: var(--s3) var(--s4); }
	.topsearch { top: 12px; left: 50%; transform: translateX(-50%); width: 280px; z-index: 6; overflow: visible; }
	.sheet-btn { display: none; }
	@media (max-width: 700px) {
		.stage :global(.maplibregl-ctrl-bottom-right) { bottom: 170px; }
		.left, .paths, .card, .topsearch { display: none; }
		.sheet-btn { display: block; align-self: center; }
		.bar { left: 8px; right: 8px; bottom: 8px; }
	}
</style>
