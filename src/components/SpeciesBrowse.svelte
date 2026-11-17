<script lang="ts">
import { birdGroups } from "@/lib/globe/groups";
import type { GlobeState } from "@/lib/globe/state.svelte";
import { PHASE_LABEL, PREPARED, speciesState } from "@/lib/model";

let { globe, onpick }: { globe: GlobeState; onpick?: () => void } = $props();

const groups = birdGroups(PREPARED);
let openGroup = $state<string | null>(null);
</script>

<!-- the phone's way to browse, where there is no hover: the same bird groups as the header's Species menu -->
<section aria-label="Browse">
	<h3>Browse</h3>
	{#each groups as g (g.id)}
		<details ontoggle={(e) => { if ((e.currentTarget as HTMLDetailsElement).open) openGroup = g.id; else if (openGroup === g.id) openGroup = null; }}>
			<summary>{g.label} <span class="mono">{g.species.length}</span></summary>
			{#if openGroup === g.id}
				<ul class="rows">
					{#each g.species as s (s.id)}
						<li>
							<input type="checkbox" aria-label="Show {s.name}" checked={globe.on.has(s.id)} onchange={() => globe.toggle(s.id)} />
							<button type="button" class="name" onclick={() => { globe.open(s.id); onpick?.(); }}>
								<span class="dot" style:background={s.color}></span>{s.name}
							</button>
							<span class="mono">{PHASE_LABEL[speciesState(s, globe.day).phase]}</span>
						</li>
					{/each}
				</ul>
			{/if}
		</details>
	{/each}
</section>

<style>
	h3 { font-size: 0.7rem; margin: var(--s4) 0 var(--s2); color: var(--muted); text-transform: uppercase; letter-spacing: 0.08em; }
	details { border-top: 1px solid var(--line); }
	summary { padding: 8px 0; cursor: pointer; font-size: 0.85rem; }
	summary .mono { color: var(--muted); font-size: 0.7rem; }
	.rows { list-style: none; margin: 0 0 var(--s2); padding: 0; max-height: 260px; overflow: auto; }
	.rows li { display: flex; align-items: center; padding: 3px 0; font-size: 0.85rem; }
	.rows input { margin: 0 var(--s2) 0 0; width: 16px; height: 16px; accent-color: var(--accent); }
	.name { background: none; border: 0; color: var(--text); font: inherit; padding: 0; cursor: pointer; text-align: left; flex: 1; }
	.name:hover { text-decoration: underline; }
	.rows .mono { font-size: 0.65rem; }
</style>
