<script lang="ts">
import { Dialog } from "bits-ui";
import type { GlobeState } from "@/lib/globe/state.svelte";
import QuickGroups from "./QuickGroups.svelte";
import SpeciesBrowse from "./SpeciesBrowse.svelte";
import SpeciesCard from "./SpeciesCard.svelte";
import SpeciesPicker from "./SpeciesPicker.svelte";

/** Opened from the Species button in the map's header on phones. */
let {
	globe,
	open = $bindable(false),
}: { globe: GlobeState; open?: boolean } = $props();
let sheet = $state<HTMLElement | null>(null);
</script>

<Dialog.Root bind:open>
	<Dialog.Portal>
		<Dialog.Overlay class="overlay" />
		<Dialog.Content class="sheet" bind:ref={sheet}>
			<Dialog.Title class="sr">Species</Dialog.Title>
			<Dialog.Description class="sr">Choose which species to show on the map.</Dialog.Description>
			<span class="grab" aria-hidden="true"></span>
			{#if globe.card}
				<button type="button" class="back" onclick={() => globe.close()}>← All species</button>
				<SpeciesCard {globe} />
			{:else}
				<!-- only the species list: what the map draws is set from the header and the route row above the map -->
				<div class="groups"><QuickGroups {globe} /></div>
				<SpeciesPicker {globe} inline hint="No species yet. Search, browse below or pick a Quick group." onpick={() => sheet?.scrollTo({ top: 0 })} />
				<SpeciesBrowse {globe} onpick={() => sheet?.scrollTo({ top: 0 })} />
			{/if}
			<Dialog.Close class="done">Done</Dialog.Close>
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>

<style>
	:global(.sheet) { position: fixed; z-index: 41; left: 0; right: 0; bottom: 0; max-height: 80vh; overflow-y: auto; background: var(--surface); border-top: 1px solid var(--line); border-radius: var(--r) var(--r) 0 0; padding: var(--s3) var(--s4) var(--s5); }
	:global(.sr) { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
	.groups { display: flex; justify-content: flex-end; margin-bottom: var(--s2); }
	.grab { display: block; width: 40px; height: 4px; background: var(--line); border-radius: 2px; margin: 0 auto var(--s3); }
	.back, :global(.done) { background: none; border: 0; color: var(--muted); font: inherit; cursor: pointer; padding: var(--s2) 0; }
	:global(.done) { display: block; margin: var(--s3) auto 0; }
</style>
