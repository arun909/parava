<script lang="ts">
import type { GlobeState } from "@/lib/globe/state.svelte";
import {
	dayOfYear,
	formatDay,
	nextEvent,
	PHASE_LABEL,
	PREPARED,
	popState,
} from "@/lib/model";

let { globe }: { globe: GlobeState } = $props();

const s = $derived(PREPARED.find((x) => x.id === globe.card));
const c = $derived(s ? globe.classified.get(s.id) : undefined);
const m = $derived(s ? globe.match(s.id) : undefined);
// recent reports with an open-licensed photo, newest first
const photos = $derived(
	(c?.items ?? [])
		.filter((r) => r.img)
		.sort((a, b) => b.t - a.t)
		.slice(0, 12),
);
const today = dayOfYear();
const ago = (t: number) => {
	const d = Math.max(0, Math.round((Date.now() - t) / 864e5));
	return d === 0 ? "today" : `${d}d ago`;
};
</script>

{#if s}
	<section class="card-panel" aria-label="{s.name} details">
		<button type="button" class="x" aria-label="Close" onclick={() => (globe.card = undefined)}>×</button>
		<p class="mono"><span class="dot" style:background={s.color}></span>{s.sci}</p>
		<h2>{s.name}</h2>
		<p class="fact">{s.fact}</p>

		{#if m}
			<p class="mono">
				{m.level} agreement · {m.n} reports on the flyway{m.dropped ? `, ${m.dropped} off it` : ""}
			</p>
		{:else}
			<p class="mono">Loading sightings…</p>
		{/if}

		{#if photos.length}
			<div class="photos">
				{#each photos as r}
					<a href={r.link} target="_blank" rel="noreferrer" title="{r.place} · {ago(r.t)} · {r.attr ?? r.src}">
						<img src={r.img} alt="{s.name}, {r.place}" loading="lazy" />
					</a>
				{/each}
			</div>
			<p class="mono small">Photos from iNaturalist observers, open licences. Tap for the original.</p>
		{/if}

		<h3>Populations</h3>
		<ul>
			{#each s.pops as p}
				{@const st = popState(p, globe.day)}
				{@const n = nextEvent(p, today)}
				<li>
					<strong>{p.name}</strong> · {PHASE_LABEL[st.phase]}
					<div class="mono small">Next: {n.what.toLowerCase()}, {formatDay(n.day)}</div>
				</li>
			{/each}
		</ul>

		<h3>Latest reports</h3>
		<ul>
			{#each (c?.items ?? []).slice().sort((a, b) => b.t - a.t).slice(0, 5) as r}
				<li>
					{#if r.link}<a href={r.link} target="_blank" rel="noreferrer">{r.place || "Unnamed place"}</a>{:else}{r.place || "Unnamed place"}{/if}
					<span class="mono small">{ago(r.t)} · {r.src}</span>
				</li>
			{:else}
				<li class="mono small">None on the flyway in the last 30 days.</li>
			{/each}
		</ul>
		<a class="btn" href="/species/{s.id}/">Full species page</a>
	</section>
{/if}

<style>
	.card-panel { position: relative; }
	h2 { font-size: 1.5rem; margin-bottom: var(--s2); }
	h3 { font-size: 0.8rem; margin: var(--s4) 0 var(--s2); color: var(--muted); text-transform: uppercase; letter-spacing: 0.08em; }
	.fact { color: var(--muted); font-size: 0.9rem; }
	.x { position: absolute; top: 8px; right: 10px; background: none; border: 0; color: var(--muted); font-size: 1.4rem; cursor: pointer; }
	.photos { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px; margin: var(--s3) 0 var(--s1); }
	.photos img { width: 100%; aspect-ratio: 1; object-fit: cover; border-radius: 8px; display: block; }
	ul { list-style: none; padding: 0; margin: 0; display: grid; gap: var(--s2); font-size: 0.9rem; }
	.small { font-size: 0.7rem; }
	.btn { margin-top: var(--s4); }
</style>
