<script lang="ts">
import { Dialog } from "bits-ui";
import type { Sighting } from "@/lib/model";

/** Sighting photos, viewed here on the site; each links out to the report it came from. */
let {
	photos,
	name,
	open = $bindable(false),
	index = $bindable(0),
}: {
	photos: Sighting[];
	name: string;
	open?: boolean;
	index?: number;
} = $props();

const p = $derived(photos[index]);
// iNaturalist serves the same photo larger under another name
const large = (url = "") => url.replace("/medium.", "/large.");
const when = (t: number) =>
	new Date(t).toLocaleDateString(undefined, {
		day: "numeric",
		month: "short",
		year: "numeric",
	});
/** The large copy of the photo shown has arrived; until then the small one stands in. */
let sharp = $state(false);
$effect.pre(() => {
	void index;
	sharp = false;
});
const step = (d: number) =>
	(index = (index + d + photos.length) % photos.length);
</script>

<Dialog.Root bind:open>
	<Dialog.Portal>
		<Dialog.Overlay class="pv-overlay" />
		<Dialog.Content class="pv" onkeydown={(e) => {
			if (photos.length > 1 && e.key === "ArrowRight") step(1);
			if (photos.length > 1 && e.key === "ArrowLeft") step(-1);
		}}>
			<Dialog.Title class="pv-title">{name}{#if photos.length > 1}<span>{index + 1} of {photos.length}</span>{/if}</Dialog.Title>
			<Dialog.Close class="pv-close" aria-label="Close photo">
				<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
			</Dialog.Close>

			{#if p}
				<div class="pv-stage">
					<!-- the small copy, already loaded for the card, holds the place while the large one arrives -->
					{#key p.img}
						{#if !sharp}<img class="low" src={p.img} alt="" aria-hidden="true" />{/if}
						<img class="full" src={large(p.img)} alt="{name}, {p.place || 'sighting'}" onload={() => (sharp = true)} />
					{/key}
					{#if photos.length > 1}
						<button type="button" class="pv-nav prev" aria-label="Previous photo" onclick={() => step(-1)}>
							<svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg>
						</button>
						<button type="button" class="pv-nav next" aria-label="Next photo" onclick={() => step(1)}>
							<svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6" /></svg>
						</button>
					{/if}
				</div>
				<Dialog.Description class="pv-foot">
					<span class="pv-meta">
						<b>{p.place || "Unnamed place"}</b>
						<span>{when(p.t)}{#if p.attr}{" · "}{p.attr}{/if}</span>
					</span>
					{#if p.link}
						<a class="pv-out" href={p.link} target="_blank" rel="noreferrer">
							View on {p.src}
							<svg width="13" height="13" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 17 17 7M8 7h9v9" /></svg>
						</a>
					{/if}
				</Dialog.Description>
				{#if photos.length > 1}
					<div class="pv-thumbs" role="group" aria-label="All photos">
						{#each photos as t, i (t.img)}
							<button type="button" class:on={i === index} aria-label="Photo {i + 1}" aria-current={i === index} onclick={() => (index = i)}>
								<img src={t.img} alt="" loading="lazy" />
							</button>
						{/each}
					</div>
				{/if}
			{/if}
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>

<style>
	:global(.pv-overlay) { position: fixed; inset: 0; z-index: 70; background: rgb(20 30 24 / 0.6); backdrop-filter: blur(6px); }
	:global(.pv) { position: fixed; z-index: 71; left: 50%; top: 50%; transform: translate(-50%, -50%); display: grid; gap: var(--s3); width: min(880px, calc(100vw - 32px)); max-height: calc(100vh - 32px); padding: var(--s4) var(--s4) var(--s4); background: var(--surface); border-radius: 16px; box-shadow: 0 20px 60px rgb(0 0 0 / 0.3); font-family: var(--font); }
	:global(.pv-title) { display: flex; align-items: baseline; gap: var(--s3); margin: 0; padding-right: 40px; font-size: 1.05rem; font-weight: 600; }
	:global(.pv-title span) { color: var(--muted); font-size: 0.8rem; font-weight: 400; }
	:global(.pv-close) { position: absolute; top: 10px; right: 10px; display: grid; place-items: center; width: 34px; height: 34px; border: 0; border-radius: 8px; background: none; color: var(--muted); cursor: pointer; }
	:global(.pv-close:hover) { color: var(--text); background: var(--surface-2); }
	:global(.pv svg) { fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
	.pv-stage { position: relative; display: grid; height: min(60vh, 540px); background: var(--surface-2); border-radius: 10px; overflow: hidden; }
	.pv-stage img { grid-area: 1 / 1; display: block; width: 100%; height: 100%; object-fit: contain; }
	.pv-stage .low { filter: blur(2px); }
	.pv-nav { position: absolute; top: 50%; transform: translateY(-50%); display: grid; place-items: center; width: 40px; height: 40px; border: 0; border-radius: 50%; background: rgb(255 255 255 / 0.9); color: var(--text); box-shadow: var(--shadow); cursor: pointer; }
	.pv-nav:hover { background: #fff; }
	.prev { left: 12px; }
	.next { right: 12px; }
	:global(.pv-foot) { display: flex; align-items: center; justify-content: space-between; gap: var(--s4); margin: 0; }
	.pv-meta { display: grid; min-width: 0; font-size: 0.85rem; line-height: 1.4; }
	.pv-meta b { font-weight: 500; }
	.pv-meta span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--muted); font-size: 0.78rem; }
	.pv-out { flex: none; display: inline-flex; align-items: center; gap: 6px; padding: 8px 14px; border: 1px solid var(--line); border-radius: 8px; color: var(--text); font-size: 0.85rem; font-weight: 600; text-decoration: none; }
	.pv-out:hover { border-color: var(--accent); background: var(--surface-2); }
	.pv-thumbs { display: flex; gap: 6px; overflow-x: auto; padding-bottom: 2px; }
	.pv-thumbs button { flex: none; width: 56px; height: 42px; padding: 0; border: 2px solid transparent; border-radius: 6px; overflow: hidden; background: none; cursor: pointer; opacity: 0.7; }
	.pv-thumbs button.on { border-color: var(--accent-strong); opacity: 1; }
	.pv-thumbs button:hover { opacity: 1; }
	.pv-thumbs img { display: block; width: 100%; height: 100%; object-fit: cover; }
</style>
