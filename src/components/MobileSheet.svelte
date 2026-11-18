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

// swipe down to close: from the header at any time, or from anywhere once the list is scrolled to its top.
// The sheet follows the finger; a long enough pull (or a quick flick) closes it, anything less springs back.
const CLOSE_AT = 90;
const FLICK = 0.35; // px per ms: a quick flick closes it even if it is short
let dragY = $state(0);
let start: { y: number; t: number } | null = null;
function touchstart(e: TouchEvent) {
	const fromHead = (e.target as HTMLElement).closest(".sheet-head");
	if (!fromHead && (sheet?.scrollTop ?? 0) > 0) return;
	start = { y: e.touches[0]!.clientY, t: performance.now() };
}
function touchmove(e: TouchEvent) {
	if (!start) return;
	const dy = e.touches[0]!.clientY - start.y;
	// pulling up is an ordinary scroll: let it go
	if (dy <= 0 && dragY === 0) {
		start = null;
		return;
	}
	dragY = Math.max(0, dy);
}
function touchend() {
	if (!start) return;
	const speed = dragY / Math.max(1, performance.now() - start.t);
	if (dragY > CLOSE_AT || (dragY > 30 && speed > FLICK)) open = false;
	dragY = 0;
	start = null;
}
</script>

<Dialog.Root bind:open>
	<Dialog.Portal>
		<Dialog.Overlay class="overlay" />
		<Dialog.Content
			class="sheet"
			bind:ref={sheet}
			style={dragY ? `transform: translateY(${dragY}px); transition: none` : undefined}
			ontouchstart={touchstart}
			ontouchmove={touchmove}
			ontouchend={touchend}
			ontouchcancel={touchend}
		>
			<Dialog.Title class="sr">Species</Dialog.Title>
			<Dialog.Description class="sr">Choose which species to show on the map. Swipe down or press Done to close.</Dialog.Description>
			<!-- stays at the top while the list scrolls: the grab bar to swipe it away, and Done always in reach -->
			<div class="sheet-head">
				{#if globe.card}
					<button type="button" class="back" onclick={() => globe.close()}>← All species</button>
				{:else}
					<span class="head-title">Species</span>
				{/if}
				<span class="grab" aria-hidden="true"></span>
				<Dialog.Close class="done">Done</Dialog.Close>
			</div>
			{#if globe.card}
				<SpeciesCard {globe} />
			{:else}
				<!-- only the species list: what the map draws is set from the header and the route row above the map -->
				<div class="groups"><QuickGroups {globe} /></div>
				<SpeciesPicker {globe} inline hint="No species yet. Search, browse below or pick a Quick group." onpick={() => sheet?.scrollTo({ top: 0 })} />
				<SpeciesBrowse {globe} onpick={() => sheet?.scrollTo({ top: 0 })} />
			{/if}
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>

<style>
	:global(.sheet) { position: fixed; z-index: 41; left: 0; right: 0; bottom: 0; max-height: 80vh; overflow-y: auto; overscroll-behavior: contain; background: var(--surface); border-top: 1px solid var(--line); border-radius: var(--r) var(--r) 0 0; padding: 0 var(--s4) var(--s5); transition: transform 0.22s cubic-bezier(0.3, 0.7, 0.4, 1); }
	:global(.sr) { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
	/* the sheet's header: title or back on the left, the grab bar centred above, Done on the right */
	.sheet-head { position: sticky; top: 0; z-index: 2; display: flex; align-items: center; justify-content: space-between; min-height: 52px; margin: 0 calc(-1 * var(--s4)) var(--s2); padding: 14px var(--s4) 6px; background: var(--surface); border-bottom: 1px solid color-mix(in srgb, var(--line) 60%, transparent); touch-action: none; }
	.grab { position: absolute; top: 7px; left: 50%; width: 40px; height: 4px; margin-left: -20px; background: var(--line); border-radius: 2px; }
	.head-title { font-weight: 600; }
	.groups { display: flex; justify-content: flex-end; margin-bottom: var(--s2); }
	.back { background: none; border: 0; color: var(--muted); font: inherit; cursor: pointer; padding: var(--s2) 0; }
	:global(.done) { padding: 7px 16px; border: 0; border-radius: 99px; background: var(--accent-strong); color: #fff; font: 600 0.9rem var(--font); cursor: pointer; }
</style>
