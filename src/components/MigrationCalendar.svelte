<script lang="ts" module>
/** One species for the calendar; `legs` has a letter a month: n heading north, s south, b both, - neither. */
export interface YearSpecies {
	id: string;
	name: string;
	color: string;
	/** Hand-modelled rather than estimated. */
	hand: boolean;
	kind?: "winter" | "summer" | "passage";
	legs: string;
}
</script>

<script lang="ts">
import { Dialog, DropdownMenu } from "bits-ui";
import { onMount } from "svelte";
import type { CalEvent } from "./UpcomingCalendar.svelte";

let {
	species,
	events,
	built,
}: { species: YearSpecies[]; events: CalEvent[]; built: number } = $props();

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** Day of year of the day before each month starts (the model's 365-day year). */
const MSTART = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334, 365];
// the same order as a population's `dep` timetable; odd slots are arrivals
const WHAT = [
	"Leaves wintering grounds",
	"Reaches breeding grounds",
	"Leaves breeding grounds",
	"Reaches wintering grounds",
];
// short labels for the header; the title says it in full
const GROUPS = [
	["all", "All", "All birds"],
	["hand", "Hand-modelled", "Hand-modelled flyways"],
	["winter", "Winter", "Winter visitors to India"],
	["summer", "Summer", "Summer visitors to India"],
	["passage", "Passage", "Birds passing through India"],
] as const;
type Group = (typeof GROUPS)[number][0];
const SHOW = [
	["all", "All"],
	["in", "Arriving"],
	["out", "Leaving"],
] as const;

const monthOf = (d: number) => {
	let m = 0;
	while (m < 11 && d > MSTART[m + 1]!) m++;
	return m;
};
const year = new Date().getFullYear();
const dateOf = (d: number) => new Date(year, 0, d);
const fmt = (d: number, o: Intl.DateTimeFormatOptions) => dateOf(d).toLocaleDateString(undefined, o);

// the build date until the browser takes over, so the page never shows a stale "today"
let today = $state(built);
let month = $state(monthOf(built));
onMount(() => {
	const now = new Date();
	today = Math.min(365, Math.round((new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() - new Date(now.getFullYear(), 0, 0).getTime()) / 864e5));
	month = monthOf(today);
});
const thisMonth = $derived(monthOf(today));

let view = $state<"month" | "table">("month");
let group = $state<Group>("all");
let q = $state("");
let only = $state<"all" | "in" | "out">("all");
const keep = $derived.by(() => {
	const t = q.trim().toLowerCase();
	return species.map(
		(s) =>
			(group === "all" || (group === "hand" ? s.hand : s.kind === group)) &&
			(!t || s.name.toLowerCase().includes(t)),
	);
});
const shown = $derived(species.filter((_, i) => keep[i]));
/** How many birds each group holds, for the filter menu. */
const sizes = Object.fromEntries(
	GROUPS.map(([k]) => [k, species.filter((s) => k === "all" || (k === "hand" ? s.hand : s.kind === k)).length]),
) as Record<Group, number>;

// per month: species heading north, heading south, and on the move at all
const year12 = $derived(
	MONTHS.map((_, m) => {
		let n = 0;
		let s = 0;
		let any = 0;
		for (const sp of shown) {
			const l = sp.legs[m];
			if (l === "-") continue;
			any++;
			if (l !== "s") n++;
			if (l !== "n") s++;
		}
		return { n, s, any };
	}),
);
const peak = $derived(Math.max(1, ...year12.flatMap((c) => [c.n, c.s])));

const inMonth = $derived(
	events
		.filter((e) => keep[e[0]] && monthOf(e[1]) === month)
		.sort((a, b) => a[1] - b[1] || species[a[0]]!.name.localeCompare(species[b[0]]!.name)),
);
const arrivals = $derived(inMonth.filter((e) => e[2] % 2).length);
const listed = $derived(inMonth.filter((e) => only === "all" || (only === "in") === !!(e[2] % 2)));

// the month in weeks of seven days from the 1st; the last takes the remainder
const weeks = $derived.by(() => {
	const first = MSTART[month]! + 1;
	const last = MSTART[month + 1]!;
	const out: { from: number; to: number; label: string; ev: CalEvent[] }[] = [];
	for (let from = first; from <= last; from += 7) {
		const to = last - from < 10 ? last : from + 6;
		const ev = listed.filter((e) => e[1] >= from && e[1] <= to);
		const now = month === thisMonth && today >= from && today <= to;
		const past = month === thisMonth && today > to;
		const dates = `${fmt(from, { day: "numeric", month: "short" })} – ${fmt(to, { day: "numeric" })}`;
		out.push({ from, to, ev, label: now ? `This week · ${dates}` : past ? `Earlier · ${dates}` : dates });
		if (to === last) break;
	}
	return out;
});

/** A week's events gathered by day, so each day gets one date tile beside its birds. */
const byDay = (ev: CalEvent[]) => {
	const out: { day: number; ev: CalEvent[] }[] = [];
	for (const e of ev) {
		const last = out.at(-1);
		if (last && last.day === e[1]) last.ev.push(e);
		else out.push({ day: e[1], ev: [e] });
	}
	return out;
};

// this month opens on the current week, with the earlier weeks above it for a scroll back
let feedEl = $state<HTMLElement>();
$effect(() => {
	void listed;
	if (view !== "month" || month !== thisMonth || !feedEl) return;
	const cur = feedEl.querySelector<HTMLElement>(".week.current");
	feedEl.scrollTop = cur ? cur.offsetTop : 0;
});

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
const go = (d: number) => (month = (month + d + 12) % 12);
// phones scroll the timetable sideways: open it with this month in view, a month of context to its left
let sheetEl = $state<HTMLElement>();
$effect(() => {
	if (view !== "table" || !sheetEl) return;
	const col = sheetEl.querySelectorAll<HTMLElement>("thead th")[thisMonth + 1];
	const name = sheetEl.querySelector<HTMLElement>("thead .name");
	if (col && name && sheetEl.scrollWidth > sheetEl.clientWidth)
		sheetEl.scrollLeft = Math.max(0, col.offsetLeft - name.offsetWidth - col.offsetWidth);
});

/** Phones: the month grid opens in a pop-up from the calendar button by the month's name. */
let picker = $state(false);
const open = (m: number) => {
	month = m;
	view = "month";
	picker = false;
};
</script>

<!-- the twelve months with their counts: in the sidebar on wide screens, in the pop-up on phones -->
{#snippet grid()}
	<ol>
		{#each year12 as c, m}
			<li>
				<button
					type="button"
					class:on={view === "month" && m === month}
					class:now={m === thisMonth}
					aria-current={view === "month" && m === month ? "true" : undefined}
					aria-label="{MONTHS[m]}{m === thisMonth ? ' (this month)' : ''}: {c.any} species on the move, {c.n} heading north, {c.s} heading south"
					onclick={() => open(m)}
				>
					<span class="m">{MONTHS[m]}</span>
					<span class="spark" aria-hidden="true">
						<i class="n" style:width="{(c.n / peak) * 100}%"></i>
						<i class="s" style:width="{(c.s / peak) * 100}%"></i>
					</span>
					<strong>{c.any}</strong>
				</button>
			</li>
		{/each}
	</ol>
	<p class="legend">
		<span><i class="key n"></i>Heading north</span>
		<span><i class="key s"></i>Heading south</span>
	</p>
{/snippet}

<!-- the page's two views, in the header's free middle like the map's settings -->
<div class="tools" role="group" aria-label="View">
	<button type="button" class:on={view === "month"} aria-pressed={view === "month"} onclick={() => (view = "month")}>Month</button>
	<button type="button" class:on={view === "table"} aria-pressed={view === "table"} onclick={() => (view = "table")}>Timetable</button>
</div>

<!-- the whole window below the header, like the map: the months down the left, the view filling the rest -->
<div class="stage">
	<nav class="months side" aria-labelledby="months-h">
		<header>
			<h2 id="months-h">Species on the move</h2>
			<p class="hint">By month. Pick one for its arrivals and departures.</p>
		</header>
		{@render grid()}
	</nav>

	<section class="panel" aria-labelledby="panel-h" aria-live="polite">
		<!-- the panel's title in the middle; finding and filtering birds on the right -->
		<!-- one bar: what to show on the left, the month in the middle, finding and filtering on the right -->
		<header class="top">
			{#if view === "month"}
				<!-- the counts live on the switch itself, so the numbers and the choice are one control -->
				<div class="show" role="group" aria-label="Show">
					{#each SHOW as [k, label]}
						<button type="button" class:on={only === k} aria-pressed={only === k} onclick={() => (only = k)}>
							{#if k !== "all"}<i class="dot" class:ring={k === "out"} aria-hidden="true"></i>{/if}{label}
							<span class="n">{k === "all" ? inMonth.length : k === "in" ? arrivals : inMonth.length - arrivals}</span>
						</button>
					{/each}
				</div>
			{/if}
			<div class="title">
				{#if view === "month"}
					<button type="button" class="arrow" aria-label="Previous month" onclick={() => go(-1)}>‹</button>
					<div class="heading">
						<div class="name-row">
							<h2 id="panel-h">{new Date(year, month, 1).toLocaleDateString(undefined, { month: "long" })}</h2>
							<!-- phones: the months grid lives behind this button instead of above the list -->
							<button type="button" class="cal-btn" aria-label="Pick a month" title="Pick a month" aria-haspopup="dialog" onclick={() => (picker = true)}>
								<svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
									<!-- a page with a filled ink header, binder rings, a few days as dots and today in the brand's sun -->
									<rect class="page" x="3" y="4.5" width="18" height="16.5" rx="3.5" />
									<path class="band" d="M3 8a3.5 3.5 0 0 1 3.5-3.5h11A3.5 3.5 0 0 1 21 8v2H3z" />
									<path class="ring" d="M8 2.75v3.5M16 2.75v3.5" />
									<circle class="day" cx="8" cy="14" r="1.1" /><circle class="day" cx="12" cy="14" r="1.1" /><circle class="day" cx="8" cy="17.5" r="1.1" /><circle class="day" cx="12" cy="17.5" r="1.1" />
									<rect class="today" x="14.6" y="12.6" width="3.4" height="3.4" rx="1" />
								</svg>
							</button>
						</div>
						<span class="sub">{year12[month]!.any} species on the move</span>
					</div>
					<button type="button" class="arrow" aria-label="Next month" onclick={() => go(1)}>›</button>
				{:else}
					<div class="heading">
						<h2 id="panel-h">Full timetable</h2>
						<span class="sub">{shown.length} species through the year</span>
						<!-- phones: the month sidebar and its key are hidden, so the colours are explained here -->
						<p class="tt-key" aria-hidden="true">
							<span><i class="key n"></i>Heading north</span>
							<span><i class="key s"></i>Heading south</span>
						</p>
					</div>
				{/if}
			</div>
			<div class="actions">
				<label class="find">
					<svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
					<input type="search" placeholder="Find a bird" aria-label="Find a bird by name" bind:value={q} />
				</label>
				<DropdownMenu.Root>
					<DropdownMenu.Trigger class="filter-btn" aria-label="Filter birds: {GROUPS.find((g) => g[0] === group)![2]}">
						<svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 5h18l-7 8.5V19l-4 2v-7.5z" /></svg>
						{group === "all" ? "Filter" : GROUPS.find((g) => g[0] === group)![1]}
						{#if group !== "all"}<span class="badge" aria-hidden="true">1</span>{/if}
					</DropdownMenu.Trigger>
					<DropdownMenu.Portal>
						<DropdownMenu.Content class="pill-menu" align="end" sideOffset={6}>
							<DropdownMenu.RadioGroup bind:value={group}>
								{#each GROUPS as [k, , full]}
									<DropdownMenu.RadioItem class="pill-menu-item" value={k}>
										{#snippet children({ checked })}
											<span class="opt"><i class="tick" class:on={checked} aria-hidden="true"></i>{full}</span>
											<span class="mono">{sizes[k]}</span>
										{/snippet}
									</DropdownMenu.RadioItem>
								{/each}
							</DropdownMenu.RadioGroup>
						</DropdownMenu.Content>
					</DropdownMenu.Portal>
				</DropdownMenu.Root>
			</div>
		</header>

		{#if view === "month"}
			<!-- only this part scrolls: every arrival and departure in date order, week by week -->
			<div class="feed" bind:this={feedEl}>
				{#if listed.length}
					{#each weeks as w (w.from)}
						{#if w.ev.length}
							<section class="week" class:past={w.label.startsWith("Earlier")} class:current={w.label.startsWith("This week")} aria-label={w.label}>
								<h3>{w.label}<span>{plural(w.ev.length, "event")}</span></h3>
								{#each byDay(w.ev) as d (d.day)}
									<!-- one day: a small date tile that stays in view while its birds scroll past, then the birds -->
									<div class="day" class:today={month === thisMonth && d.day === today}>
										<time class="tile-date" datetime={dateOf(d.day).toISOString().slice(0, 10)}>
											<small>{fmt(d.day, { weekday: "short" })}</small>
											<b>{fmt(d.day, { day: "numeric" })}</b>
										</time>
								<ol class="agenda">
									{#each d.ev as [si, , k, pop]}
										{@const s = species[si]!}
										<!-- the marker says arriving (filled) or leaving (ring), not which species -->
										<li>
											<i class="dot" class:ring={k % 2 === 0} style:--c="var(--accent-strong)"></i>
											<a href="/species/{s.id}/">{s.name}</a>
											<!-- narrow screens fold the population into this line, so a bird listed twice says which flock each is -->
											<span class="what">{WHAT[k]}{#if s.hand}<span class="pop-inline">&nbsp;· {pop}</span>{/if}</span>
											<span class="pop">{s.hand ? pop : "Estimated route"}</span>
										</li>
									{/each}
								</ol>
									</div>
								{/each}
							</section>
						{/if}
					{/each}
				{:else}
					<p class="none">No {only === "in" ? "arrivals" : only === "out" ? "departures" : "arrivals or departures"} expected this month{q || group !== "all" ? " for these birds" : ""}.</p>
				{/if}
			</div>
		{:else}
			<!-- positioned, so the cells' hidden labels are clipped by it instead of widening the page -->
			<div class="feed sheet" bind:this={sheetEl}>
				<table>
					<thead>
						<tr>
							<th scope="col" class="name">Bird</th>
							{#each MONTHS as m, i}
								<th scope="col" class:now={i === thisMonth}><button type="button" aria-label="Open {m}" onclick={() => open(i)}>{m[0]}<span>{m.slice(1)}</span></button></th>
							{/each}
						</tr>
					</thead>
					<tbody>
						{#each shown as s (s.id)}
							<tr>
								<th scope="row" class="name"><div class="who"><span class="dot" style:background={s.color}></span><a href="/species/{s.id}/">{s.name}</a></div></th>
								{#each s.legs as l, i}
									<td class={l} class:now={i === thisMonth} class:jl={l !== "-" && i > 0 && s.legs[i - 1] !== "-"} class:jr={l !== "-" && i < 11 && s.legs[i + 1] !== "-"}>{#if l !== "-"}<span class="sr">{l === "n" ? "north" : l === "s" ? "south" : "north and south"}</span>{/if}</td>
								{/each}
							</tr>
						{:else}
							<tr><td class="none" colspan="13">No birds match. Try another name or filter.</td></tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</section>
</div>

<Dialog.Root bind:open={picker}>
	<Dialog.Portal>
		<Dialog.Overlay class="cal-overlay" />
		<Dialog.Content class="cal-pop">
			<div class="months picker">
				<header class="picker-head">
					<div>
						<Dialog.Title class="picker-title">Species on the move</Dialog.Title>
						<Dialog.Description class="hint">Pick a month for its arrivals and departures.</Dialog.Description>
					</div>
					<Dialog.Close class="picker-close" aria-label="Close">
						<svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
					</Dialog.Close>
				</header>
				{@render grid()}
			</div>
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>

<style>
	/* north and south: the brand's leaf and sun, stepped apart in lightness so they stay distinct for colour-blind readers */
	.stage, .picker { --north: #4e7a2c; --south: #e39a3b; }
	.sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
	h2 { margin: 0; }

	/* the two views: a pill like the header's, centred in the header row; the header sits above the page, so this rides over it */
	.tools { position: fixed; z-index: 21; top: 5px; left: 50%; transform: translateX(-50%); display: flex; gap: 2px; padding: 4px; border: 1px solid var(--line); border-radius: 999px; background: color-mix(in srgb, var(--surface) 85%, transparent); backdrop-filter: blur(10px); box-shadow: var(--shadow); }
	.tools button { min-width: 104px; padding: 9px var(--s4); border: 0; border-radius: 999px; background: none; color: var(--muted); font: 600 0.95rem var(--font); cursor: pointer; transition: color 0.15s, background 0.15s; }
	.tools button:hover { color: var(--text); background: var(--surface-2); }
	.tools button.on { color: #fff; background: var(--accent-strong); }

	/* the frame under the header, a gap all round as on the map; only the panel's feed scrolls */
	.stage { position: fixed; top: 72px; left: 16px; right: 16px; bottom: 16px; display: grid; grid-template-columns: 248px minmax(0, 1fr); gap: var(--s3); }
	.months, .panel { min-height: 0; border: 1px solid var(--line); border-radius: 18px; background: var(--surface); box-shadow: var(--shadow); }

	/* the months fill the sidebar's height, a row each */
	.months { display: flex; flex-direction: column; padding: var(--s4) var(--s3) var(--s3); }
	.months header { padding: 0 var(--s2); }
	.months h2 { font-size: 0.95rem; }
	.hint { margin: 2px 0 var(--s3); color: var(--muted); font-size: 0.78rem; line-height: 1.4; }
	/* too short a window for twelve rows: the list scrolls inside the sidebar */
	.months ol { flex: 1; display: grid; grid-auto-rows: minmax(28px, 1fr); gap: 2px; min-height: 0; margin: 0; padding: 0; overflow-y: auto; list-style: none; scrollbar-width: thin; }
	.months button { display: grid; grid-template-columns: 34px minmax(0, 1fr) 34px; align-items: center; gap: var(--s2); width: 100%; height: 100%; padding: 0 var(--s2); border: 0; border-radius: 8px; background: none; color: var(--muted); font: inherit; text-align: left; cursor: pointer; transition: background 0.15s; }
	.months button:hover { background: var(--surface-2); }
	.months button.on { background: color-mix(in srgb, var(--accent) 13%, var(--surface)); box-shadow: inset 3px 0 0 var(--accent-strong); color: var(--text); }
	.m { font-size: 0.85rem; font-weight: 500; }
	/* this month: its name in ink with a small sun dot */
	.now .m { color: var(--text); font-weight: 600; }
	.now .m::after { content: ""; display: inline-block; width: 5px; height: 5px; margin-left: 4px; border-radius: 50%; background: var(--sun); vertical-align: middle; }
	/* two thin bars from a shared left baseline, a 2px gap between them, rounded at the data end */
	.spark { display: grid; gap: 2px; }
	.spark i { display: block; height: 4px; min-width: 0; border-radius: 0 2px 2px 0; }
	.spark .n { background: var(--north); }
	.spark .s { background: var(--south); }
	.months strong { color: var(--text); font-family: var(--font-num); font-size: 0.95rem; font-weight: 600; text-align: right; font-variant-numeric: lining-nums tabular-nums; }
	.legend { display: flex; flex-wrap: wrap; gap: var(--s3); margin: var(--s3) 0 0; padding: var(--s3) var(--s2) 0; border-top: 1px solid var(--line); color: var(--muted); font-size: 0.75rem; }
	.legend span { display: inline-flex; align-items: center; gap: 5px; }
	.key { width: 8px; height: 8px; border-radius: 2px; }
	.key.n { background: var(--north); }
	.key.s { background: var(--south); }
	.tt-key { display: none; }

	/* the panel: a fixed top bar, then a feed that scrolls */
	.panel { display: flex; flex-direction: column; overflow: hidden; container-type: inline-size; }
	/* the title sits in the middle of the bar; an empty column on the left balances the tools on the right */
	.top { display: grid; grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr); align-items: center; gap: var(--s3); padding: var(--s3) var(--s5); border-bottom: 1px solid var(--line); }
	.title { grid-column: 2; display: flex; align-items: center; justify-content: center; gap: var(--s3); }
	.heading { display: grid; justify-items: center; text-align: center; }
	.sub { color: var(--muted); font-size: 0.78rem; }
	.title h2 { min-width: 6.5em; font-size: 1.5rem; line-height: 1.2; }
	.arrow { width: 30px; height: 30px; border: 1px solid var(--line); border-radius: 50%; background: var(--surface); color: var(--text); font-size: 1.05rem; line-height: 1; cursor: pointer; }
	.arrow:hover { border-color: var(--accent); color: var(--accent); }
	.name-row { display: flex; align-items: center; justify-content: center; gap: 6px; }
	/* wider screens keep the months in the sidebar, so the button only shows on phones */
	/* a soft leaf-tinted button with a ring, lifting a touch on hover; the icon's "today" square glows in the sun colour */
	.cal-btn { display: none; place-items: center; width: 38px; height: 38px; border: 1px solid color-mix(in srgb, var(--accent) 30%, transparent); border-radius: 12px; background: linear-gradient(160deg, color-mix(in srgb, var(--accent) 16%, var(--surface)), color-mix(in srgb, var(--accent) 6%, var(--surface))); box-shadow: 0 1px 0 rgb(255 255 255 / 0.6) inset, 0 4px 10px -6px rgb(33 51 40 / 0.45); color: var(--accent-strong); cursor: pointer; transition: transform 0.18s, box-shadow 0.18s, border-color 0.18s; }
	.cal-btn:hover { transform: translateY(-1px) rotate(-4deg); border-color: var(--accent); box-shadow: 0 1px 0 rgb(255 255 255 / 0.6) inset, 0 8px 16px -8px rgb(33 51 40 / 0.55); }
	.cal-btn:active { transform: translateY(0) scale(0.96); }
	.cal-btn .page { fill: var(--surface); stroke: currentColor; stroke-width: 1.6; }
	.cal-btn .band { fill: currentColor; }
	.cal-btn .ring { stroke: currentColor; stroke-width: 2; stroke-linecap: round; }
	.cal-btn .day { fill: color-mix(in srgb, currentColor 45%, transparent); }
	.cal-btn .today { fill: var(--sun); filter: drop-shadow(0 0 1.5px color-mix(in srgb, var(--sun) 80%, transparent)); }

	/* the months pop-up: the same grid as the sidebar, in a card over a dimmed page */
	:global(.cal-overlay) { position: fixed; inset: 0; z-index: 40; background: rgb(20 30 24 / 0.35); }
	:global(.cal-pop) { position: fixed; z-index: 41; top: 50%; left: 50%; width: min(420px, calc(100vw - 24px)); max-height: calc(100dvh - 32px); transform: translate(-50%, -50%); outline: none; }
	.picker { max-height: inherit; overflow: auto; }
	.picker-head { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--s2); padding: 0 var(--s2); }
	.picker-head :global(.picker-title) { margin: 0; font-size: 1rem; font-weight: 600; }
	.picker-head :global(.hint) { margin: 2px 0 var(--s3); color: var(--muted); font-size: 0.8rem; line-height: 1.4; }
	:global(.picker-close) { display: grid; place-items: center; flex: none; width: 36px; height: 36px; margin: -6px -6px 0 0; border: 0; border-radius: 50%; background: none; color: var(--muted); cursor: pointer; }
	:global(.picker-close svg) { fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; }
	:global(.picker-close:hover) { color: var(--text); background: var(--surface-2); }

	.actions { grid-column: 3; justify-self: end; display: flex; align-items: center; gap: var(--s2); }
	.find { display: flex; align-items: center; gap: 6px; width: 180px; padding: 0 12px; border: 1px solid var(--line); border-radius: 999px; background: var(--surface-2); color: var(--muted); transition: border-color 0.15s, background 0.15s; }
	.find:focus-within { border-color: var(--accent); background: var(--surface); }
	.find svg, :global(.filter-btn svg) { flex: none; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
	.find input { flex: 1; min-width: 0; padding: 6px 0; border: 0; background: none; color: var(--text); font: 500 0.85rem var(--font); outline: none; }
	:global(.filter-btn) { position: relative; display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; border: 1px solid var(--line); border-radius: 999px; background: var(--surface); color: var(--text); font: 600 0.85rem var(--font); cursor: pointer; transition: border-color 0.15s; }
	:global(.filter-btn:hover), :global(.filter-btn[data-state="open"]) { border-color: var(--accent); }
	.badge { display: grid; place-items: center; width: 16px; height: 16px; border-radius: 50%; background: var(--accent-strong); color: #fff; font-size: 0.65rem; }
	.opt { display: inline-flex; align-items: center; gap: var(--s2); }
	.tick { width: 14px; height: 14px; border: 1.5px solid var(--line); border-radius: 50%; }
	.tick.on { border: 4px solid var(--accent-strong); }

	.show { display: inline-flex; gap: 2px; padding: 3px; border-radius: 999px; background: var(--surface-2); }
	.show { grid-column: 1; justify-self: start; }
	.show button { display: inline-flex; align-items: center; gap: 6px; padding: 5px 12px; border: 0; border-radius: 999px; background: none; color: var(--muted); font: 600 0.85rem var(--font); cursor: pointer; }
	.show .dot { --c: var(--accent-strong); width: 11px; height: 11px; }
	.show .n { font-family: var(--font-num); font-weight: 600; color: var(--text); font-variant-numeric: lining-nums tabular-nums; }
	.show button.on { background: var(--surface); color: var(--text); box-shadow: 0 1px 3px rgb(33 51 40 / 0.15); }

	.feed { position: relative; flex: 1; min-height: 0; overflow: auto; overscroll-behavior: contain; padding: 0 var(--s5) var(--s4); }
	/* the agenda: a heading per week that stays at the top while its week scrolls, then one line per event */
	.week h3 { position: sticky; top: 0; z-index: 1; display: flex; align-items: baseline; justify-content: space-between; margin: 0; padding: var(--s4) 0 6px; border-bottom: 1px solid var(--line); background: var(--surface); color: var(--text); font-size: 0.72rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; }
	.week h3 span { color: var(--muted); font-weight: 400; letter-spacing: 0; text-transform: none; font-size: 0.8rem; }
	.week.current h3 { color: var(--link); border-bottom-color: var(--accent); }
	.week.past ol { opacity: 0.6; }
	/* a day: its date tile on the left, sticking under the week heading while the day's birds scroll by */
	.day { display: grid; grid-template-columns: 52px minmax(0, 1fr); gap: var(--s3); padding: 8px 0; border-bottom: 1px solid color-mix(in srgb, var(--line) 50%, transparent); }
	.day:last-child { border-bottom: 0; }
	.tile-date { position: sticky; top: 46px; align-self: start; display: grid; justify-items: center; gap: 1px; padding: 6px 0 7px; border-radius: 12px; background: var(--surface-2); color: var(--text); line-height: 1; }
	.tile-date small { color: var(--muted); font-size: 0.64rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; }
	.tile-date b { font-family: var(--font-num); font-size: 1.25rem; font-weight: 600; font-variant-numeric: lining-nums tabular-nums; }
	.day.today .tile-date { background: var(--accent-strong); color: #fff; }
	.day.today .tile-date small { color: rgb(255 255 255 / 0.75); }
	.agenda { margin: 4px 0 0; padding: 0; list-style: none; }
	.agenda { margin: 0; }
	.agenda li { display: grid; grid-template-columns: 14px minmax(0, 1.2fr) minmax(0, 1fr) minmax(0, 0.8fr); align-items: center; gap: var(--s3); padding: 8px var(--s2); border-radius: 8px; font-size: 0.9rem; }
	.agenda li:hover { background: var(--surface-2); }
	time { color: var(--muted); font-size: 0.82rem; font-variant-numeric: tabular-nums; }
	.agenda a { overflow: hidden; color: var(--text); font: 500 0.95rem var(--font-read); letter-spacing: 0.005em; text-decoration: none; text-overflow: ellipsis; white-space: nowrap; }
	.agenda a:hover { color: var(--link); }
	.what, .pop { overflow: hidden; color: var(--muted); font-size: 0.85rem; text-overflow: ellipsis; white-space: nowrap; }
	.pop { font-size: 0.8rem; }
	.pop-inline { display: none; }
	/* filled: arriving; ring: leaving, as on the home page */
	.dot { display: inline-block; flex: none; width: 14px; height: 14px; border-radius: 50%; background: var(--c); }
	.dot.ring { background: transparent; box-shadow: inset 0 0 0 2.5px var(--c); }
	.none { margin: 0; padding: var(--s5) 0; color: var(--muted); }

	/* the timetable view */
	table { width: 100%; min-width: 640px; border-collapse: separate; border-spacing: 0 2px; font-family: var(--font-read); }
	thead th { position: sticky; top: 0; z-index: 2; padding: var(--s3) 0 var(--s2); background: var(--surface); color: var(--muted); font-size: 0.82rem; font-weight: 500; letter-spacing: 0.01em; }
	thead button { padding: 2px 6px; border: 0; border-radius: 99px; background: none; color: inherit; font: inherit; cursor: pointer; }
	thead button:hover { color: var(--text); background: var(--surface-2); }
	thead th.now button { color: #fff; background: var(--accent-strong); }
	.name { position: sticky; left: 0; z-index: 1; padding-right: var(--s3); background: var(--surface); text-align: left; white-space: nowrap; font-size: 0.95rem; font-weight: 400; letter-spacing: 0.005em; }
	thead .name { z-index: 3; font-size: 0.82rem; font-weight: 500; }
	/* the row under the pointer lights up, so a name is easy to follow across to its months */
	tbody tr:hover .name { background: var(--surface-2); }
	tbody tr:hover .name a { color: var(--link); }
	.name a { color: var(--text); text-decoration: none; }
	.name a:hover { color: var(--link); }
	.name .dot { width: 12px; height: 12px; margin-right: 10px; vertical-align: -1px; }
	td { height: 26px; padding: 0; background: var(--surface-2); }
	td + td { border-left: 2px solid var(--surface); }
	td.n { background: var(--north); }
	td.s { background: var(--south); }
	td.b { background: linear-gradient(90deg, var(--north) 50%, var(--south) 50%); }
	td.now { box-shadow: inset 0 0 0 1px rgb(33 51 40 / 0.35); }
	td.none { padding: var(--s4); background: none; color: var(--muted); text-align: center; }

	@media (max-width: 1100px) {
		.pop { display: none; }
		.pop-inline { display: inline; }
		.agenda li { grid-template-columns: 14px minmax(0, 1fr) minmax(0, 1fr); }
	}
	/* a narrow panel has no room for a centred title beside the tools: stack them, all centred */
	@container (max-width: 940px) {
		.top { grid-template-columns: minmax(0, 1fr); justify-items: center; }
		.title, .actions, .show { grid-column: 1; justify-self: center; }
		.title { grid-row: 1; }
	}
	/* phones and small tablets: the panel fills the window below the header, its top bar fixed and only the list scrolling;
	   the months move into the pop-up behind the calendar button */
	@media (max-width: 820px) {
		.stage { top: 60px; left: 0; right: 0; bottom: 0; grid-template-columns: minmax(0, 1fr); }
		/* no card on a phone: the list sits straight on the page, with one hairline under the fixed top bar */
		.panel { border: 0; border-radius: 0; box-shadow: none; background: var(--bg); }
		.week h3 { background: var(--bg); }
		.side { display: none; }
		.cal-btn { display: grid; }
		.months ol { grid-template-columns: repeat(4, minmax(0, 1fr)); grid-auto-rows: auto; gap: 4px; }
		.months button { grid-template-columns: 1fr auto; grid-template-rows: auto auto; gap: 4px 6px; padding: 8px; min-height: 52px; background: var(--surface-2); }
		.spark { grid-column: 1 / -1; grid-row: 2; }
		/* the month, its switches and the search grouped in one floating card; the list scrolls flat beneath it */
		.top { gap: var(--s2); margin: 4px 12px 0; padding: var(--s3) var(--s3) var(--s3); border: 1px solid var(--line); border-radius: 18px; background: var(--surface); box-shadow: 0 6px 18px -12px rgb(33 51 40 / 0.35); }
		.agenda li { grid-template-columns: 14px minmax(0, 1fr); row-gap: 0; padding: 6px 4px; }
		.what { grid-column: 2; }

		/* the timetable on a phone: the names stay put on the left while the months scroll sideways, each a comfortable
		   column with its name; a bird's travel is a slim rounded bar on a faint line, joined across back-to-back months */
		.tt-key { display: flex; justify-content: center; gap: var(--s3); margin: 6px 0 0; color: var(--muted); font-size: 0.75rem; }
		.tt-key span { display: inline-flex; align-items: center; gap: 5px; }
		.feed.sheet { padding: 0 0 var(--s4); scrollbar-width: none; overscroll-behavior: contain; }
		.feed.sheet::-webkit-scrollbar { display: none; }
		table { width: max-content; min-width: 100%; border-spacing: 0; }
		.name, thead th { background: var(--bg); }
		.name { width: 140px; min-width: 140px; max-width: 140px; padding: 0 10px 0 16px; font-size: 0.84rem; line-height: 1.2; white-space: normal; box-shadow: 8px 0 10px -10px rgb(33 51 40 / 0.45); }
		/* the dot beside the name, and a long name on two lines rather than cut short */
		/* the cell itself stays a table cell (so it can stick); the dot and name line up inside it */
		.who { display: flex; align-items: center; gap: 8px; }
		.name { position: sticky; left: 0; z-index: 2; }
		thead .name { z-index: 4; }
		.name .dot { flex: none; width: 8px; height: 8px; margin: 0; }
		.name a { display: -webkit-box; overflow: hidden; -webkit-box-orient: vertical; -webkit-line-clamp: 2; line-clamp: 2; }
		thead th { padding: 10px 0 8px; border-bottom: 1px solid var(--line); }
		thead th:not(.name) { width: 46px; min-width: 46px; }
		thead button { padding: 4px 8px; font-size: 0.78rem; }
		tbody th, td { height: 42px; border-bottom: 1px solid color-mix(in srgb, var(--line) 55%, transparent); }
		td, td.n, td.s, td.b { position: relative; background: none; }
		td + td { border-left: 0; }
		/* the empty track, then the travel bars over it */
		td::before { content: ""; position: absolute; top: 50%; left: 0; right: 0; height: 2px; transform: translateY(-50%); background: color-mix(in srgb, var(--line) 70%, transparent); }
		td.n::before, td.s::before, td.b::before { left: 5px; right: 5px; height: 10px; border-radius: 99px; }
		td.n::before { background: var(--north); }
		td.s::before { background: var(--south); }
		td.b::before { background: linear-gradient(90deg, var(--north) 50%, var(--south) 50%); }
		td.jl::before { left: 0; border-top-left-radius: 0; border-bottom-left-radius: 0; }
		td.jr::before { right: 0; border-top-right-radius: 0; border-bottom-right-radius: 0; }
		/* this month: a soft column of leaf behind the bars */
		td.now { box-shadow: none; background: color-mix(in srgb, var(--accent) 8%, transparent); }
		td.none { height: auto; }
		td.none::before { display: none; }
	}
	@media (max-width: 560px) {
		/* stays centred at the top like on wider screens: the menu is a lone hamburger now, so there is room beside it */
		.tools { height: 50px; align-items: center; } /* the hamburger pill's height, so the two line up */
		.tools button { min-width: 0; padding: 8px var(--s3); font-size: 0.88rem; }
		.months ol { grid-template-columns: repeat(3, minmax(0, 1fr)); }
		.top { padding-inline: var(--s3); }
		.feed { padding-inline: var(--s4); }
		.actions { justify-self: stretch; width: 100%; }
		/* the switch spans the card like the search row below it, its three choices sharing the width */
		.show { justify-self: stretch; width: 100%; box-sizing: border-box; }
		.show button { flex: 1; justify-content: center; padding-inline: 6px; }
		.find { flex: 1; width: auto; min-width: 0; }
		.title h2 { font-size: 1.3rem; }
		.heading .sub { display: none; } /* the counts are on the switch below; one number is enough on a phone */
		.name { font-size: 0.88rem; }
	}
	/* very narrow phones: the centred pill would reach the hamburger, so it moves to the right edge */
	@media (max-width: 340px) {
		.tools { left: auto; right: 12px; transform: none; }
	}
</style>
