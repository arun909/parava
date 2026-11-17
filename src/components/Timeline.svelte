<script lang="ts">
import { max } from "d3-array";
import { scaleLinear } from "d3-scale";
import { area, curveBasis } from "d3-shape";
import type { GlobeState } from "@/lib/globe/state.svelte";
import {
	dayOfYear,
	formatDay,
	isMoving,
	MONTHS,
	MSTART,
	type Phase,
	popState,
	speciesState,
} from "@/lib/model";

let { globe }: { globe: GlobeState } = $props();

const STEP = 3;
const days = Array.from(
	{ length: Math.ceil(365 / STEP) },
	(_, i) => 1 + i * STEP,
);
const today = dayOfYear();
const PHASE_COLOR: Record<Phase, string> = {
	spring: "var(--spring)",
	autumn: "var(--autumn)",
	breeding: "#d6d4c4",
	wintering: "#e8e6da",
};

// lanes: the focused species, or every shown species when expanded
const lanes = $derived(
	globe.expanded
		? globe.shown
		: globe.shown.filter((s) => s.id === globe.focus),
);

let width = $state(600);
// one species focused: its own lane replaces the activity curve; otherwise the curve, or every lane when expanded
const solo = $derived(!!globe.focus && !globe.expanded);
const H = $derived(globe.expanded ? 22 + lanes.length * 16 : solo ? 38 : 50);
const x = $derived(scaleLinear().domain([1, 365]).range([0, width]));

// how many shown species have a population in flight, per sampled day
const activity = $derived(
	days.map((d) => ({
		d,
		n: globe.shown.filter((s) => s.pops.some((p) => isMoving(popState(p, d))))
			.length,
	})),
);
const curve = $derived.by(() => {
	const y = scaleLinear()
		.domain([0, max(activity, (a) => a.n) || 1])
		.range([48, 20]);
	return (
		area<{ d: number; n: number }>()
			.x((a) => x(a.d))
			.y0(48)
			.y1((a) => y(a.n))
			.curve(curveBasis)(activity) ?? ""
	);
});

function segments(id: string) {
	const s = globe.shown.find((v) => v.id === id);
	if (!s) return [];
	const out: { from: number; to: number; phase: Phase }[] = [];
	for (const d of days) {
		const phase = speciesState(s, d).phase;
		const last = out.at(-1);
		if (last && last.phase === phase) last.to = d + STEP;
		else out.push({ from: d, to: d + STEP, phase });
	}
	return out;
}

function scrub(e: PointerEvent) {
	const svg = (e.currentTarget as SVGElement).getBoundingClientRect();
	globe.day = Math.max(
		1,
		Math.min(365, Math.round(x.invert(e.clientX - svg.left))),
	);
}
function down(e: PointerEvent) {
	(e.currentTarget as SVGElement).setPointerCapture(e.pointerId);
	scrub(e);
}
function key(e: KeyboardEvent) {
	const k = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
	if (k)
		globe.day = Math.max(
			1,
			Math.min(365, globe.day + k * (e.shiftKey ? 7 : 1)),
		);
}
</script>

<div class="tl" bind:clientWidth={width}>
	<div class="head">
		<span class="date">{formatDay(globe.day)}</span>
		<button type="button" onclick={() => (globe.day = today)} disabled={Math.round(globe.day) === Math.round(today)}>Today</button>
		<button type="button" onclick={() => (globe.expanded = !globe.expanded)} aria-expanded={globe.expanded}>
			{globe.expanded ? "Fewer" : "All species"}
		</button>
	</div>
	<div class="scroll">
<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
	<svg
		{width}
		height={H}
		role="slider"
		tabindex="0"
		aria-label="Day of year"
		aria-valuemin="1"
		aria-valuemax="365"
		aria-valuenow={globe.day}
		aria-valuetext={formatDay(globe.day)}
		onpointerdown={down}
		onpointermove={(e) => e.buttons && scrub(e)}
		onkeydown={key}
	>
		{#each MSTART as m, i}
			<line x1={x(m)} x2={x(m)} y1="12" y2={H} stroke="var(--line)" />
			<text x={x(m) + 3} y="9" class="m">{MONTHS[i]?.slice(0, 3)}</text>
		{/each}
		{#if !solo && !globe.expanded}<path d={curve} fill="var(--spring)" opacity="0.4" />{/if}
		{#each lanes as s, i (s.id)}
			<g transform="translate(0 {18 + i * 16})">
				{#each segments(s.id) as seg}
					<rect x={x(seg.from)} width={Math.max(0, x(seg.to) - x(seg.from))} height={solo ? 14 : 10} rx="3" fill={PHASE_COLOR[seg.phase]} />
				{/each}
				{#if !solo}<text x="4" y="9" class="lane" role="button" tabindex="0" onclick={() => globe.open(s.id, false)} onkeydown={(e) => (e.key === "Enter" || e.key === " ") && globe.open(s.id, false)}>{s.name}</text>{/if}
			</g>
		{/each}
		<line x1={x(today)} x2={x(today)} y1="12" y2={H} stroke="var(--muted)" stroke-dasharray="2 3" />
		<line x1={x(globe.day)} x2={x(globe.day)} y1="12" y2={H} stroke="var(--text)" stroke-width="2" />
	</svg>
</div>
</div>

<style>
	.tl { width: 100%; min-width: 0; }
	.scroll { max-height: 38vh; overflow: hidden auto; }
	.head { display: flex; gap: var(--s3); align-items: center; margin-bottom: var(--s2); }
	.head .date { margin-right: auto; font-weight: 600; }
	button { background: none; color: var(--muted); border: 0; padding: 2px 4px; font: inherit; font-size: 0.8rem; cursor: pointer; }
	button:hover:not(:disabled) { color: var(--text); }
	button:disabled { opacity: 0.4; cursor: default; }
	svg { display: block; touch-action: none; cursor: ew-resize; overflow: visible; }
	.m { font: 9px var(--font); fill: var(--muted); }
	.lane { font: 10px var(--font); fill: var(--text); pointer-events: all; cursor: pointer; paint-order: stroke; stroke: var(--surface); stroke-width: 3px; }
</style>
