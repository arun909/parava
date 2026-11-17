<script lang="ts">
import { Portal } from "bits-ui";
import { tick, untrack } from "svelte";
import { birdGroups, searchSpecies } from "@/lib/globe/groups";
import { presets } from "@/lib/globe/presets";
import type { GlobeState } from "@/lib/globe/state.svelte";
import { dayOfYear, PREPARED } from "@/lib/model";

/** `clear`: the left edge the panel keeps right of, so the species panel stays in view. */
let { globe, clear = 16 }: { globe: GlobeState; clear?: number } = $props();

const SEASONS = [
	["all", "All"],
	["winter", "Winter"],
	["summer", "Summer"],
	["passage", "Passage"],
] as const;
let season = $state<string>("all");

const byId = new Map(PREPARED.map((s) => [s.id, s]));
const byName = (a: { name: string }, b: { name: string }) =>
	a.name.localeCompare(b.name);
const all = birdGroups(PREPARED);
// a quick set is browsed and added exactly like a group
const sets = presets(PREPARED, dayOfYear()).map((p) => ({
	key: `set:${p.id}`,
	label: p.label,
	species: p.ids.flatMap((id) => byId.get(id) ?? []).sort(byName),
}));
// the season narrows every group; a group with nothing left in that season drops out
const groups = $derived(
	all
		.map((g) => ({
			key: `group:${g.id}`,
			label: g.label,
			species:
				season === "all"
					? g.species
					: g.species.filter((s) => s.kind === season),
		}))
		.filter((g) => g.species.length > 0),
);

// the species panel's search shows its matches here, as one more list
const found = $derived(
	globe.query === null
		? null
		: {
				key: "search",
				label: globe.query.trim()
					? `Results for “${globe.query.trim()}”`
					: "All species",
				species: searchSpecies(PREPARED, globe.query),
			},
);

let picked = $state("");
const active = $derived(
	(picked === "search" && found) ||
		([...groups, ...sets].find((g) => g.key === picked) ?? groups[0]),
);
const onIn = (list: { id: string }[]) =>
	list.filter((s) => globe.on.has(s.id)).length;
const allOn = $derived(
	active ? onIn(active.species) === active.species.length : false,
);

/* the panel is only as wide as its columns: from just right of the species panel, within the window */
const SIDE = 248;
const SETS = 200;
const COL = 212;
const GAP = 36;
const PAD = 28;
let left = $state(16);
let cols = $state(2);
let colW = $state(COL);
let stacked = $state(false);
function place() {
	const w = innerWidth;
	let x = clear;
	const room = () => w - x - 18 - 2 * PAD - SIDE - GAP; // 16 to the window edge, 2 for the border
	let r = room() - SETS - GAP;
	// too narrow for three columns: quick sets go under the groups
	stacked = r < COL;
	if (stacked) r = room();
	if (r < COL) {
		x = Math.max(16, x - (COL - r));
		r = COL;
	}
	cols = Math.max(1, Math.min(3, Math.floor((r + GAP) / (COL + GAP))));
	// spare room goes to the columns, up to a comfortable line length
	colW = Math.min(240, Math.floor((r - (cols - 1) * GAP) / cols));
	left = x;
}
// each column read top to bottom, like a printed index
const columns = $derived.by(() => {
	const list = active?.species ?? [];
	const n = Math.ceil(list.length / cols);
	return Array.from({ length: cols }, (_, i) => list.slice(i * n, (i + 1) * n));
});

/* opens on hover like a site's main navigation, after a beat so passing over it does nothing;
   opened by a click, it stays until a click outside or Escape */
let open = $state(false);
let pinned = false;
let timer: ReturnType<typeof setTimeout> | undefined;
let trigger = $state<HTMLButtonElement | null>(null);
let panel = $state<HTMLElement | null>(null);
const show = () => {
	place();
	open = true;
};
const later = (v: boolean, ms: number) => {
	clearTimeout(timer);
	if (!v && pinned) return;
	timer = setTimeout(() => (v ? show() : (open = false)), ms);
};
const hold = () => clearTimeout(timer);
const mouse = (e: PointerEvent) => e.pointerType === "mouse";
function close(focus = false) {
	clearTimeout(timer);
	open = pinned = false;
	globe.query = null;
	if (focus) trigger?.focus();
}
// the search field is part of the menu while it is searching
function outside(e: PointerEvent) {
	const t = e.target as Element;
	if (
		open &&
		!panel?.contains(t) &&
		!trigger?.contains(t) &&
		!t.closest?.("[data-species-search]")
	)
		close();
}
// typing in the search opens the menu on the matches; leaving the search closes it
$effect(() => {
	const searching = globe.query !== null;
	untrack(() => {
		if (searching) {
			picked = "search";
			if (!open) {
				pinned = true;
				show();
			}
		} else if (picked === "search") {
			picked = "";
			close();
		}
	});
});
</script>

<svelte:window
	onkeydown={(e) => { if (open && e.key === "Escape") close(true); }}
	onpointerdown={outside}
	onresize={() => open && place()} />

<button
	type="button"
	class="species-trigger"
	bind:this={trigger}
	aria-expanded={open}
	aria-controls="species-panel"
	data-state={open ? "open" : "closed"}
	onpointerenter={(e) => mouse(e) && later(true, 120)}
	onpointerleave={(e) => mouse(e) && later(false, 300)}
	onclick={(e) => {
		clearTimeout(timer);
		if (open && pinned) return close();
		pinned = true;
		show();
		// opened from the keyboard: take focus into the panel
		if (e.detail === 0) tick().then(() => panel?.querySelector("button")?.focus());
	}}>Species <span aria-hidden="true">▾</span></button>

<Portal to=".stage">
	{#if open}
		<div
			id="species-panel"
			class="sp-panel"
			class:stacked
			role="region"
			aria-label="Browse species"
			bind:this={panel}
			style:left="{left}px"
			style:--cols={cols}
			style:--side="{SIDE}px"
			style:--sets="{SETS}px"
			style:--col="{colW}px"
			style:--gap="{GAP}px"
			style:--pad="{PAD}px"
			onpointerenter={(e) => mouse(e) && hold()}
			onpointerleave={(e) => mouse(e) && later(false, 300)}>
			<div class="col side">
				<h3>Bird groups</h3>
				<div class="season" role="radiogroup" aria-label="Season">
					{#each SEASONS as [k, label]}
						<button type="button" role="radio" aria-checked={season === k} class:on={season === k} onclick={() => (season = k)}>{label}</button>
					{/each}
				</div>
				<ul class="groups">
					{#each groups as g (g.key)}
						<li>{@render row(g)}</li>
					{/each}
				</ul>
				{#if stacked}{@render quick()}{/if}
			</div>

			{#if active}
				<section class="col birds" aria-label={active.label}>
					<div class="head">
						<p><strong>{active.label}</strong> <span>{active.species.length} species{active === found && !globe.query?.trim() ? ", A to Z" : ""}</span></p>
						{#if !active.species.length || (active === found && !globe.query?.trim())}
							<!-- nothing to add, or all 390 at once: no button -->
						{:else if allOn}
							<span class="act done">All added</span>
						{:else}
							<button type="button" class="act" onclick={() => globe.addAll(active.species.map((s) => s.id))}>Add all</button>
						{/if}
					</div>
					<div class="list">
						{#each columns as c, i (i)}
							<ul>
								{#each c as s (s.id)}
									<li>
										<label class="b" title={s.sci}>
											<input type="checkbox" checked={globe.on.has(s.id)} onchange={() => globe.toggle(s.id)} />
											<span>{s.name}</span>
										</label>
									</li>
								{/each}
							</ul>
						{/each}
					</div>
					{#if !active.species.length}<p class="none">No species match. Try a shorter name, a scientific name or a family.</p>{/if}
				</section>
			{/if}

			{#if !stacked}<div class="col">{@render quick()}</div>{/if}
		</div>
	{/if}
</Portal>

{#snippet quick()}
	<h3 class="sets-head">Quick sets</h3>
	<ul class="groups">
		{#each sets as g (g.key)}
			<li>{@render row(g)}</li>
		{/each}
	</ul>
{/snippet}

{#snippet row(g: { key: string; label: string; species: { id: string }[] })}
	{@const n = onIn(g.species)}
	<button type="button" class="g" class:on={active?.key === g.key} aria-current={active?.key === g.key} onpointerenter={() => (picked = g.key)} onfocus={() => (picked = g.key)} onclick={() => (picked = g.key)}>
		<span class="gl">{g.label}</span>
		<span class="count">{#if n}<em>{n}</em>{" of "}{/if}{g.species.length}</span>
	</button>
{/snippet}

<style>
	/* rendered inside the map stage so its toolbar stays on top */
	.sp-panel { position: fixed; top: 60px; z-index: 19; display: grid; grid-template-columns: var(--side) calc(var(--cols) * var(--col) + (var(--cols) - 1) * var(--gap)) var(--sets); gap: var(--gap); max-height: calc(100vh - 80px); padding: 24px var(--pad) var(--pad); background: var(--surface); border: 1px solid var(--line); border-radius: var(--r); box-shadow: 0 2px 4px rgb(33 51 40 / 0.05), 0 12px 32px rgb(33 51 40 / 0.12); font-family: var(--font); color: var(--text); animation: drop 0.18s ease-out; }
	.sp-panel.stacked { grid-template-columns: var(--side) calc(var(--cols) * var(--col) + (var(--cols) - 1) * var(--gap)); }
	.col { min-width: 0; min-height: 0; }
	.side { overflow-y: auto; overscroll-behavior: contain; }
	/* the same small label as the species panel's "On the map" */
	h3 { margin: 0 0 var(--s3); color: var(--muted); font-size: 0.7rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; line-height: 1.6; }
	.sets-head { margin-top: var(--s5); }
	.col:last-child > .sets-head { margin-top: 0; }
	ul { list-style: none; margin: 0; padding: 0; }
	button { background: none; border: 0; padding: 0; font: inherit; color: inherit; text-align: left; cursor: pointer; }

	.season { display: flex; gap: 2px; margin-bottom: var(--s3); padding: 3px; background: var(--surface-2); border-radius: 8px; }
	.season button { flex: 1; padding: 6px 0; border-radius: 6px; color: var(--muted); font-size: 0.8rem; text-align: center; }
	.season button:hover { color: var(--text); }
	.season button.on { background: var(--surface); color: var(--text); font-weight: 600; box-shadow: 0 1px 2px rgb(33 51 40 / 0.12); }

	.groups { display: grid; gap: 2px; margin: 0 -10px; }
	.g { display: flex; align-items: baseline; gap: var(--s3); width: 100%; padding: 8px 10px; border-radius: 8px; font-size: 0.9rem; line-height: 1.3; }
	.g:hover { background: var(--surface-2); }
	.g.on { background: var(--surface-2); font-weight: 600; }
	.gl { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.count { flex: none; color: var(--muted); font-size: 0.8rem; font-weight: 400; font-variant-numeric: tabular-nums; }
	.count em { color: var(--accent); font-style: normal; font-weight: 600; }

	.birds { display: flex; flex-direction: column; }
	.head { display: flex; align-items: baseline; justify-content: space-between; gap: var(--s3); padding-bottom: var(--s3); margin-bottom: var(--s3); border-bottom: 1px solid var(--line); }
	.head p { min-width: 0; margin: 0; font-size: 1rem; line-height: 1.3; }
	.head p span { margin-left: 6px; white-space: nowrap; color: var(--muted); font-size: 0.8rem; }
	.act { flex: none; color: var(--link); font-size: 0.85rem; font-weight: 600; }
	.act:hover { text-decoration: underline; }
	.act.done { color: var(--muted); font-weight: 400; }
	.list { display: grid; grid-template-columns: repeat(var(--cols), minmax(0, 1fr)); gap: 0 var(--gap); min-height: 0; max-height: 500px; overflow-y: auto; overscroll-behavior: contain; }
	.b { display: flex; align-items: center; gap: var(--s3); padding: 7px 0; font-size: 0.9rem; line-height: 1.3; cursor: pointer; }
	.b span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.b:hover span { text-decoration: underline; text-decoration-color: var(--line); text-underline-offset: 3px; }
	.b input { flex: none; width: 16px; height: 16px; margin: 0; accent-color: var(--accent-strong); cursor: pointer; }
	.b:has(input:checked) span { font-weight: 500; }

	.none { margin: var(--s2) 0 0; color: var(--muted); font-size: 0.9rem; }
	@keyframes drop { from { opacity: 0; transform: translateY(-6px); } }
</style>
