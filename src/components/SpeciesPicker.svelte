<script lang="ts">
import { presets } from "@/lib/globe/presets";
import type { GlobeState } from "@/lib/globe/state.svelte";
import { MAX_LIVE } from "@/lib/globe/state.svelte";
import { dayOfYear, PHASE_LABEL, PREPARED, speciesState } from "@/lib/model";
import SpeciesSearch from "./SpeciesSearch.svelte";

let { globe, onpick }: { globe: GlobeState; onpick?: () => void } = $props();

let showAll = $state(false);

const today = dayOfYear();
const groups = presets(PREPARED, today);
const byId = new Map(PREPARED.map((s) => [s.id, s]));
const status = (id: string) => {
	const s = byId.get(id);
	return s ? PHASE_LABEL[speciesState(s, globe.day).phase] : "";
};

const chips = $derived(PREPARED.filter((s) => globe.on.has(s.id)));
const visible = $derived(showAll ? chips : chips.slice(0, 12));

const browse = [
	["Hand-modelled", (s: (typeof PREPARED)[number]) => s.source !== "estimated"],
	[
		"Winter visitors to India",
		(s: (typeof PREPARED)[number]) => s.kind === "winter",
	],
	[
		"Summer visitors to India",
		(s: (typeof PREPARED)[number]) => s.kind === "summer",
	],
	["Passage migrants", (s: (typeof PREPARED)[number]) => s.kind === "passage"],
] as const;
let openGroup = $state<string | null>(null);
</script>

<SpeciesSearch {globe} {onpick} />

<section aria-label="Species on the globe">
	<h3>On the globe <span class="mono">{chips.length}</span>
		{#if chips.length}<button type="button" class="link" onclick={() => globe.setOn([])}>clear</button>{/if}
		{#if globe.canUndo}<button type="button" class="link" onclick={() => globe.undo()}>undo</button>{/if}
	</h3>
	{#if chips.length > MAX_LIVE}
		<p class="hint">Live sightings load for {MAX_LIVE} or fewer species. Pick one to see its sightings.</p>
	{/if}
	{#if chips.length}
		<ul class="chips">
			{#each visible as s (s.id)}
				<li class:focus={globe.focus === s.id}>
					<button type="button" class="c" onclick={() => { globe.open(s.id); onpick?.(); }} title="{s.sci} · {status(s.id)}">
						<span class="dot" style:background={s.color}></span>{s.name}
					</button>
					<button type="button" class="x" aria-label="Remove {s.name}" onclick={() => globe.remove(s.id)}>×</button>
				</li>
			{/each}
		</ul>
		{#if chips.length > 12}
			<button type="button" class="link" onclick={() => (showAll = !showAll)}>{showAll ? "Show fewer" : `Show all ${chips.length}`}</button>
		{/if}
	{:else}
		<p class="hint">Nothing is on. Search above, or start from a group below.</p>
	{/if}
</section>

<section aria-label="Groups">
	<h3>Quick groups</h3>
	<div class="presets">
		{#each groups as g (g.id)}
			<button type="button" onclick={() => globe.setOn(g.ids)}>{g.label} <span class="mono">{g.ids.length}</span></button>
		{/each}
	</div>
</section>

<section aria-label="Browse">
	<h3>Browse</h3>
	{#each browse as [label, f] (label)}
		<details ontoggle={(e) => { if ((e.currentTarget as HTMLDetailsElement).open) openGroup = label; else if (openGroup === label) openGroup = null; }}>
			<summary>{label}</summary>
			{#if openGroup === label}
				<ul class="rows">
					{#each PREPARED.filter(f).sort((a, b) => a.name.localeCompare(b.name)) as s (s.id)}
						<li>
							<input type="checkbox" aria-label="Show {s.name}" checked={globe.on.has(s.id)} onchange={() => globe.toggle(s.id)} />
							<button type="button" class="name" onclick={() => { globe.open(s.id); onpick?.(); }}>
								<span class="dot" style:background={s.color}></span>{s.name}
							</button>
							<span class="mono">{status(s.id)}</span>
						</li>
					{/each}
				</ul>
			{/if}
		</details>
	{/each}
</section>

<style>
	h3 { font-size: 0.7rem; margin: var(--s4) 0 var(--s2); color: var(--muted); text-transform: uppercase; letter-spacing: 0.08em; display: flex; gap: var(--s2); align-items: baseline; }
	h3 .link { margin-left: auto; }
	h3 .link + .link { margin-left: 0; }
	.link { background: none; border: 0; padding: 0; color: var(--link); font: 0.75rem var(--font); text-transform: none; letter-spacing: 0; cursor: pointer; text-decoration: underline; }
	.chips { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 6px; }
	.chips li { display: flex; align-items: center; background: var(--surface-2); border: 1px solid var(--line); border-radius: 99px; }
	.chips li.focus { border-color: var(--violet); }
	.c { background: none; border: 0; color: var(--text); font: 0.8rem var(--font); padding: 4px 4px 4px 10px; cursor: pointer; display: flex; align-items: center; }
	.x { background: none; border: 0; color: var(--muted); padding: 0 9px 0 4px; font-size: 1rem; cursor: pointer; }
	.x:hover { color: var(--rose); }
	.hint { color: var(--muted); font-size: 0.85rem; margin: 0; }
	.presets { display: flex; flex-wrap: wrap; gap: 6px; }
	.presets button { background: var(--surface-2); color: var(--text); border: 1px solid var(--line); border-radius: 99px; padding: 4px 10px; font: 0.78rem var(--font); cursor: pointer; }
	.presets button:hover { border-color: var(--violet); }
	details { border-top: 1px solid var(--line); }
	summary { padding: 8px 0; cursor: pointer; font-size: 0.85rem; }
	.rows { list-style: none; margin: 0 0 var(--s2); padding: 0; max-height: 260px; overflow: auto; }
	.rows li { display: flex; align-items: center; padding: 3px 0; font-size: 0.85rem; }
	.rows input { margin: 0 var(--s2) 0 0; width: 16px; height: 16px; accent-color: var(--violet); }
	.name { background: none; border: 0; color: var(--text); font: inherit; padding: 0; cursor: pointer; text-align: left; flex: 1; }
	.name:hover { text-decoration: underline; }
	.rows .mono { font-size: 0.65rem; }
</style>
