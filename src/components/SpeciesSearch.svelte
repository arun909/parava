<script lang="ts">
import { searchSpecies } from "@/lib/globe/groups";
import type { GlobeState } from "@/lib/globe/state.svelte";
import { PREPARED } from "@/lib/model";

/** `inline`: list the matches under the field (the phone's sheet, which has no Species menu). */
let { globe, inline = false }: { globe: GlobeState; inline?: boolean } =
	$props();

let input = $state<HTMLInputElement | null>(null);
// inline keeps its own text; otherwise the text is shared, so the Species menu can show the matches
let local = $state("");
const text = $derived(inline ? local : (globe.query ?? ""));
const set = (v: string | null) => {
	if (inline) local = v ?? "";
	else globe.query = v;
};
const matches = $derived(
	inline && local.trim() ? searchSpecies(PREPARED, local) : [],
);

function slash(e: KeyboardEvent) {
	const t = e.target as HTMLElement;
	if (!inline && e.key === "/" && !/^(INPUT|TEXTAREA)$/.test(t.tagName)) {
		e.preventDefault();
		input?.focus();
	}
}
</script>

<svelte:window onkeydown={slash} />

<!-- typing here opens the Species menu with the matches, so they get the menu's room and its tick boxes -->
<div class="field" data-species-search={inline ? undefined : ""}>
	<svg class="glass" width="15" height="15" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
	<input
		bind:this={input}
		value={text}
		oninput={(e) => set(e.currentTarget.value)}
		onfocus={() => {
			if (!inline) globe.query ??= "";
		}}
		onkeydown={(e) => {
			// Enter adds the best match
			const best = text.trim() && searchSpecies(PREPARED, text)[0];
			if (e.key === "Enter" && best && !globe.on.has(best.id)) globe.toggle(best.id);
			if (e.key === "Escape") {
				set(null);
				input?.blur();
			}
		}}
		class="search"
		type="search"
		placeholder={inline ? "Search species" : "Search species  ( / )"}
		aria-label={inline ? "Search species to add" : "Search species to add; the matches open in the Species menu"}
		aria-controls={inline ? undefined : "species-panel"} />
</div>

{#if inline && local.trim()}
	<ul class="matches" aria-label="Matches">
		{#each matches as s (s.id)}
			<li>
				<label>
					<input type="checkbox" checked={globe.on.has(s.id)} onchange={() => globe.toggle(s.id)} />
					<span>{s.name}</span>
				</label>
			</li>
		{:else}
			<li class="none">No species match.</li>
		{/each}
	</ul>
{/if}

<style>
	.field { position: relative; margin-bottom: var(--s3); }
	.glass { position: absolute; left: 10px; top: 50%; transform: translateY(-50%); fill: none; stroke: var(--muted); stroke-width: 2; stroke-linecap: round; pointer-events: none; }
	.search { width: 100%; height: 34px; background: var(--bg); color: var(--text); border: 1px solid var(--line); border-radius: 8px; padding: 0 10px 0 32px; font: 0.85rem var(--font); }
	.search::-webkit-search-cancel-button { cursor: pointer; }
	.search:focus { border-color: var(--accent); outline: none; box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 18%, transparent); }
	.matches { list-style: none; margin: 0 0 var(--s3); padding: 0; max-height: 260px; overflow: auto; }
	.matches label { display: flex; align-items: center; gap: var(--s3); padding: 6px 0; font-size: 0.9rem; cursor: pointer; }
	.matches input { width: 16px; height: 16px; margin: 0; accent-color: var(--accent-strong); }
	.none { padding: 6px 0; color: var(--muted); font-size: 0.85rem; }
</style>
