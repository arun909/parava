<script lang="ts">
import type { GlobeState } from "@/lib/globe/state.svelte";
import {
	dayOfYear,
	formatDay,
	legStats,
	nextEvent,
	PHASE_LABEL,
	PREPARED,
	popState,
	visitWindow,
} from "@/lib/model";

let { globe }: { globe: GlobeState } = $props();

const s = $derived(PREPARED.find((x) => x.id === globe.card));
const c = $derived(s ? globe.classified.get(s.id) : undefined);
const m = $derived(s ? globe.match(s.id) : undefined);
const code = $derived(s ? globe.codeOf(s.id) : undefined);
// one photo: the newest open-licensed report that has one
const photo = $derived(
	(c?.items ?? []).filter((r) => r.img).sort((a, b) => b.t - a.t)[0],
);
const today = dayOfYear();
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
const HERE_VERB = {
	wintering: "Winters near you",
	breeding: "Breeds near you",
	spring: "Passes near you",
	autumn: "Passes near you",
} as const;
</script>

{#if s}
	<section class="card-panel" aria-label="{s.name} details">
		<button type="button" class="x" aria-label="Close" onclick={() => { globe.card = undefined; globe.focus = undefined; }}>×</button>

		{#if photo}
			<a class="hero" href={photo.link} target="_blank" rel="noreferrer" title="{photo.place} · {photo.attr ?? photo.src}">
				<img src={photo.img} alt="{s.name}, {photo.place}" />
				<span>{photo.attr ?? photo.src}</span>
			</a>
		{/if}

		<h2><span class="dot" style:background={s.color}></span>{s.name}</h2>
		<p class="mono sci">{s.sci}
			{#if m}· <span class="lvl {m.level}">{m.level} agreement</span> · {m.n} reports{:else}· loading sightings…{/if}
		</p>

		{#if s.source === "estimated"}<p class="est">{s.confidence === "low" ? `Low-confidence estimate: ${s.flags?.join("; ")}.` : "Estimated from sightings, so dates and path are approximate."}</p>{/if}
		<dl>
			{#each s.pops as p (p.name)}
				{@const st = popState(p, globe.day)}
				{@const t = legStats(p)}
				{@const n = nextEvent(p, today)}
				<dt>{p.name}<small>{PHASE_LABEL[st.phase]}</small></dt>
				<dd>
					<span><b>Spring</b> {range(t.spring.from, t.spring.to)} · {t.spring.days} d · {km(t.spring.km)} · {Math.round(t.spring.kmPerDay)} km/d</span>
					<span><b>Autumn</b> {range(t.autumn.from, t.autumn.to)} · {t.autumn.days} d · {km(t.autumn.km)} · {Math.round(t.autumn.kmPerDay)} km/d</span>
					<span><b>Round trip</b> {km(t.roundTripKm)} · <b>Next</b> {n.what.toLowerCase()}, {formatDay(n.day)}</span>
				</dd>
			{/each}
		</dl>

		{#if away.length}
			<div class="near">
				<b>{away.length} seen away from its usual range</b>
				{#each away.slice(0, 3) as r}
					<div class="mono">{r.place || "Unnamed place"} · {ago(r.t)} · {r.src}</div>
				{/each}
			</div>
		{/if}

		<div class="near">
			{#if globe.home.current}
				{#if here}
					<b>{HERE_VERB[here.phase]}</b>
					{here.ranges.map(([a, b]) => range(a, b)).join(", ")}
					<span class="mono">· closest {km(here.closestKm)}, {formatDay(here.closestDay)}</span>
				{:else}
					<b>Not expected near you</b> <span class="mono">(none within 700 km)</span>
				{/if}
				<button type="button" class="link" onclick={() => (globe.home.current = null)}>clear</button>
			{:else}
				<button type="button" class="link" onclick={() => globe.locate()}>Use my location</button> to see when it is near you.
				{#if globe.homeError}<span class="err">{globe.homeError}</span>{/if}
			{/if}
		</div>

		<p class="links">
			{#if code}<a href="https://ebird.org/species/{code}" target="_blank" rel="noreferrer">eBird</a> ·
				<a href="https://media.ebird.org/catalog?taxonCode={code}" target="_blank" rel="noreferrer">Photos &amp; sounds</a> · {/if}
			<a href="https://merlin.allaboutbirds.org/" target="_blank" rel="noreferrer">Merlin</a> ·
			<a href="/species/{s.id}/">Full page</a>
		</p>
	</section>
{/if}

<style>
	.card-panel { position: relative; font-size: 0.8rem; line-height: 1.4; }
	.x { position: absolute; top: 6px; right: 6px; z-index: 1; width: 26px; height: 26px; border-radius: 50%; border: 0; background: #000a; color: #fff; font-size: 1.1rem; cursor: pointer; }
	.hero { position: relative; display: block; margin: calc(-1 * var(--s4)) calc(-1 * var(--s4)) var(--s3); }
	.hero img { display: block; width: 100%; aspect-ratio: 16 / 9; object-fit: cover; border-radius: var(--r) var(--r) 0 0; }
	.hero span { position: absolute; left: 8px; bottom: 6px; font: 0.65rem var(--mono); color: #fff; text-shadow: 0 1px 3px #000; max-width: 80%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	h2 { font-size: 1.25rem; margin: 0; display: flex; align-items: center; }
	.sci { margin: 2px 0 var(--s3); text-transform: none; font-size: 0.7rem; }
	.lvl.high { color: var(--ok); }
	.lvl.medium { color: #eab308; }
	.lvl.low { color: var(--rose); }
	.est { margin: 0 0 var(--s2); color: var(--muted); font-style: italic; }
	dl { margin: 0; display: grid; gap: var(--s2); }
	dt { font-weight: 600; display: flex; gap: var(--s2); align-items: baseline; }
	dt small { font: 0.65rem var(--mono); color: var(--muted); text-transform: uppercase; }
	dd { margin: 0 0 var(--s2); display: grid; gap: 1px; color: var(--muted); padding-left: var(--s2); border-left: 2px solid var(--line); }
	dd b { color: var(--text); font-weight: 500; }
	.near + .near { margin-top: var(--s2); }
	.near { background: var(--surface-2); border-radius: 10px; padding: var(--s2) var(--s3); margin-top: var(--s2); }
	.near b { color: var(--text); }
	.err { color: var(--rose); }
	.link { background: none; border: 0; padding: 0; color: var(--link); font: inherit; cursor: pointer; text-decoration: underline; }
	.links { margin: var(--s3) 0 0; color: var(--muted); }
</style>
