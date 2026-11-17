<script lang="ts">
import type { GlobeState } from "@/lib/globe/state.svelte";
import { MAX_LIVE } from "@/lib/globe/state.svelte";
import { PHASE_TEXT, PREPARED, speciesState } from "@/lib/model";
import SpeciesSearch from "./SpeciesSearch.svelte";

let {
	globe,
	onpick,
	hint = "No species yet. Add some from the Species menu or search.",
	inline = false,
}: {
	globe: GlobeState;
	onpick?: () => void;
	hint?: string;
	/** Search lists its matches here, not in the Species menu (the phone's sheet). */
	inline?: boolean;
} = $props();

const added = $derived(PREPARED.filter((s) => globe.on.has(s.id)));
</script>

<SpeciesSearch {globe} {inline} />

<!-- only what is on the map; browsing for more lives in the header's Species menu -->
<section aria-label="Species on the map">
	<h3>On the map <span class="mono">{added.length}</span>
		<span class="tools">
			{#if globe.canUndo}
				<button type="button" class="icon" aria-label="Undo" data-tip="Undo" onclick={() => globe.undo()}>
					<svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 14 4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" /></svg>
				</button>
			{/if}
			{#if added.length}
				<button type="button" class="icon del" aria-label="Clear all" data-tip="Clear all" onclick={() => globe.setOn([])}>
					<svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M5.5 6 6.5 20h11l1-14" /><path d="M10 10.5v6M14 10.5v6" /></svg>
				</button>
			{/if}
		</span>
	</h3>
	{#if added.length > MAX_LIVE}
		<p class="hint">Live sightings load for {MAX_LIVE} or fewer species. Pick one to see its sightings.</p>
	{/if}
	{#if added.length}
		<ul class="rows">
			{#each added as s (s.id)}
				<li class:focus={globe.focus === s.id}>
					<button type="button" class="name" onclick={() => { globe.open(s.id); onpick?.(); }} title={s.sci}>
						<span class="dot" style:background={s.color}></span>
						<span class="nm">{s.name}</span>
						<span class="st">{PHASE_TEXT[speciesState(s, globe.day).phase]}</span>
					</button>
					<button type="button" class="x" aria-label="Remove {s.name}" onclick={() => globe.remove(s.id)}>×</button>
				</li>
			{/each}
		</ul>
	{:else}
		<p class="hint">{hint}</p>
	{/if}
</section>

<style>
	h3 { font-size: 0.7rem; margin: var(--s2) 0 var(--s2); color: var(--muted); text-transform: uppercase; letter-spacing: 0.08em; display: flex; gap: var(--s2); align-items: center; min-height: 26px; }
	.tools { display: flex; gap: 2px; margin-left: auto; }
	.icon { position: relative; display: grid; place-items: center; width: 28px; height: 28px; border: 0; border-radius: 7px; background: none; color: var(--muted); cursor: pointer; }
	.icon svg { fill: none; stroke: currentColor; stroke-width: 1.75; stroke-linecap: round; stroke-linejoin: round; }
	.icon:hover, .icon:focus-visible { color: var(--text); background: var(--surface-2); }
	.icon.del:hover, .icon.del:focus-visible { color: var(--danger); background: color-mix(in srgb, var(--danger) 8%, transparent); }
	/* the button's name, shown on hover and keyboard focus */
	.icon::after { content: attr(data-tip); position: absolute; top: 50%; right: calc(100% + 6px); z-index: 2; padding: 4px 8px; border-radius: 6px; background: var(--text); color: var(--surface); font: 500 0.72rem var(--font); letter-spacing: 0; text-transform: none; white-space: nowrap; pointer-events: none; opacity: 0; transform: translate(2px, -50%); transition: opacity 0.12s, transform 0.12s; }
	.icon:hover::after, .icon:focus-visible::after { opacity: 1; transform: translate(0, -50%); }
	.hint { color: var(--muted); font-size: 0.85rem; margin: 0; }
	.rows { list-style: none; margin: 0 calc(-1 * var(--s2)); padding: 0; }
	.rows li { display: flex; align-items: center; border-radius: 8px; }
	.rows li:hover, .rows li.focus { background: var(--surface-2); }
	.rows li.focus { box-shadow: inset 2px 0 0 var(--accent); }
	.name { flex: 1; min-width: 0; display: flex; align-items: center; gap: var(--s1); background: none; border: 0; color: var(--text); font: 0.85rem var(--font); padding: 6px 4px 6px var(--s2); cursor: pointer; text-align: left; }
	.nm { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.name .st { flex: none; color: var(--muted); font-size: 0.75rem; white-space: nowrap; }
	.x { background: none; border: 0; color: var(--muted); padding: 0 var(--s2); font-size: 1rem; cursor: pointer; }
	.x:hover { color: var(--danger); }
</style>
