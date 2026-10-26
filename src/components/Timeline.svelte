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
	spring: "var(--violet)",
	autumn: "var(--rose)",
	breeding: "#3f3f46",
	wintering: "#27272a",
};

// lanes: the focused species, or every shown species when expanded
const lanes = $derived(
	globe.expanded
		? globe.shown
		: globe.shown.filter((s) => s.id === globe.focus),
);

let width = $state(600);
const H = $derived(globe.expanded ? 40 + lanes.length * 14 : 56);
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
		.range([46, 6]);
	return (
		area<{ d: number; n: number }>()
			.x((a) => x(a.d))
			.y0(46)
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
		<span class="mono">{formatDay(globe.day)}</span>
		<button type="button" onclick={() => (globe.day = today)}>Today</button>
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
		<path d={curve} fill="var(--violet)" opacity="0.35" />
		{#each MSTART as m, i}
			<line x1={x(m)} x2={x(m)} y1="0" y2="48" stroke="var(--line)" />
			<text x={x(m) + 3} y="58" class="m">{MONTHS[i]?.slice(0, 3)}</text>
		{/each}
		{#each lanes as s, i (s.id)}
			<g transform="translate(0 {66 + i * 14})">
				{#each segments(s.id) as seg}
					<rect x={x(seg.from)} width={Math.max(0, x(seg.to) - x(seg.from))} height="9" rx="2" fill={PHASE_COLOR[seg.phase]} />
				{/each}
				<text x="4" y="8" class="lane" role="button" tabindex="0" onclick={() => (globe.focus = s.id)} onkeydown={(e) => (e.key === "Enter" || e.key === " ") && (globe.focus = s.id)}>{s.name}</text>
			</g>
		{/each}
		<line x1={x(today)} x2={x(today)} y1="0" y2={H} stroke="var(--muted)" stroke-dasharray="2 3" />
		<line x1={x(globe.day)} x2={x(globe.day)} y1="0" y2={H} stroke="var(--text)" stroke-width="2" />
	</svg>
</div>
</div>

<style>
	.tl { width: 100%; min-width: 0; }
	.scroll { max-height: 38vh; overflow: hidden auto; }
	.head { display: flex; gap: var(--s3); align-items: center; margin-bottom: var(--s2); }
	.head .mono { margin-right: auto; }
	button { background: var(--surface-2); color: var(--text); border: 1px solid var(--line); border-radius: 99px; padding: 2px 12px; font: inherit; font-size: 0.8rem; cursor: pointer; }
	svg { display: block; touch-action: none; cursor: ew-resize; overflow: visible; }
	.m { font: 9px var(--mono); fill: var(--muted); }
	.lane { font: 10px var(--font); fill: var(--text); pointer-events: all; cursor: pointer; paint-order: stroke; stroke: #09090b; stroke-width: 3px; }
</style>
