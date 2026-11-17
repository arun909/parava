<script lang="ts">
import { DropdownMenu } from "bits-ui";
import { presets } from "@/lib/globe/presets";
import type { GlobeState } from "@/lib/globe/state.svelte";
import { dayOfYear, PREPARED } from "@/lib/model";

let { globe }: { globe: GlobeState } = $props();

const groups = presets(PREPARED, dayOfYear());
</script>

<!-- one-tap sets of species: picking one replaces what is on the map, and "undo" brings it back -->
<DropdownMenu.Root>
	<DropdownMenu.Trigger class="pill-menu-trigger" aria-label="Quick groups: replace the species on the map">
		<svg width="13" height="13" viewBox="0 0 16 16" aria-hidden="true"><path d="M2 4h12M4 8h8M6.5 12h3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" /></svg>
		Quick groups <span aria-hidden="true">▾</span>
	</DropdownMenu.Trigger>
	<DropdownMenu.Portal>
		<DropdownMenu.Content class="pill-menu" align="end" sideOffset={6}>
			{#each groups as g (g.id)}
				<DropdownMenu.Item class="pill-menu-item" onSelect={() => globe.setOn(g.ids)}>
					{g.label} <span class="mono">{g.ids.length}</span>
				</DropdownMenu.Item>
			{/each}
		</DropdownMenu.Content>
	</DropdownMenu.Portal>
</DropdownMenu.Root>

