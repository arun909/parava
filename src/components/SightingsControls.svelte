<script lang="ts">
import type { GlobeState } from "@/lib/globe/state.svelte";
import EbirdDialog from "./EbirdDialog.svelte";

let { globe }: { globe: GlobeState } = $props();
</script>

<div class="sightings">
	<label class="check"><input type="checkbox" bind:checked={globe.showAway} /> Unusual sightings <small>(zoom in)</small></label>
	<EbirdDialog {globe} />
</div>

<style>
	.sightings { display: flex; flex-direction: column; align-items: flex-start; gap: var(--s2); }
	.check { display: flex; gap: var(--s2); align-items: center; font-size: 0.8rem; color: var(--muted); cursor: pointer; }
	.check input { accent-color: var(--accent); }
	.check small { opacity: 0.7; }
</style>
