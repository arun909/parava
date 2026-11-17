<script lang="ts">
import type { GlobeState } from "@/lib/globe/state.svelte";
import {
	dayOfYear,
	formatDay,
	legStats,
	MONTHS,
	MSTART,
	nextEvent,
	PHASE_TEXT,
	PREPARED,
	popState,
	visitWindow,
} from "@/lib/model";
import PhotoViewer from "./PhotoViewer.svelte";

let { globe }: { globe: GlobeState } = $props();

const s = $derived(PREPARED.find((x) => x.id === globe.card));
const c = $derived(s ? globe.classified.get(s.id) : undefined);
const m = $derived(s ? globe.match(s.id) : undefined);
const code = $derived(s ? globe.codeOf(s.id) : undefined);
// open-licensed photos from the reports, newest first; the first leads the card
const photos = $derived(
	(c?.items ?? [])
		.filter((r) => r.img)
		.sort((a, b) => b.t - a.t)
		.slice(0, 12),
);
const photo = $derived(photos[0]);
let viewing = $state(false);
let shown = $state(0);
// the population shown, when a species has several; back to the first for each new species
let region = $state(0);
$effect(() => {
	void globe.card;
	region = 0;
	viewing = false;
});
const today = dayOfYear();
const monthNow = new Date().getMonth();
const away = $derived([...(c?.away ?? [])].sort((a, b) => b.t - a.t));
const ago = (t: number) => {
	const d = Math.max(0, Math.round((Date.now() - t) / 864e5));
	return d === 0 ? "today" : `${d}d ago`;
};
const km = (n: number) => `${Math.round(n).toLocaleString()} km`;
const range = (a: number, b: number) => `${formatDay(a)} – ${formatDay(b)}`;
const here = $derived(
	s && globe.home.current
		? visitWindow(s, globe.home.current.lon, globe.home.current.lat)
		: null,
);
// what the live sightings say about the modelled route, in words
const AGREE = {
	high: "Matches recent sightings",
	medium: "Partly matches sightings",
	low: "Doesn't match sightings",
	none: "Few sightings yet",
} as const;
const HERE_VERB = {
	wintering: "Winters near you",
	breeding: "Breeds near you",
	spring: "Passes near you",
	autumn: "Passes near you",
} as const;

/** For each month: is the population on its spring or autumn leg at some point in it? */
function strip(p: (typeof PREPARED)[number]["pops"][number]) {
	return MONTHS.map((_, i) => {
		const end = MSTART[i + 1] ?? 366;
		let leg: "spring" | "autumn" | null = null;
		for (let d = MSTART[i]!; d < end && !leg; d += 3) {
			const ph = popState(p, d).phase;
			if (ph === "spring" || ph === "autumn") leg = ph;
		}
		return leg;
	});
}
</script>

{#if s}
	<section class="card-panel" aria-label="{s.name} details">
		{#if photo}
			<button type="button" class="hero" aria-label="View {photos.length > 1 ? `all ${photos.length} photos` : 'the photo'} of {s.name}" onclick={() => { shown = 0; viewing = true; }}>
				<img src={photo.img} alt="{s.name}, {photo.place}" />
				<span class="badge">
					<svg width="13" height="13" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="9" cy="10" r="1.5" /><path d="m21 16-5-5-8 8" /></svg>
					{photos.length > 1 ? `${photos.length} photos` : "View photo"}
				</span>
			</button>
			<PhotoViewer {photos} name={s.name} bind:open={viewing} bind:index={shown} />
		{/if}

		<header>
			<h2><span class="dot" style:background={s.color}></span>{s.name}</h2>
			<p class="sci">{s.sci}</p>
			<ul class="chips">
				<li class="phase">{PHASE_TEXT[popState(s.pops[0]!, globe.day).phase]}</li>
				{#if s.source === "estimated"}
					<li class:warn={s.confidence === "low"} title={s.confidence === "low" ? (s.flags ?? []).join("; ") : "Route estimated from sightings: dates and path are approximate"}>
						{s.confidence === "low" ? "Low confidence" : "Estimated route"}
					</li>
				{/if}
				{#if m}<li class="lvl {m.level}" title="{m.n} reports on the flyway">{AGREE[m.level]}</li>{:else}<li>Checking sightings…</li>{/if}
			</ul>
		</header>

		<!-- one migration section; a species with several populations shows one at a time -->
		<div class="block">
			<h3><svg class="ico" width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><circle cx="6" cy="19" r="2" /><circle cx="18" cy="5" r="2" /><path d="M8 19h7.5a3.5 3.5 0 0 0 0-7h-7a3.5 3.5 0 0 1 0-7H16" /></svg>Migration{#if s.pops.length > 1}<span class="sub">{s.pops.length} regions</span>{/if}</h3>
			{#if s.pops.length > 1}
				<div class="regions" role="tablist" aria-label="Region">
					{#each s.pops as p, i (p.name)}
						<button type="button" role="tab" aria-selected={region === i} class:on={region === i} onclick={() => (region = i)}>{p.name}</button>
					{/each}
				</div>
			{/if}
			{#key region}
				{@const p = s.pops[Math.min(region, s.pops.length - 1)]!}
				{@const t = legStats(p)}
				{@const n = nextEvent(p, today)}
				{@const months = strip(p)}
				<div class="region" role={s.pops.length > 1 ? "tabpanel" : undefined}>
					<div class="months" role="img" aria-label="Months on the move: {months.map((l, i) => (l ? `${MONTHS[i]} ${l}` : '')).filter(Boolean).join(', ')}">
						{#each months as leg, i}
							<span class={leg ?? ""} class:now={i === monthNow} title={MONTHS[i]}></span>
						{/each}
					</div>
					<div class="axis" aria-hidden="true">
						{#each MONTHS as name, i}<span class:now={i === monthNow}>{name[0]}</span>{/each}
					</div>
					<dl class="legs">
						<dt><i class="spring"></i>Spring</dt>
						<dd>{range(t.spring.from, t.spring.to)}</dd>
						<dd class="km">{km(t.spring.km)}</dd>
						<dt><i class="autumn"></i>Autumn</dt>
						<dd>{range(t.autumn.from, t.autumn.to)}</dd>
						<dd class="km">{km(t.autumn.km)}</dd>
					</dl>
					<p class="next"><span>Next</span>{n.what} · {formatDay(n.day)}</p>
				</div>
			{/key}
		</div>

		<div class="block near">
			<h3><svg class="ico" width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z" /><circle cx="12" cy="10" r="2.5" /></svg>Near you</h3>
			{#if globe.home.current}
				<p>
					{#if here}
						<b>{HERE_VERB[here.phase]}</b> {here.ranges.map(([a, b]) => range(a, b)).join(", ")}
					{:else}
						<b>Not expected near you</b>
					{/if}
					<button type="button" class="link" onclick={() => (globe.home.current = null)}>Clear</button>
				</p>
			{:else}
				<p><button type="button" class="link" onclick={() => globe.locate()}>Use my location</button> to see when it passes near you.</p>
				{#if globe.homeError}<p class="err">{globe.homeError}</p>{/if}
			{/if}
		</div>

		{#if away.length}
			<div class="block">
				<h3><svg class="ico" width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></svg>Unusual sightings<span class="sub">{away.length}</span></h3>
				<p class="hint">Seen away from its usual range</p>
				<ul class="away">
					{#each away.slice(0, 4) as r}
						<li><span>{r.place || "Unnamed place"}</span><small>{ago(r.t)} · {r.src}</small></li>
					{/each}
				</ul>
			</div>
		{/if}

		<nav class="links" aria-label="More about {s.name}">
			<a class="primary" href="/species/{s.id}/">Full species page</a>
			{#if code}<a href="https://ebird.org/species/{code}" target="_blank" rel="noreferrer">eBird<svg class="out" width="11" height="11" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 17 17 7M8 7h9v9" /></svg></a>{/if}
			<a href="https://merlin.allaboutbirds.org/" target="_blank" rel="noreferrer">Merlin<svg class="out" width="11" height="11" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 17 17 7M8 7h9v9" /></svg></a>
		</nav>
	</section>
{/if}

<style>
	/* sits flat in its panel: the panel's own edges, sections split by hairlines */
	.card-panel { display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--s3); font-size: 0.85rem; line-height: 1.45; }
	.hero { position: relative; display: block; width: 100%; padding: 0; border: 0; border-radius: 10px; overflow: hidden; background: var(--surface-2); cursor: zoom-in; }
	.hero img { display: block; width: 100%; height: 150px; object-fit: cover; transition: transform 0.3s; }
	.hero:hover img { transform: scale(1.03); }
	.badge { position: absolute; right: 8px; bottom: 8px; display: inline-flex; align-items: center; gap: 5px; padding: 3px 9px; border-radius: 99px; background: rgb(0 0 0 / 0.6); color: #fff; font: 500 0.72rem var(--font); }
	.badge svg { fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
	h2 { display: flex; align-items: center; margin: 0; font-size: 1.25rem; line-height: 1.2; }
	h2 .dot { flex: none; width: 14px; height: 14px; }
	.sci { margin: 2px 0 var(--s3) 18px; color: var(--muted); font-style: italic; }
	.chips { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 6px; }
	.chips li { padding: 2px 10px; border-radius: 99px; background: var(--surface-2); color: var(--muted); font-size: 0.75rem; }
	.chips .phase { color: var(--text); font-weight: 500; }
	.chips .warn, .lvl.low { color: var(--danger); }
	.lvl.high { color: var(--ok); }
	.lvl.medium { color: var(--sun-deep); }

	/* each section its own soft tile, inside the panel's edges */
	.block { padding: 14px; border: 1px solid color-mix(in srgb, var(--line) 70%, transparent); border-radius: 12px; background: color-mix(in srgb, var(--surface-2) 55%, var(--surface)); }
	header { padding: 2px 2px var(--s1); }
	.ico { flex: none; align-self: center; fill: none; stroke: var(--accent); stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
	/* the same small label as "On the map" */
	h3 { display: flex; align-items: baseline; gap: 6px; margin: 0 0 var(--s3); color: var(--text); font-size: 0.7rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; line-height: 1.4; }
	.block p { margin: 0; }
	h3 .sub { color: var(--muted); font-weight: 400; letter-spacing: 0; text-transform: none; font-size: 0.75rem; }
	.regions { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: var(--s3); }
	.regions button { padding: 4px 10px; border: 1px solid var(--line); border-radius: 99px; background: var(--surface); color: var(--muted); font: 0.78rem var(--font); cursor: pointer; }
	.regions button:hover { color: var(--text); border-color: var(--accent); }
	.regions button.on { border-color: var(--accent-strong); background: var(--accent-strong); color: #fff; }
	.region { animation: fade 0.15s ease-out; }
	@keyframes fade { from { opacity: 0; } }
	.hint { color: var(--muted); font-size: 0.8rem; }
	.away { list-style: none; margin: var(--s2) 0 0; padding: 0; display: grid; grid-template-columns: minmax(0, 1fr); gap: 6px; }
	.away li { display: flex; justify-content: space-between; gap: var(--s3); }
	.away span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.away small { flex: none; color: var(--muted); font-size: 0.75rem; }

	.months, .axis { display: grid; grid-template-columns: repeat(12, 1fr); gap: 3px; }
	.months span { height: 10px; border-radius: 3px; background: var(--surface); box-shadow: inset 0 0 0 1px var(--line); }
	.months .spring { background: var(--spring); }
	.months .autumn { background: var(--autumn); }
	.months .now { box-shadow: 0 0 0 1.5px var(--surface), 0 0 0 3px var(--text); }
	.axis { margin-top: 4px; color: var(--muted); font-size: 0.65rem; text-align: center; }
	.axis .now { color: var(--text); font-weight: 600; }

	.legs { display: grid; grid-template-columns: auto 1fr auto; align-items: baseline; gap: 6px var(--s3); margin: var(--s3) 0 0; }
	.legs dt { display: flex; align-items: center; gap: 6px; color: var(--muted); }
	.legs dd { margin: 0; font-variant-numeric: tabular-nums; }
	.legs .km { color: var(--muted); font-size: 0.78rem; text-align: right; }
	dt i { width: 8px; height: 8px; border-radius: 2px; display: inline-block; }
	dt i.spring { background: var(--spring); }
	dt i.autumn { background: var(--autumn); }
	.block .next { display: flex; gap: var(--s3); margin-top: var(--s3); padding-top: var(--s2); border-top: 1px dashed var(--line); }
	.next span { color: var(--muted); }

	.near p { color: var(--muted); }
	.near b { color: var(--text); font-weight: 500; }
	.block .err { margin-top: var(--s1); color: var(--danger); }
	.link { background: none; border: 0; padding: 0; color: var(--link); font: inherit; cursor: pointer; text-decoration: underline; text-underline-offset: 3px; }
	.near b + .link { margin-left: 4px; }
	.links { display: flex; flex-wrap: wrap; gap: var(--s2); padding-top: var(--s1); }
	.links a { display: inline-flex; align-items: center; gap: 4px; padding: 6px 12px; border: 1px solid var(--line); border-radius: 8px; color: var(--text); font-size: 0.8rem; font-weight: 500; text-decoration: none; }
	.links a:hover { border-color: var(--accent); background: var(--surface-2); }
	.links a.primary { border-color: var(--accent-strong); background: var(--accent-strong); color: #fff; }
	.links a.primary:hover { filter: brightness(1.15); }
	.out { fill: none; stroke: currentColor; stroke-width: 2.2; stroke-linecap: round; stroke-linejoin: round; color: var(--muted); }
</style>
