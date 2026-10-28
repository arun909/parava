<script lang="ts">
import { Dialog, Tabs } from "bits-ui";
import type { GlobeState } from "@/lib/globe/state.svelte";
import PathsPanel from "./PathsPanel.svelte";
import SpeciesCard from "./SpeciesCard.svelte";
import SpeciesPicker from "./SpeciesPicker.svelte";

let { globe }: { globe: GlobeState } = $props();
let open = $state(false);
let tab = $state("species");
let sheet = $state<HTMLElement | null>(null);
</script>

<Dialog.Root bind:open>
	<Dialog.Trigger class="sheet-trigger">Species &amp; paths</Dialog.Trigger>
	<Dialog.Portal>
		<Dialog.Overlay class="overlay" />
		<Dialog.Content class="sheet" bind:ref={sheet}>
			<Dialog.Title class="sr">Species and paths</Dialog.Title>
			<Dialog.Description class="sr">Choose which species to show and how paths are drawn.</Dialog.Description>
			<span class="grab" aria-hidden="true"></span>
			{#if globe.card}
				<button type="button" class="back" onclick={() => (globe.card = undefined)}>← All species</button>
				<SpeciesCard {globe} />
			{:else}
				<Tabs.Root bind:value={tab}>
					<Tabs.List class="tabs">
						<Tabs.Trigger value="species">Species</Tabs.Trigger>
						<Tabs.Trigger value="paths">Paths</Tabs.Trigger>
					</Tabs.List>
					<Tabs.Content value="species"><SpeciesPicker {globe} onpick={() => sheet?.scrollTo({ top: 0 })} /></Tabs.Content>
					<Tabs.Content value="paths"><PathsPanel {globe} /></Tabs.Content>
				</Tabs.Root>
			{/if}
			<Dialog.Close class="done">Done</Dialog.Close>
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>

<style>
	:global(.sheet-trigger) { background: var(--violet-strong); color: #fff; border: 0; border-radius: 99px; padding: 8px 16px; font: inherit; font-weight: 600; cursor: pointer; }
	:global(.sheet) { position: fixed; z-index: 41; left: 0; right: 0; bottom: 0; max-height: 80vh; overflow-y: auto; background: var(--surface); border-top: 1px solid var(--line); border-radius: var(--r) var(--r) 0 0; padding: var(--s3) var(--s4) var(--s5); }
	:global(.sr) { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
	.grab { display: block; width: 40px; height: 4px; background: var(--line); border-radius: 2px; margin: 0 auto var(--s3); }
	:global(.tabs) { display: flex; gap: var(--s2); margin-bottom: var(--s3); }
	:global(.tabs [role="tab"]) { flex: 1; background: var(--surface-2); color: var(--muted); border: 1px solid var(--line); border-radius: 99px; padding: 8px; font: inherit; }
	:global(.tabs [role="tab"][data-state="active"]) { background: var(--violet-strong); color: #fff; border-color: var(--violet-strong); }
	.back, :global(.done) { background: none; border: 0; color: var(--muted); font: inherit; cursor: pointer; padding: var(--s2) 0; }
	:global(.done) { display: block; margin: var(--s3) auto 0; }
</style>
