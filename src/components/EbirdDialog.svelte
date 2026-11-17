<script lang="ts">
import { Dialog } from "bits-ui";
import type { GlobeState } from "@/lib/globe/state.svelte";

let { globe }: { globe: GlobeState } = $props();
let open = $state(false);
let key = $state(globe.ebird.current.key);
let regions = $state(globe.ebird.current.regions);

function save(e: SubmitEvent) {
	e.preventDefault();
	globe.ebird.current = { key: key.trim(), regions: regions.trim() || "IN" };
	open = false;
}
</script>

<Dialog.Root bind:open>
	<Dialog.Trigger class="trigger">
		eBird {globe.ebird.current.key ? "on" : "off"}
	</Dialog.Trigger>
	<Dialog.Portal>
		<Dialog.Overlay class="overlay" />
		<Dialog.Content class="dialog">
			<Dialog.Title>eBird sightings</Dialog.Title>
			<Dialog.Description>
				eBird needs your own free key from
				<a href="https://ebird.org/api/keygen" target="_blank" rel="noreferrer">ebird.org/api/keygen</a>. It is stored only
				in this browser and sent only to api.ebird.org.
			</Dialog.Description>
			<form onsubmit={save}>
				<label>API key <input bind:value={key} autocomplete="off" spellcheck="false" /></label>
				<label>
					Regions <input bind:value={regions} placeholder="IN, IN-KL" />
					<small>Country or state codes, comma-separated.</small>
				</label>
				{#if globe.ebirdError}<p class="err" role="alert">{globe.ebirdError}</p>{/if}
				<div class="row">
					<button type="submit" class="btn">Save</button>
					{#if globe.ebird.current.key}
						<button
							type="button"
							onclick={() => {
								key = "";
								globe.ebird.current = { ...globe.ebird.current, key: "" };
								open = false;
							}}>Remove key</button
						>
					{/if}
					<Dialog.Close>Cancel</Dialog.Close>
				</div>
			</form>
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>

<style>
	:global(.overlay) { position: fixed; inset: 0; background: rgb(33 51 40 / 0.45); z-index: 40; }
	:global(.dialog) { position: fixed; z-index: 41; top: 50%; left: 50%; transform: translate(-50%, -50%); width: min(440px, calc(100vw - 32px)); background: var(--surface); border: 1px solid var(--line); border-radius: var(--r); padding: var(--s5); }
	:global(.dialog) :global([data-dialog-title]) { font-size: 1.3rem; font-weight: 700; margin-bottom: var(--s2); }
	:global(.dialog) :global([data-dialog-close]), form button[type="button"] { background: none; border: 0; color: var(--muted); font: inherit; cursor: pointer; }
	:global(.dialog) :global(p), :global(.dialog) :global(small) { color: var(--muted); font-size: 0.9rem; }
	form { display: grid; gap: var(--s4); margin-top: var(--s4); }
	label { display: grid; gap: var(--s1); font-size: 0.85rem; }
	input { background: var(--bg); color: var(--text); border: 1px solid var(--line); border-radius: 8px; padding: var(--s2) var(--s3); font: 0.9rem var(--mono); }
	.row { display: flex; gap: var(--s3); align-items: center; }
	.err { color: var(--danger); }
	:global(.trigger) { background: var(--surface-2); color: var(--text); border: 1px solid var(--line); border-radius: 99px; padding: 2px 12px; font: inherit; cursor: pointer; }
</style>
