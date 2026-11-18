<script lang="ts" module>
export interface CalSpecies {
	id: string;
	name: string;
	color: string;
	/** Hand-modelled rather than estimated. */
	hand: boolean;
}

/** [index into species, day of year, timetable slot 0..3, flyway name]. */
export type CalEvent = [number, number, number, string];
</script>

<script lang="ts">
import { onMount, tick } from "svelte";

let {
	species,
	events,
	built,
}: { species: CalSpecies[]; events: CalEvent[]; built: number } = $props();

const WINDOW = 30;
const MAX_DOTS = 4;
// the same order as a population's `dep` timetable; odd slots are arrivals
const WHAT = [
	"Leaves wintering grounds",
	"Reaches breeding grounds",
	"Leaves breeding grounds",
	"Reaches wintering grounds",
];

const midnight = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const diff = (a: Date, b: Date) => Math.round((a.getTime() - b.getTime()) / 864e5);
// whole day of year, 1 on 1 January; 31 December of a leap year shares day 365 with the timetables
const doy = (d: Date) => Math.min(365, diff(d, new Date(d.getFullYear(), 0, 0)));
const sameDay = (a: Date, b: Date) => a.getTime() === b.getTime();

// the build date until the browser takes over, so the page never shows a stale "today"
let today = $state(midnight(new Date(new Date().getFullYear(), 0, built)));
let selected = $state(midnight(new Date(new Date().getFullYear(), 0, built)));
// first of the month on show
let month = $state(new Date(new Date().getFullYear(), 0, built));
let grid: HTMLDivElement | undefined = $state();

onMount(() => {
	today = midnight(new Date());
	selected = today;
	month = new Date(today.getFullYear(), today.getMonth(), 1);
});

const byDay = $derived.by(() => {
	const m = new Map<number, CalEvent[]>();
	for (const e of events) {
		const list = m.get(e[1]) ?? [];
		list.push(e);
		m.set(e[1], list);
	}
	// hand-modelled flyways first, then by name
	for (const list of m.values())
		list.sort((a, b) => Number(species[b[0]]!.hand) - Number(species[a[0]]!.hand) || species[a[0]]!.name.localeCompare(species[b[0]]!.name));
	return m;
});
const eventsOn = (d: Date) => byDay.get(doy(d)) ?? [];

// the months that the next 30 days touch; navigation stays inside them
const first = $derived(new Date(today.getFullYear(), today.getMonth(), 1));
const lastDay = $derived(addDays(today, WINDOW - 1));
const last = $derived(new Date(lastDay.getFullYear(), lastDay.getMonth(), 1));
const view = $derived(new Date(month.getFullYear(), month.getMonth(), 1));

// six rows of weeks, Sunday first, padded with the neighbouring months
const cells = $derived.by(() => {
	const start = addDays(view, -view.getDay());
	const weeks = Math.ceil((view.getDay() + new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate()) / 7);
	return Array.from({ length: weeks * 7 }, (_, i) => {
		const date = addDays(start, i);
		const ev = eventsOn(date);
		const ahead = diff(date, today);
		return {
			date,
			ev,
			outside: date.getMonth() !== view.getMonth(),
			soon: ahead >= 0 && ahead < WINDOW,
		};
	});
});
const weekdays = Array.from({ length: 7 }, (_, i) =>
	new Date(2023, 0, 1 + i).toLocaleDateString(undefined, { weekday: "short" }),
);

const picked = $derived(eventsOn(selected));
const arrivals = $derived(picked.filter((e) => e[2] % 2).length);

const fmt = (d: Date, o: Intl.DateTimeFormatOptions) => d.toLocaleDateString(undefined, o);
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
function when(d: Date) {
	const n = diff(d, today);
	if (n === 0) return "Today";
	if (n === 1) return "Tomorrow";
	if (n === -1) return "Yesterday";
	return n > 0 ? `In ${n} days` : `${-n} days ago`;
}
function counts(ev: CalEvent[]) {
	if (!ev.length) return "No flights expected";
	const a = ev.filter((e) => e[2] % 2).length;
	return [a && plural(a, "arrival"), ev.length - a && plural(ev.length - a, "departure")].filter(Boolean).join(", ");
}

function go(dir: number) {
	month = new Date(view.getFullYear(), view.getMonth() + dir, 1);
}

async function select(d: Date, focus = false) {
	selected = d;
	if (d.getMonth() !== view.getMonth() || d.getFullYear() !== view.getFullYear()) month = new Date(d.getFullYear(), d.getMonth(), 1);
	if (!focus) return;
	await tick();
	grid?.querySelector<HTMLButtonElement>("[tabindex='0']")?.focus();
}

function key(e: KeyboardEvent, d: Date) {
	const step = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 7, ArrowUp: -7 }[e.key];
	if (step === undefined) return;
	e.preventDefault();
	const to = addDays(d, step);
	// keep keyboard moves inside the months that can be shown
	if (to < first || to >= new Date(last.getFullYear(), last.getMonth() + 1, 1)) return;
	select(to, true);
}
</script>

<div class="cal">
	<div class="month card">
		<div class="head">
			<h3>{fmt(view, { month: "long", year: "numeric" })}</h3>
			<span class="nav">
				<button type="button" aria-label="Previous month" disabled={view <= first} onclick={() => go(-1)}>‹</button>
				<button type="button" aria-label="Next month" disabled={view >= last} onclick={() => go(1)}>›</button>
			</span>
		</div>

		<div class="days" role="grid" aria-label={fmt(view, { month: "long", year: "numeric" })} bind:this={grid}>
			<div class="row" role="row">
				{#each weekdays as w}<span class="wd" role="columnheader">{w}</span>{/each}
			</div>
			{#each Array.from({ length: cells.length / 7 }, (_, r) => cells.slice(r * 7, r * 7 + 7)) as week}
				<div class="row" role="row">
					{#each week as c (c.date.getTime())}
						<button
							type="button"
							role="gridcell"
							class:outside={c.outside}
							class:soon={c.soon}
							class:today={sameDay(c.date, today)}
							class:on={sameDay(c.date, selected)}
							aria-selected={sameDay(c.date, selected)}
							aria-label={`${fmt(c.date, { weekday: "long", day: "numeric", month: "long" })}${sameDay(c.date, today) ? " (today)" : ""}: ${counts(c.ev)}`}
							tabindex={sameDay(c.date, selected) ? 0 : -1}
							onclick={() => select(c.date)}
							onkeydown={(e) => key(e, c.date)}
						>
							<span class="n">{c.date.getDate()}</span>
							<!-- the dots, then the overflow count beside them on the same line (never on a line of its own) -->
							<span class="dots" aria-hidden="true">
								<span class="dgrid">
									{#each c.ev.slice(0, MAX_DOTS) as e}
										<i class="dot" class:ring={e[2] % 2 === 0} style={`--c:${species[e[0]]!.color}`}></i>
									{/each}
								</span>
								{#if c.ev.length > MAX_DOTS}<span class="more">+{c.ev.length - MAX_DOTS}</span>{/if}
							</span>
						</button>
					{/each}
				</div>
			{/each}
		</div>

		<p class="legend">
			<span><i class="dot"></i> Arrives</span>
			<span><i class="dot ring"></i> Leaves</span>
			<span><i class="key"></i> Next 30 days</span>
		</p>
	</div>

	<!-- the panel takes the calendar's height and scrolls inside it -->
	<section class="day card" aria-live="polite" aria-label="Birds on the selected day">
		<div class="scroll">
			<header>
				<h3>{fmt(selected, { weekday: "long", day: "numeric", month: "long" })}</h3>
				<p class="meta">
					<span class="when">{when(selected)}</span>
					<span><i class="dot"></i> {plural(arrivals, "arrival")}</span>
					<span><i class="dot ring"></i> {plural(picked.length - arrivals, "departure")}</span>
				</p>
			</header>
			{#if picked.length}
				<ul class="events">
					{#each picked as [si, , k, pop]}
						{@const s = species[si]!}
						<li>
							<i class="dot" class:ring={k % 2 === 0} style={`--c:${s.color}`}></i>
							<div>
								<a href={`/species/${s.id}/`}>{s.name}</a>
								<small>{WHAT[k]} · {s.hand ? pop : "Estimated route"}</small>
							</div>
						</li>
					{/each}
				</ul>
			{:else}
				<p class="none">The model has no departures or arrivals on this day. Pick a day with dots.</p>
			{/if}
		</div>
	</section>
</div>

<style>
	/* two cards side by side: the month, and the birds of the picked day */
	.cal { display: grid; grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr); gap: var(--s5); }
	.month { padding: var(--s5); }

	.head { display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--s3); }
	.head h3 { margin: 0; font-size: 1.15rem; }
	.nav { display: flex; gap: var(--s1); }
	.nav button { width: 32px; height: 32px; border: 1px solid var(--line); border-radius: 50%; background: var(--surface); color: var(--text); font-size: 1.1rem; line-height: 1; cursor: pointer; }
	.nav button:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); }
	.nav button:disabled { opacity: 0.35; cursor: default; }

	.days { display: grid; gap: 4px; }
	.row { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 4px; }
	.wd { padding-bottom: 2px; color: var(--muted); font-size: 0.72rem; text-align: center; text-transform: uppercase; letter-spacing: 0.06em; }

	.days button { display: grid; justify-items: center; align-content: start; gap: 3px; height: 64px; padding: 6px 2px; border: 1px solid transparent; border-radius: 10px; background: var(--surface-2); color: var(--muted); font: inherit; cursor: pointer; transition: border-color 0.15s, background 0.15s; }
	/* the next 30 days stand out from the rest of the month */
	.days button.soon { background: var(--surface); border-color: var(--line); color: var(--text); }
	.days button.outside { opacity: 0.4; }
	.days button:hover { border-color: var(--accent); }
	.days button.today { border: 2px solid var(--accent); }
	.days button.today .n { color: var(--accent); }
	.days button.on { background: color-mix(in srgb, var(--accent) 16%, var(--surface)); border-color: var(--accent); box-shadow: 0 6px 14px -8px rgb(33 51 40 / 0.45); }
	.n { font-family: var(--font-num); font-size: 1.05rem; font-weight: 600; line-height: 1.1; font-variant-numeric: lining-nums tabular-nums; }
	.dots { display: flex; justify-content: center; align-items: center; gap: 3px; max-width: 100%; }
	.dgrid { display: flex; flex-wrap: wrap; justify-content: center; gap: 3px; min-width: 0; }
	.more { flex: none; color: var(--muted); font: 600 0.62rem / 1 var(--font-num); font-variant-numeric: tabular-nums; }

	/* filled: arriving; ring: leaving */
	.dot { display: inline-block; flex: none; width: 10px; height: 10px; border-radius: 50%; background: var(--c); }
	.dot.ring { background: transparent; box-shadow: inset 0 0 0 2px var(--c); }

	.legend { display: flex; flex-wrap: wrap; gap: var(--s4); margin: var(--s3) 0 0; color: var(--muted); font-size: 0.8rem; }
	.legend span { display: inline-flex; align-items: center; gap: 6px; }
	.legend .dot { --c: var(--accent); width: 11px; height: 11px; }
	.key { width: 14px; height: 10px; border: 1px solid var(--line); border-radius: 3px; background: var(--surface); }

	/* the row is as tall as the calendar; the list scrolls inside it */
	.day { position: relative; min-height: 320px; padding: 0; overflow: hidden; }
	.scroll { position: absolute; inset: 0; overflow-y: auto; overscroll-behavior: contain; scrollbar-width: thin; }
	/* the date centred on a faint leaf wash, which fades into the list below instead of a hard rule */
	.day header { position: sticky; top: 0; z-index: 1; padding: var(--s5) var(--s5) var(--s4); text-align: center; background: linear-gradient(180deg, color-mix(in srgb, var(--accent) 9%, var(--surface)), var(--surface)); }
	.day header::after { content: ""; position: absolute; inset: 100% 0 auto; height: 12px; background: linear-gradient(180deg, rgb(33 51 40 / 0.06), transparent); pointer-events: none; }
	.day h3 { margin: 0; font-size: 1.1rem; }
	/* when, arrivals and departures in one row, split by short rules */
	.meta { display: flex; flex-wrap: wrap; justify-content: center; align-items: center; margin: 6px 0 0; color: var(--muted); font-size: 0.85rem; }
	.meta span { display: inline-flex; align-items: center; gap: 6px; padding: 0 var(--s3); }
	.meta span + span { border-left: 1px solid var(--line); }
	.meta .dot { --c: var(--accent); width: 11px; height: 11px; }
	.when { color: var(--accent); font-weight: 600; }
	.none { margin: 0; padding: var(--s4) var(--s5); color: var(--muted); font-size: 0.9rem; }
	.events { margin: 0; padding: 0 0 var(--s2); list-style: none; }
	/* zebra rows, edge to edge, in place of dividers */
	.events li { display: flex; align-items: center; gap: var(--s3); padding: 10px var(--s5); transition: background 0.15s; }
	.events li:nth-child(even) { background: var(--surface-2); }
	.events li:hover { background: color-mix(in srgb, var(--accent) 10%, var(--surface)); }
	.events .dot { width: 14px; height: 14px; }
	.events .dot.ring { box-shadow: inset 0 0 0 2.5px var(--c); }
	.events div { flex: 1; min-width: 0; }
	.events a { color: var(--text); font-weight: 600; text-decoration: none; }
	.events a:hover { color: var(--link); }
	.events small { display: block; color: var(--muted); font-size: 0.85rem; }

	@media (max-width: 820px) {
		.cal { grid-template-columns: minmax(0, 1fr); }
		/* stacked: the panel gets a fixed height of its own */
		.day { height: 360px; }
	}
	@media (max-width: 560px) {
		.month { padding: var(--s4); }
		.days button { height: 54px; padding: 5px 1px; border-radius: 8px; }
		.dots .dot { width: 7px; height: 7px; }
		/* phones: the dots as a 2×2 block, the count beside it */
		.dgrid { display: grid; grid-template-columns: repeat(2, 7px); gap: 2px; }
		.more { font-size: 0.58rem; letter-spacing: -0.02em; }
		.dots .dot.ring { box-shadow: inset 0 0 0 1.5px var(--c); }
		.dots { gap: 2px; }
		.wd { font-size: 0.64rem; letter-spacing: 0; }
	}
</style>
