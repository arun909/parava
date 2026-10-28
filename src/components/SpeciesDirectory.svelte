<script lang="ts">
interface Row {
	id: string;
	name: string;
	sci: string;
	family: string;
	color: string;
	status: string;
	estimated: boolean;
}
let { rows }: { rows: Row[] } = $props();

let q = $state("");
let only = $state<"all" | "curated" | "estimated">("all");
const shown = $derived.by(() => {
	const t = q.trim().toLowerCase();
	return rows.filter(
		(r) =>
			(only === "all" || (only === "estimated") === r.estimated) &&
			(!t || `${r.name} ${r.sci} ${r.family}`.toLowerCase().includes(t)),
	);
});
</script>

<div class="bar">
	<input type="search" placeholder="Search {rows.length} species" aria-label="Search species" bind:value={q} />
	<div role="group" aria-label="Filter">
		{#each [["all", "All"], ["curated", "Hand-modelled"], ["estimated", "Estimated"]] as const as [k, label]}
			<button type="button" class:on={only === k} aria-pressed={only === k} onclick={() => (only = k)}>{label}</button>
		{/each}
	</div>
</div>
<p class="mono" aria-live="polite">{shown.length} shown</p>
<ul class="grid">
	{#each shown.slice(0, 240) as r (r.id)}
		<li class="card">
			<span class="dot" style:background={r.color}></span>
			<a href="/species/{r.id}/"><strong>{r.name}</strong></a>
			<div><i>{r.sci}</i></div>
			<div class="mono">{r.status}{r.estimated ? " · estimated" : ""}</div>
		</li>
	{/each}
</ul>
{#if shown.length > 240}<p class="mono">Showing the first 240. Search to narrow down.</p>{/if}

<style>
	.bar { display: flex; flex-wrap: wrap; gap: var(--s3); align-items: center; margin-bottom: var(--s3); }
	input { flex: 1; min-width: 220px; background: var(--surface); color: var(--text); border: 1px solid var(--line); border-radius: 10px; padding: 10px 14px; font: inherit; }
	.bar div { display: flex; gap: var(--s2); }
	button { background: var(--surface-2); color: var(--muted); border: 1px solid var(--line); border-radius: 99px; padding: 6px 14px; font: inherit; cursor: pointer; }
	button.on { background: var(--violet-strong); color: #fff; border-color: var(--violet-strong); }
	ul { list-style: none; padding: 0; }
</style>
