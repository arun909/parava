<script lang="ts">
import type { GlobeState } from "@/lib/globe/state.svelte";
import { PREPARED } from "@/lib/model";

let { globe, onpick }: { globe: GlobeState; onpick?: () => void } = $props();
</script>

<ul>
	{#each PREPARED as s (s.id)}
		{@const m = globe.match(s.id)}
		<li>
			<input type="checkbox" aria-label="Show {s.name}" checked={globe.on.has(s.id)} onchange={() => globe.toggle(s.id)} />
			<span class="dot" style:background={s.color}></span>
			<button
				type="button"
				class="name"
				aria-label="{s.name} details"
				onclick={() => {
					globe.card = s.id;
					globe.focus = s.id;
					onpick?.();
				}}>{s.name}</button
			>
			{#if m}<span class="badge {m.level}" title="{m.n} reports on the flyway, agreement with the model">{m.level}<span class="sr"> agreement</span></span>{/if}
		</li>
	{/each}
</ul>

<style>
	ul { list-style: none; margin: 0; padding: 0; }
	li { display: flex; align-items: center; padding: 5px 0; }
	input { margin: 0 var(--s2) 0 0; width: 18px; height: 18px; accent-color: var(--violet); }
	.sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
	.name { background: none; border: 0; color: inherit; font: inherit; padding: 0; cursor: pointer; text-align: left; }
	.name:hover { text-decoration: underline; }
	.badge { margin-left: auto; font: 0.65rem var(--mono); text-transform: uppercase; padding: 1px 6px; border-radius: 99px; border: 1px solid var(--line); color: var(--muted); }
	.badge.high { color: var(--ok); border-color: var(--ok); }
	.badge.medium { color: #eab308; border-color: #eab308; }
	.badge.low { color: var(--rose); border-color: var(--rose); }
</style>
