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

/** `compact`: the phone's slimmer card, with a shorter activity curve. */
let { globe, compact = false }: { globe: GlobeState; compact?: boolean } =
	$props();

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
const expanded = $derived(globe.expanded && !compact);
const lanes = $derived(
	expanded
		? globe.shown
		: globe.shown.filter((s) => s.id === globe.focus),
);

let width = $state(600);
// one species focused: its own lane replaces the activity curve; otherwise the curve, or every lane when expanded
const solo = $derived(!!globe.focus && !expanded);
const H = $derived(
	expanded ? 22 + lanes.length * 16 : solo ? 38 : compact ? 34 : 50,
);
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
		.range([H - 2, compact ? 14 : 20]);
	return (
		area<{ d: number; n: number }>()
			.x((a) => x(a.d))
			.y0(H - 2)
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
// a hint that the strip can be dragged, until the reader first does (remembered in this browser)
const HINT_KEY = "parava-timeline-dragged";
let dragged = $state(true);
try {
	dragged = localStorage.getItem(HINT_KEY) === "1";
} catch {}
function used() {
	if (dragged) return;
	dragged = true;
	try {
		localStorage.setItem(HINT_KEY, "1");
	} catch {}
}
function down(e: PointerEvent) {
	used();
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
	<div class="head" class:compact>
		<span class="date">{formatDay(globe.day)}</span>
		{#if !dragged}<span class="drag-hint" aria-hidden="true"><svg width="14" height="10" viewBox="0 0 14 10"><path d="M4 1 1 5l3 4M10 1l3 4-3 4M1 5h12" /></svg>Drag to change the date</span>{/if}
		<button type="button" onclick={() => (globe.day = today)} disabled={Math.round(globe.day) === Math.round(today)}>Today</button>
		<!-- the every-species lanes need room, so phones (the compact card) leave them out -->
		{#if !compact}
			<button type="button" onclick={() => (globe.expanded = !globe.expanded)} aria-expanded={globe.expanded}>
				{globe.expanded ? "Fewer" : "All species"}
			</button>
		{/if}
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
		{#if !solo && !expanded}<path d={curve} fill="var(--spring)" opacity="0.4" />{/if}
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
		<!-- a round grip on the day line, so the strip reads as something to drag; it nudges side to side until first used -->
		<g class="knob" class:nudge={!dragged} transform="translate({x(globe.day)} {Math.min(H - 9, 12 + (H - 12) / 2)})" aria-hidden="true">
			<g class="knob-in">
				<circle r="9" />
				<path d="M-3 -3.5v7M0 -3.5v7M3 -3.5v7" />
			</g>
		</g>
	</svg>
</div>
</div>

<style>
	.tl { width: 100%; min-width: 0; }
	.scroll { max-height: 38vh; overflow: hidden auto; }
	.head { display: flex; gap: var(--s3); align-items: center; margin-bottom: var(--s2); }
	.head.compact { margin-bottom: 2px; }
	.head .date { margin-right: auto; font-weight: 600; }
	button { background: none; color: var(--muted); border: 0; padding: 2px 4px; font: inherit; font-size: 0.8rem; cursor: pointer; }
	button:hover:not(:disabled) { color: var(--text); }
	button:disabled { opacity: 0.4; cursor: default; }
	svg { display: block; touch-action: none; cursor: ew-resize; overflow: visible; }
	.knob circle { fill: var(--accent-strong); stroke: var(--surface); stroke-width: 2.5; filter: drop-shadow(0 1px 2px rgb(33 51 40 / 0.35)); }
	.knob path { stroke: #fff; stroke-width: 1.3; stroke-linecap: round; }
	.knob.nudge .knob-in { animation: nudge 1.8s ease-in-out infinite; }
	@keyframes nudge { 0%, 60%, 100% { transform: translateX(0); } 20% { transform: translateX(-5px); } 40% { transform: translateX(5px); } }
	.drag-hint { display: inline-flex; align-items: center; gap: 5px; padding: 2px 8px; border-radius: 99px; background: color-mix(in srgb, var(--accent) 14%, transparent); color: var(--accent-strong); font-size: 0.72rem; font-weight: 600; white-space: nowrap; }
	.drag-hint svg { fill: none; stroke: currentColor; stroke-width: 1.5; stroke-linecap: round; stroke-linejoin: round; }
	.m { font: 9px var(--font); fill: var(--muted); }
	.lane { font: 10px var(--font); fill: var(--text); pointer-events: all; cursor: pointer; paint-order: stroke; stroke: var(--surface); stroke-width: 3px; }
</style>
