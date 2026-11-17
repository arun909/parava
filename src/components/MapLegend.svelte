<script lang="ts">
import { Popover } from "bits-ui";
import { HEAT_RAMP } from "@/lib/globe/GlobeController";
import type { GlobeState } from "@/lib/globe/state.svelte";

let { globe }: { globe: GlobeState } = $props();

const ramp = `linear-gradient(90deg, ${HEAT_RAMP.map(([r, g, b], i) => `rgb(${r} ${g} ${b}) ${Math.round((i / (HEAT_RAMP.length - 1)) * 100)}%`).join(", ")})`;
const SPAN = [
	["current", "Flying now"],
	["year", "Whole year"],
] as const;
const STYLE = [
	[false, "Glow"],
	[true, "Lines"],
] as const;
</script>

<!-- what the colours on the map mean: the scale or switch at a glance, the explanation behind the (i) -->
<div class="legend" aria-label="Map key">
	<div class="row">
		{#if globe.show === "density"}
			<div class="scale">
				<div class="ramp" style:background={ramp}></div>
				<div class="ends"><span>Fewer birds</span><span>More birds</span></div>
			</div>
		{:else}
			<div class="seg" role="group" aria-label="Which routes">
				{#each SPAN as [k, label]}
					<button type="button" class:on={globe.span === k} aria-pressed={globe.span === k} onclick={() => (globe.span = k)}>{label}</button>
				{/each}
			</div>
		{/if}
		<Popover.Root>
			<Popover.Trigger class="key-info" aria-label="About {globe.show === 'density' ? 'Density' : 'Routes'}">
				<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.6" fill="none" stroke="currentColor" stroke-width="1.4" /><path d="M8 7.2v4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" /><circle cx="8" cy="4.9" r="0.95" fill="currentColor" /></svg>
			</Popover.Trigger>
			<Popover.Portal>
				<Popover.Content class="key-pop" side="bottom" align="end" sideOffset={8}>
					{#if globe.show === "density"}
						<p>Where birds are on the selected date.</p>
					{:else}
						<ul>
							<li><i style="background:var(--spring)"></i>Spring (northbound)</li>
							<li><i style="background:var(--autumn)"></i>Autumn (southbound)</li>
							<li><i class="hot"></i>Distance flown</li>
						</ul>
					{/if}
					<p class="hint">Lines draws every route as a hovered one is: solid where the flock has flown, arrows showing the way. Select a species to highlight its route.</p>
				</Popover.Content>
			</Popover.Portal>
		</Popover.Root>
	</div>
	{#if globe.show === "routes"}
		<div class="seg which" role="group" aria-label="How routes are drawn">
			{#each STYLE as [k, label]}
				<button type="button" class:on={globe.traceAll === k} aria-pressed={globe.traceAll === k} onclick={() => (globe.traceAll = k)}>{label}</button>
			{/each}
		</div>
	{/if}
</div>

<style>
	/* plain system type at a readable size: this box is read at a glance, so it skips the brand's display faces */
	.legend, :global(.key-pop) { font: 0.85rem / 1.4 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: var(--text); }
	.row { display: flex; align-items: center; gap: var(--s2); }
	.scale { flex: 1; }
	.ramp { height: 8px; border-radius: 99px; border: 1px solid var(--line); }
	.ends { display: flex; justify-content: space-between; margin-top: 4px; font-size: 0.78rem; color: var(--muted); }
	.seg { flex: 1; display: flex; background: var(--bg); border: 1px solid var(--line); border-radius: 99px; padding: 3px; }
	.seg button { flex: 1; background: none; border: 0; color: var(--muted); border-radius: 99px; padding: 4px; font: inherit; font-size: 0.8rem; cursor: pointer; }
	.seg button.on { background: var(--accent-strong); color: #fff; }
	.which { margin-top: var(--s2); margin-right: 36px; }
	:global(.key-info) { flex: none; display: grid; place-items: center; width: 28px; height: 28px; border: 0; border-radius: 50%; background: none; color: var(--muted); cursor: pointer; }
	:global(.key-info:hover), :global(.key-info[data-state="open"]) { color: var(--text); background: var(--surface-2); }
	:global(.key-pop) { z-index: 50; width: 220px; padding: var(--s3); background: var(--surface); border: 1px solid var(--line); border-radius: 12px; box-shadow: var(--shadow); }
	:global(.key-pop p) { margin: 0; }
	:global(.key-pop .hint) { margin-top: var(--s2); color: var(--muted); font-size: 0.8rem; }
	:global(.key-pop ul) { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; }
	:global(.key-pop i) { display: inline-block; width: 16px; height: 4px; margin-right: 8px; vertical-align: middle; border-radius: 2px; }
	:global(.key-pop i.hot) { height: 6px; background: var(--text); }
</style>
