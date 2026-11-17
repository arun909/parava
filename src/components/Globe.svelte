<script lang="ts">
import "maplibre-gl/dist/maplibre-gl.css";
import { Popover } from "bits-ui";
import { onMount, tick, untrack } from "svelte";
import { persist } from "@/lib/data/client";
import { GlobeController, type Hover } from "@/lib/globe/GlobeController";
import { GlobeState } from "@/lib/globe/state.svelte";
import { PREPARED, speciesState } from "@/lib/model";
import MapLegend from "./MapLegend.svelte";
import MobileSheet from "./MobileSheet.svelte";
import SightingsControls from "./SightingsControls.svelte";
import SpeciesCard from "./SpeciesCard.svelte";
import SpeciesMenu from "./SpeciesMenu.svelte";
import SpeciesPicker from "./SpeciesPicker.svelte";
import Timeline from "./Timeline.svelte";

const globe = new GlobeState(); // queries must be created during component init
let el: HTMLDivElement;
let ctl: GlobeController | undefined;
let frame: HTMLDivElement;
/** Under the floating header: the map's frame starts here. */
const TOP = 72;
/** The species panel floating over the map's left edge. */
const PANEL = 300;
/** The selected bird's details, in their own panel right of the species panel. */
const DETAIL = 320;
const SHOW = [
	["density", "Density"],
	["routes", "Routes"],
] as const;

let barH = $state(0);

let tip = $state<Hover | null>(null);

const rgb = (h: string) =>
	[1, 3, 5].map((i) => Number.parseInt(h.slice(i, i + 2), 16)) as [
		number,
		number,
		number,
	];

const fit = () => {
	if (!ctl) return;
	const box = frame.getBoundingClientRect();
	const bar = frame.querySelector<HTMLElement>(":scope > .bar");
	barH = bar ? box.bottom - bar.getBoundingClientRect().top : 0;
	// the floating panels and switches are hidden on phones, where the controls sit in the bottom sheet and along the top
	const phone = box.width < 700;
	ctl.fit({
		top: phone ? 64 : 16,
		left: phone ? 16 : PANEL + 28 + (globe.card ? DETAIL + 12 : 0),
		right: 16,
		bottom: barH + 16,
	});
};

onMount(() => {
	const ro = new ResizeObserver(fit);
	ro.observe(frame);
	for (const e of frame.querySelectorAll(".bar")) ro.observe(e);
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
	tick().then(fit);
});
$effect(() => ctl?.update(globe.shown, globe.day, globe.paths));
$effect(() => ctl?.setView(globe.view.current));
$effect(() => {
	// looking at one species: only its sightings, so they are not lost among the rest
	const on = globe.shown
		.filter((s) => !globe.focus || s.id === globe.focus)
		.map((s) => ({
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

<h1 class="sr">Bird migration map</h1>
<div class="stage" style:--top="{TOP}px" style:--panel="{PANEL}px" style:--detail="{DETAIL}px" style:--bar-h="{barH}px">
	<!-- the map's settings, in the header's free middle: which species, what is drawn, 3D or 2D, and which sightings -->
	<div class="tools" role="toolbar" aria-label="Map settings">
		<SpeciesMenu {globe} clear={16 + 12 + PANEL + 12} />
		<span class="sep wide" aria-hidden="true"></span>
		<div class="seg" role="group" aria-label="What the map shows">
			{#each SHOW as [k, label]}
				<button type="button" class:on={globe.show === k} aria-pressed={globe.show === k} onclick={() => (globe.show = k)}>{label}</button>
			{/each}
		</div>
		<span class="sep" aria-hidden="true"></span>
		<!-- one switch for the view: a click anywhere flips it, the knob slides to the one showing -->
		<button type="button" class="view" class:flat={globe.view.current === "flat"} role="switch" aria-checked={globe.view.current === "globe"} aria-label="3D globe" title={globe.view.current === "globe" ? "Switch to the flat 2D map" : "Switch to the 3D globe"} onclick={() => (globe.view.current = globe.view.current === "globe" ? "flat" : "globe")}>
			<span class="knob" aria-hidden="true"></span>
			<span class="opt" class:on={globe.view.current === "globe"}>3D</span>
			<span class="opt" class:on={globe.view.current === "flat"}>2D</span>
		</button>
		<span class="sep wide" aria-hidden="true"></span>
		<Popover.Root>
			<Popover.Trigger class="sightings-trigger">Sightings <span aria-hidden="true">▾</span></Popover.Trigger>
			<Popover.Portal>
				<Popover.Content class="sightings-pop" align="end" sideOffset={10}>
					<SightingsControls {globe} />
				</Popover.Content>
			</Popover.Portal>
		</Popover.Root>
	</div>

	<div class="frame" bind:this={frame}>
		<div bind:this={el} class="map" role="application" aria-label="Interactive map. Arrow keys pan, plus and minus zoom."></div>

		<!-- always in view: what is on the map, beside the Species menu that adds to it -->
		<section class="float species" aria-label="Species on the map">
				<header>
					<h2>Your species</h2>
				</header>
				<div class="scroll">
					<SpeciesPicker {globe} />
				</div>
			</section>

		{#if globe.card}
			<!-- the bird picked in the list, beside it rather than in its place -->
			<section class="float species detail" aria-label="Bird details">
				<header>
					<h2>Bird details</h2>
					<button type="button" class="close" aria-label="Close bird details" title="Close" onclick={() => globe.close()}>
						<svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
					</button>
				</header>
				<div class="scroll">
					<SpeciesCard {globe} />
				</div>
			</section>
		{/if}

		<div class="float legend">
			<h2 class="legend-head">Map key</h2>
			<MapLegend {globe} />
		</div>

		{#if tip}
			<div class="tip" style:left="{tip.x + 14}px" style:top="{tip.y + 14}px" role="status">
				<strong>{tip.title}</strong><br />{tip.sub}<br /><em>Click for details</em>
			</div>
		{/if}
		<div class="bar">
			<span class="mono" aria-live="polite">{#if globe.loading}Loading {globe.loading}…{/if}</span>
			<Timeline {globe} />
			<div class="sheet-btn"><MobileSheet {globe} /></div>
		</div>
	</div>
</div>

<style>
	.tip { position: absolute; z-index: 6; pointer-events: none; max-width: 260px; background: var(--surface); border: 1px solid var(--line); border-radius: 10px; padding: 8px 10px; font-size: 0.8rem; color: var(--muted); }
	.tip strong { color: var(--text); }
	.tip em { color: var(--link); font-style: normal; }
	.sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
	/* the brand's cream with a soft leaf wash, and a hint of its sun low on the right */
	.stage { position: fixed; inset: 0; background: radial-gradient(ellipse 45% 40% at 88% 92%, color-mix(in srgb, var(--sun) 16%, transparent), transparent), radial-gradient(ellipse 75% 65% at 50% 45%, color-mix(in srgb, var(--accent) 28%, var(--bg)) 0%, color-mix(in srgb, var(--accent) 12%, var(--bg)) 55%, var(--bg) 100%); }

	/* a pill like the header's, centred in the header row: the header sits above the stage, so this rides over it */
	.tools { position: fixed; z-index: 21; top: 5px; left: 50%; transform: translateX(-50%); display: flex; align-items: center; gap: 4px; padding: 4px; border: 1px solid var(--line); border-radius: 999px; background: color-mix(in srgb, var(--surface) 85%, transparent); backdrop-filter: blur(10px); box-shadow: var(--shadow); white-space: nowrap; }
	.seg { display: flex; gap: 2px; }
	.seg button, .tools :global(.sightings-trigger), .tools :global(.species-trigger) { min-width: 52px; padding: 8px var(--s3); border: 0; border-radius: 999px; background: none; color: var(--muted); font: 600 0.9rem var(--font); cursor: pointer; transition: color 0.15s, background 0.15s; }
	.seg button:hover, .tools :global(.sightings-trigger:hover), .tools :global(.sightings-trigger[data-state="open"]), .tools :global(.species-trigger:hover), .tools :global(.species-trigger[data-state="open"]) { color: var(--text); background: var(--surface-2); }
	.seg button.on { color: #fff; background: var(--accent-strong); }
	.view { position: relative; display: grid; grid-template-columns: 1fr 1fr; width: 92px; height: 34px; padding: 3px; border: 0; border-radius: 999px; background: var(--surface-2); cursor: pointer; }
	.view .knob { position: absolute; top: 3px; bottom: 3px; left: 3px; width: calc(50% - 3px); border-radius: 999px; background: var(--accent-strong); box-shadow: 0 1px 3px rgb(33 51 40 / 0.25); transition: transform 0.22s cubic-bezier(0.3, 0.7, 0.4, 1); }
	.view.flat .knob { transform: translateX(100%); }
	.view .opt { position: relative; display: grid; place-items: center; color: var(--muted); font: 600 0.85rem var(--font); transition: color 0.22s; }
	.view .opt.on { color: #fff; }
	.view:hover .opt:not(.on) { color: var(--text); }
	.sep { width: 1px; height: 22px; background: var(--line); }
	:global(.sightings-pop) { z-index: 30; width: 240px; padding: var(--s3) var(--s4); background: var(--surface); border: 1px solid var(--line); border-radius: 14px; box-shadow: var(--shadow); }

	/* the map's own rounded card, from under the header to the foot of the page, a gap all round: the globe floats on the gradient inside it */
	.frame { position: absolute; top: var(--top); left: 16px; right: 16px; bottom: 16px; border-radius: 18px; overflow: hidden; border: 1px solid var(--line); box-shadow: var(--shadow); }
	.map { position: absolute; inset: 0; }

	/* panels floating on the map, frosted like the timeline */
	.float { position: absolute; z-index: 5; background: color-mix(in srgb, var(--surface) 92%, transparent); backdrop-filter: blur(12px); border: 1px solid color-mix(in srgb, var(--line) 70%, transparent); border-radius: 14px; box-shadow: var(--shadow); }
	.species { top: 12px; left: 12px; width: var(--panel); bottom: calc(var(--bar-h) + 12px); display: flex; flex-direction: column; padding: var(--s3) var(--s4) 0; }
	.species header { display: flex; align-items: center; gap: var(--s2); padding-bottom: var(--s2); border-bottom: 1px solid var(--line); }
	.species h2 { font-size: 1rem; margin: 0 auto 0 0; line-height: 28px; }
	.detail { left: calc(24px + var(--panel)); width: var(--detail); animation: slide 0.18s ease-out; }
	.close { display: grid; place-items: center; width: 28px; height: 28px; margin-right: -6px; border: 0; border-radius: 7px; background: none; color: var(--muted); cursor: pointer; }
	.close svg { fill: none; stroke: currentColor; stroke-width: 1.75; stroke-linecap: round; }
	.close:hover { color: var(--text); background: var(--surface-2); }
	@keyframes slide { from { opacity: 0; transform: translateX(-8px); } }
	.scroll { flex: 1; min-height: 0; overflow: auto; margin: 0 calc(-1 * var(--s4)); padding: var(--s3) var(--s4) var(--s4); overscroll-behavior: contain; }
	.legend { top: 12px; right: 12px; width: 230px; padding: var(--s2) var(--s3) var(--s3); }
	.legend-head { margin: 0 0 var(--s2); padding: 2px 0; color: var(--text); font: 600 0.85rem system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }

	.bar { position: absolute; left: 12px; right: 12px; bottom: 12px; display: flex; flex-direction: column; gap: var(--s1); background: color-mix(in srgb, var(--surface) 88%, transparent); backdrop-filter: blur(12px); border: 1px solid color-mix(in srgb, var(--line) 55%, transparent); border-radius: 14px; padding: var(--s2) var(--s4) var(--s3); }
	.frame :global(.maplibregl-ctrl-bottom-right) { bottom: 130px; }
	.sheet-btn { display: none; }
	/* the legend gives way first on narrower screens; it is in the species panel's way */
	@media (max-width: 1100px) { .legend { display: none; } }
	/* phones: species, legend and sightings live in the bottom sheet; the two switches move down to the top of the map */
	@media (max-width: 700px) {
		.tools { position: absolute; top: calc(var(--top) + 10px); }
		.sep.wide, .tools :global(.sightings-trigger), .tools :global(.species-trigger) { display: none; }
		.species { display: none; }
		.frame :global(.maplibregl-ctrl-bottom-right) { bottom: 170px; }
		.frame { left: 8px; right: 8px; bottom: 8px; }
		.sheet-btn { display: block; align-self: center; }
		.bar { left: 8px; right: 8px; bottom: 8px; }
	}
</style>
