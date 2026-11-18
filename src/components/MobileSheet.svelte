<script lang="ts">
import { Dialog } from "bits-ui";
import { untrack } from "svelte";
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

// the species on the map when the sheet opened: once the set differs, a tick button appears to confirm and close
let opened = $state("");
const current = $derived(globe.shown.map((s) => s.id).join(","));
$effect(() => {
	if (open) opened = untrack(() => current);
});
const changed = $derived(open && current !== opened);

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
			<Dialog.Description class="sr">Choose which species to show on the map. Swipe down or press Close to close.</Dialog.Description>
			<!-- stays at the top while the list scrolls: the grab bar to swipe it away, and a quiet close -->
			<div class="sheet-head">
				{#if globe.card}
					<button type="button" class="back" onclick={() => globe.close()}>← All species</button>
				{:else}
					<span class="head-title">Species</span>
				{/if}
				<span class="grab" aria-hidden="true"></span>
				<Dialog.Close class="sheet-x" aria-label="Close">
					<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
				</Dialog.Close>
			</div>
			{#if globe.card}
				<SpeciesCard {globe} />
			{:else}
				<!-- only the species list: what the map draws is set from the header and the route row above the map -->
				<div class="groups"><QuickGroups {globe} /></div>
				<SpeciesPicker {globe} inline hint="No species yet. Search, browse below or pick a Quick group." onpick={() => sheet?.scrollTo({ top: 0 })} />
				<SpeciesBrowse {globe} onpick={() => sheet?.scrollTo({ top: 0 })} />
			{/if}
			{#if changed}
				<!-- after a change: a small tick at the bottom right that confirms and closes -->
				<Dialog.Close class="tick" aria-label="Done: show these species on the map">
					<svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path d="M5.5 12.5l4 4L18.5 8" /></svg>
				</Dialog.Close>
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
	:global(.sheet-x) { display: grid; place-items: center; width: 36px; height: 36px; margin-right: -6px; border: 0; border-radius: 50%; background: none; color: var(--muted); cursor: pointer; }
	:global(.sheet-x svg) { fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; }
	:global(.sheet-x:hover) { color: var(--text); background: var(--surface-2); }
	/* the confirm tick: small, round and soft, floating bottom right; it pops in with a little bounce */
	:global(.sheet .tick) { position: fixed; z-index: 3; right: 18px; bottom: calc(18px + env(safe-area-inset-bottom)); display: grid; place-items: center; width: 46px; height: 46px; border: 0; border-radius: 50%; background: linear-gradient(150deg, color-mix(in srgb, var(--accent) 85%, #fff), var(--accent)); color: #fff; box-shadow: 0 6px 14px -6px rgb(33 51 40 / 0.5), 0 0 0 3px color-mix(in srgb, var(--accent) 18%, var(--surface)); cursor: pointer; animation: tick-in 0.35s cubic-bezier(0.34, 1.56, 0.64, 1); transition: transform 0.15s; }
	:global(.sheet .tick svg) { fill: none; stroke: currentColor; stroke-width: 2.6; stroke-linecap: round; stroke-linejoin: round; }
	:global(.sheet .tick:active) { transform: scale(0.9); }
	@keyframes tick-in { from { opacity: 0; transform: scale(0.4) rotate(-20deg); } }
	/* room under the list so the tick never covers its last row */
	:global(.sheet) { padding-bottom: 80px; }
</style>
