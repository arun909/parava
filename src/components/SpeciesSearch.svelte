<script lang="ts">
import { Combobox } from "bits-ui";
import type { GlobeState } from "@/lib/globe/state.svelte";
import { PHASE_LABEL, PREPARED, speciesState } from "@/lib/model";

let { globe, onpick }: { globe: GlobeState; onpick?: () => void } = $props();

let q = $state("");
let open = $state(false);
let input = $state<HTMLInputElement | null>(null);

const status = (id: string) => {
	const s = PREPARED.find((x) => x.id === id);
	return s ? PHASE_LABEL[speciesState(s, globe.day).phase] : "";
};

// matches names, scientific names and families; a name that starts with the text comes first
const results = $derived.by(() => {
	const t = q.trim().toLowerCase();
	if (!t) return [];
	const hit = (s: (typeof PREPARED)[number]) =>
		`${s.name} ${s.sci} ${s.family ?? ""}`.toLowerCase().includes(t);
	return PREPARED.filter(hit)
		.sort(
			(a, b) =>
				Number(b.name.toLowerCase().startsWith(t)) -
					Number(a.name.toLowerCase().startsWith(t)) ||
				a.name.localeCompare(b.name),
		)
		.slice(0, 8);
});

function pick(id: string) {
	if (!id) return;
	globe.open(id);
	q = "";
	open = false;
	onpick?.();
}

function slash(e: KeyboardEvent) {
	const t = e.target as HTMLElement;
	if (e.key === "/" && !/^(INPUT|TEXTAREA)$/.test(t.tagName)) {
		e.preventDefault();
		input?.focus();
	}
}
</script>

<svelte:window onkeydown={slash} />

<Combobox.Root type="single" bind:open bind:inputValue={q} onValueChange={pick} items={results.map((s) => ({ value: s.id, label: s.name }))}>
	<div class="field">
		<Combobox.Input bind:ref={input} oninput={(e) => {
			q = e.currentTarget.value;
			open = true;
		}} onfocus={() => (open = true)} class="search" placeholder="Add a species…  ( / )" aria-label="Search and add a species" />
	</div>
	<Combobox.Portal>
		<Combobox.Content class="results" sideOffset={6}>
			<Combobox.Viewport>
				{#each results as s (s.id)}
					<Combobox.Item value={s.id} label={s.name} class="result">
						<span class="dot" style:background={s.color}></span>
						<span class="rn">{s.name}<small>{s.sci}</small></span>
						<span class="st">{status(s.id)}{globe.on.has(s.id) ? " · on" : ""}</span>
					</Combobox.Item>
				{:else}
					<span class="none">{q.trim() ? "No species match." : "Type a name, scientific name or family."}</span>
				{/each}
			</Combobox.Viewport>
		</Combobox.Content>
	</Combobox.Portal>
</Combobox.Root>

<style>
	.field { margin-bottom: var(--s3); }
	:global(.search) { width: 100%; background: var(--bg); color: var(--text); border: 1px solid var(--line); border-radius: 10px; padding: 9px 12px; font: inherit; }
	:global(.results) { z-index: 60; width: var(--bits-combobox-anchor-width, 280px); max-height: 340px; overflow: auto; background: var(--surface); border: 1px solid var(--line); border-radius: 10px; padding: 4px; box-shadow: 0 10px 30px #000a; }
	:global(.result) { display: flex; align-items: center; gap: var(--s2); padding: 7px 8px; border-radius: 8px; cursor: pointer; }
	:global(.result[data-highlighted]) { background: var(--surface-2); }
	.rn { display: grid; flex: 1; line-height: 1.2; }
	.st { font: 0.6rem var(--mono); color: var(--muted); text-transform: uppercase; white-space: nowrap; }
	.rn { min-width: 0; }
	.rn small { color: var(--muted); font-style: italic; font-size: 0.7rem; }
	.none { display: block; padding: 10px; color: var(--muted); font-size: 0.85rem; }
</style>
