<script lang="ts">
import "maplibre-gl/dist/maplibre-gl.css";
import { Popover, Portal } from "bits-ui";
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
/** Phones get the full-window map with the controls along the top and right edges. */
let phone = $state(false);
let sheetOpen = $state(false);
const SPAN = [
	["current", "Flying now"],
	["year", "Whole year"],
] as const;
const STYLE = [
	[false, "Glow"],
	[true, "Lines"],
] as const;
// full screen where the browser allows it on a page (not iPhone Safari, which keeps it for video)
const canFull = document.fullscreenEnabled;
let full = $state(!!document.fullscreenElement);
const toggleFull = () =>
	document.fullscreenElement
		? document.exitFullscreen()
		: document.documentElement.requestFullscreen().catch(() => {});

let tip = $state<Hover | null>(null);
// the tip card's size and the frame's, so the card can flip to whichever side of the pointer keeps it on screen
let tipW = $state(0);
let tipH = $state(0);
let frameW = $state(0);
let frameH = $state(0);
const GAP = 14;
const EDGE = 8;
const tipPos = $derived.by(() => {
	if (!tip) return { left: 0, top: 0 };
	let left = tip.x + GAP;
	if (left + tipW > frameW - EDGE) left = tip.x - GAP - tipW;
	let top = tip.y + GAP;
	// stay above the timeline card, and below the controls along the top on phones
	const floor = frameH - barH - EDGE;
	const ceiling = phone ? 160 : EDGE;
	if (top + tipH > floor) top = tip.y - GAP - tipH;
	return {
		left: Math.max(EDGE, Math.min(left, frameW - EDGE - tipW)),
		top: Math.max(ceiling, Math.min(top, floor - tipH)),
	};
});

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
	phone = box.width < 700;
	ctl.fit({
		top: phone ? 72 : 16,
		left: phone ? 16 : PANEL + 28 + (globe.card ? DETAIL + 12 : 0),
		right: phone ? 64 : 16,
		bottom: barH + 16,
	});
};

onMount(() => {
	const ro = new ResizeObserver(fit);
	ro.observe(frame);
	for (const e of frame.querySelectorAll(".bar")) ro.observe(e);
	persist();
	// phones open on the routes, drawn as lines: the clearest view on a small screen
	if (matchMedia("(max-width: 700px)").matches) {
		globe.show = "routes";
		globe.traceAll = true;
	}
	const onFull = () => (full = !!document.fullscreenElement);
	document.addEventListener("fullscreenchange", onFull);
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
		document.removeEventListener("fullscreenchange", onFull);
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
		<span class="sep desk" aria-hidden="true"></span>
		<!-- one switch for the view: a click anywhere flips it, the knob slides to the one showing -->
		<button type="button" class="view desk" class:flat={globe.view.current === "flat"} role="switch" aria-checked={globe.view.current === "globe"} aria-label="3D globe" title={globe.view.current === "globe" ? "Switch to the flat 2D map" : "Switch to the 3D globe"} onclick={() => (globe.view.current = globe.view.current === "globe" ? "flat" : "globe")}>
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

	<!-- phones: Species and Density / Routes in one pill inside the site header, centred beside the menu -->
	<Portal to="header">
		<div class="ptools" role="toolbar" aria-label="Map settings">
			<button type="button" class="phone-species" onclick={() => (sheetOpen = true)}>
				<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M16 7h.01M3.4 18H12a8 8 0 0 0 8-8V7a4 4 0 0 0-7.28-2.3L2 20" /><path d="m20 7 2 .5-2 .5M10 18v3M14 17.75V21M7 18a6 6 0 0 0 3.84-10.61" /></svg>
				<span class="label">Species</span>
				{#if globe.shown.length}<span class="count">{globe.shown.length}</span>{/if}
			</button>
			<span class="psep" aria-hidden="true"></span>
			<div class="seg" role="group" aria-label="What the map shows">
				{#each SHOW as [k, label]}
					<button type="button" class:on={globe.show === k} aria-pressed={globe.show === k} onclick={() => (globe.show = k)}>{label}</button>
				{/each}
			</div>
		</div>
	</Portal>

	{#if globe.show === "routes"}
		<!-- phones: the two route options as one tidy row under Density / Routes (wider screens have them in the map key) -->
		<div class="route-opts" role="group" aria-label="Route options">
			<div class="mini" role="group" aria-label="Which routes">
				{#each SPAN as [k, label]}
					<button type="button" class:on={globe.span === k} aria-pressed={globe.span === k} onclick={() => (globe.span = k)}>{label}</button>
				{/each}
			</div>
			<div class="mini" role="group" aria-label="How routes are drawn">
				{#each STYLE as [k, label]}
					<button type="button" class:on={globe.traceAll === k} aria-pressed={globe.traceAll === k} onclick={() => (globe.traceAll = k)}>{label}</button>
				{/each}
			</div>
		</div>
	{/if}

	<!-- phones: full screen, then the 3D / 2D switch standing upright, down the right edge -->
	<div class="side">
		{#if canFull}
			<button type="button" class="round" aria-label={full ? "Exit full screen" : "Full screen"} title={full ? "Exit full screen" : "Full screen"} onclick={toggleFull}>
				{#if full}
					<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3v3a2 2 0 0 1-2 2H3M21 8h-3a2 2 0 0 1-2-2V3M3 16h3a2 2 0 0 1 2 2v3M16 21v-3a2 2 0 0 1 2-2h3" /></svg>
				{:else}
					<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3" /></svg>
				{/if}
			</button>
		{/if}
		<button type="button" class="vview" class:flat={globe.view.current === "flat"} role="switch" aria-checked={globe.view.current === "globe"} aria-label="3D globe" title={globe.view.current === "globe" ? "Switch to the flat 2D map" : "Switch to the 3D globe"} onclick={() => (globe.view.current = globe.view.current === "globe" ? "flat" : "globe")}>
			<span class="knob" aria-hidden="true"></span>
			<span class="opt" class:on={globe.view.current === "globe"}>3D</span>
			<span class="opt" class:on={globe.view.current === "flat"}>2D</span>
		</button>
	</div>

	<MobileSheet {globe} bind:open={sheetOpen} />

	<div class="frame" bind:this={frame} bind:clientWidth={frameW} bind:clientHeight={frameH}>
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

		{#if globe.ready && globe.shown.length === 0}
			<!-- nothing to draw: say so, and on phones offer the way to add some -->
			<div class="empty" role="status">
				<svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16.5v.5" /></svg>
				<span>No species selected. Add some to see them on the map.</span>
				{#if phone}<button type="button" onclick={() => (sheetOpen = true)}>Add species</button>{/if}
			</div>
		{/if}
		{#if tip}
			<div class="tip" style:left="{tipPos.left}px" style:top="{tipPos.top}px" role="status" bind:clientWidth={tipW} bind:clientHeight={tipH}>
				<strong>{tip.title}</strong><br />{tip.sub}<br />
				{#if phone}
					<!-- phones have no room for the details panel: this opens the bird in the bottom sheet -->
					<button type="button" class="tip-more" onclick={() => { const id = tip?.id; if (id) globe.open(id, false); tip = null; sheetOpen = true; }}>See details →</button>
				{:else}
					<em>Click for details</em>
				{/if}
			</div>
		{/if}
		<div class="bar">
			<span class="mono" aria-live="polite">{#if globe.loading}Loading {globe.loading}…{/if}</span>
			<Timeline {globe} compact={phone} />
		</div>
	</div>
</div>

<style>
	/* the empty-map notice: a frosted pill just above the timeline */
	.empty { position: absolute; z-index: 6; left: 50%; bottom: calc(var(--bar-h) + 14px); transform: translateX(-50%); display: flex; align-items: center; gap: 8px; width: max-content; max-width: calc(100% - 24px); padding: 8px 8px 8px 12px; border: 1px solid var(--line); border-radius: 14px; background: color-mix(in srgb, var(--surface) 94%, transparent); backdrop-filter: blur(10px); box-shadow: var(--shadow); color: var(--text); font-size: 0.85rem; line-height: 1.3; animation: empty-in 0.25s ease-out; }
	.empty svg { flex: none; fill: none; stroke: var(--sun); stroke-width: 2; stroke-linecap: round; }
	.empty button { flex: none; padding: 7px 12px; border: 0; border-radius: 99px; background: var(--accent-strong); color: #fff; font: 600 0.8rem var(--font); cursor: pointer; }
	@keyframes empty-in { from { opacity: 0; transform: translate(-50%, 6px); } }
	.tip { position: absolute; z-index: 6; pointer-events: none; max-width: min(260px, calc(100% - 16px)); background: var(--surface); border: 1px solid var(--line); border-radius: 10px; padding: 8px 10px; font-size: 0.8rem; color: var(--muted); }
	.tip strong { color: var(--text); }
	.tip em { color: var(--link); font-style: normal; }
	.tip-more { margin-top: 6px; padding: 6px 0 2px; border: 0; background: none; color: var(--link); font: 600 0.8rem var(--font); cursor: pointer; pointer-events: auto; }
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
	.ptools, .route-opts, .side { display: none; }
	/* the legend gives way first on narrower screens; it is in the species panel's way */
	@media (max-width: 1100px) { .legend { display: none; } }
	/* phones: species, legend and sightings live in the bottom sheet; the two switches move down to the top of the map */
	@media (max-width: 700px) {
		/* the map takes the whole window; the header pill, Species and the switches float over it */
		.frame { inset: 0; border: 0; border-radius: 0; box-shadow: none; }
		/* the desktop toolbar gives way to the phone pill in the header: the menu stays at the left, the pill centred in the room beside it */
		.tools { display: none; }
		:global(body header.menu:has(.ptools)) { gap: 8px; padding-inline: 8px; }
		.ptools { display: flex; align-items: center; gap: 2px; height: 50px; margin-inline: auto; padding: 4px; border: 1px solid var(--line); border-radius: 999px; background: color-mix(in srgb, var(--surface) 85%, transparent); backdrop-filter: blur(10px); box-shadow: var(--shadow); white-space: nowrap; pointer-events: auto; }
		.ptools .seg button { min-width: 0; padding: 8px 10px; font-size: 0.85rem; }
		.psep { width: 1px; height: 22px; background: var(--line); }
		.species { display: none; }
		.frame :global(.maplibregl-ctrl-bottom-right) { bottom: calc(var(--bar-h) + 8px); }

		.phone-species { display: flex; align-items: center; gap: 4px; height: 40px; padding: 0 8px; border: 0; border-radius: 999px; background: none; color: var(--text); font: 600 0.85rem var(--font); cursor: pointer; }
		.phone-species:hover { background: var(--surface-2); }
		.phone-species svg { fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
		.phone-species .count { display: grid; place-items: center; min-width: 22px; height: 22px; padding: 0 6px; border-radius: 999px; background: var(--accent-strong); color: #fff; font-size: 0.75rem; }

		/* two small pill switches side by side, frosted like the toolbar above them */
		.route-opts { position: absolute; z-index: 21; top: 66px; left: 50%; transform: translateX(-50%); display: flex; gap: 6px; padding: 3px; border: 1px solid var(--line); border-radius: 999px; background: color-mix(in srgb, var(--surface) 85%, transparent); backdrop-filter: blur(10px); box-shadow: var(--shadow); white-space: nowrap; }
		.mini { display: flex; padding: 2px; border-radius: 999px; background: var(--surface-2); }
		.mini button { padding: 5px 10px; border: 0; border-radius: 999px; background: none; color: var(--muted); font: 600 0.78rem var(--font); cursor: pointer; transition: color 0.15s, background 0.15s; }
		.mini button.on { color: #fff; background: var(--accent-strong); }

		.side { position: absolute; z-index: 21; top: 114px; right: 10px; display: flex; flex-direction: column; align-items: center; gap: 10px; }
		.round { display: grid; place-items: center; width: 44px; height: 44px; border: 1px solid var(--line); border-radius: 50%; background: color-mix(in srgb, var(--surface) 88%, transparent); backdrop-filter: blur(10px); box-shadow: var(--shadow); color: var(--text); cursor: pointer; }
		.round svg { fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
		/* the 3D / 2D switch on its side: 3D on top, 2D below, the knob sliding down to the one showing */
		.vview { position: relative; display: grid; grid-template-rows: 1fr 1fr; width: 44px; height: 88px; padding: 3px; border: 1px solid var(--line); border-radius: 999px; background: color-mix(in srgb, var(--surface) 88%, transparent); backdrop-filter: blur(10px); box-shadow: var(--shadow); cursor: pointer; }
		.vview .knob { position: absolute; left: 3px; right: 3px; top: 3px; height: calc(50% - 3px); border-radius: 999px; background: var(--accent-strong); box-shadow: 0 1px 3px rgb(33 51 40 / 0.25); transition: transform 0.22s cubic-bezier(0.3, 0.7, 0.4, 1); }
		.vview.flat .knob { transform: translateY(100%); }
		.vview .opt { position: relative; display: grid; place-items: center; color: var(--muted); font: 600 0.8rem var(--font); transition: color 0.22s; }
		.vview .opt.on { color: #fff; }

		/* a slimmer timeline card; the loading note floats just above it instead of taking a row */
		.bar { left: 8px; right: 8px; bottom: calc(8px + env(safe-area-inset-bottom)); gap: 0; padding: 6px 12px 8px; }
		.bar > .mono { position: absolute; bottom: calc(100% + 6px); left: 4px; font-size: 0.7rem; }
	}
	@media (max-width: 340px) {
		.phone-species .label { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
	}
</style>
