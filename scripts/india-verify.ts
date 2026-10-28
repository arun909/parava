// Checks the estimated India migrants (src/data/india.json) and flags the doubtful ones.
//
//   1. Known species: estimates against field-guide ranges for well documented migrants.
//   2. The hand-modelled species: the estimator's route against the curated route for the same species.
//   3. Sanity checks on every model: dates in order and inside the year, a route close to a great circle, no end in an ocean,
//      other end not too close, timetable that reproduces India's own monthly records.
//   4. Outliers to review by hand: the longest routes and the biggest disagreement with the species' own GBIF data.
//
// Writes the flags back into src/data/india.json (confidence: "low" with the reasons) and the report to
// docs/india-estimates-report.md.   Run after scripts/india-geo.ts.

import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import destination from "@turf/destination";
import { point } from "@turf/helpers";
import { feature } from "topojson-client";
import land from "world-atlas/land-110m.json";
import { RAW_SPECIES } from "../src/data/species";
import { prepareRoute } from "../src/lib/model/geo";
import {
	anchors,
	baseline,
	km,
	type LonLat,
	type Model,
	median,
	OUT,
	relative,
	species,
} from "./india-geo";

const REPORT = "docs/india-estimates-report.md";
const models = (await Bun.file(OUT).json()) as Model[];
const season = new Map(Object.values(species).map((s) => [s.sci, s]));
const byName = (n: string) =>
	models.find((m) => m.name.toLowerCase() === n.toLowerCase());

// ---------------------------------------------------------------- helpers
const landGeo = feature(
	land as never,
	(land as never as { objects: { land: never } }).objects.land,
) as never as GeoJSON.FeatureCollection<GeoJSON.MultiPolygon | GeoJSON.Polygon>;
const onLand = (p: LonLat) =>
	landGeo.features.some((f) => booleanPointInPolygon(point(p), f as never));
/** Land within 150 km counts: coasts are rough at this scale, and shorebirds live on them. */
const nearLand = (p: LonLat) =>
	onLand(p) ||
	[0, 45, 90, 135, 180, 225, 270, 315].some((b) =>
		onLand(
			destination(point(p), 150, b, { units: "kilometers" }).geometry
				.coordinates as LonLat,
		),
	);
const MARINE =
	/gull|tern|skua|jaeger|shearwater|petrel|albatross|booby|frigate|tropic|auk|cormorant|pelican/i;

const MONTHS = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(" ");
const START = [1, 32, 60, 91, 121, 152, 182, 213, 244, 274, 305, 335];
const monthOf = (d: number) => START.findLastIndex((s) => s <= d);
/** Months a model says birds are in India. */
function indiaMonths(m: Model): boolean[] {
	const on = new Array<boolean>(12).fill(false);
	const mark = (a: number, b: number) => {
		for (let d = Math.max(1, a); d <= Math.min(365, b); d += 3)
			on[monthOf(d)] = true;
	};
	const [d0, d1, d2, d3] = m.pop.dep;
	if (m.kind === "winter") {
		mark(d3, 365);
		mark(1, d0);
	} else if (m.kind === "summer") mark(d1, d2);
	else {
		mark(m.anchor[0] - 20, m.anchor[0] + 20);
		mark(m.anchor[1] - 20, m.anchor[1] + 20);
	}
	return on;
}
const monthList = (on: boolean[]) =>
	on.flatMap((v, i) => (v ? [MONTHS[i]] : [])).join(" ");
const ends = (m: Model) => ({
	winter: m.pop.spring[0] as LonLat,
	breeding: m.pop.spring.at(-1) as LonLat,
});
const fmt = (p: LonLat) => `${p[0].toFixed(0)}E ${p[1].toFixed(0)}N`;
const row = (...c: (string | number)[]) => `| ${c.join(" | ")} |`;

// ---------------------------------------------------------------- 1. known species
// Reference values are approximate, from field-guide range descriptions (breeding area, wintering area, months in India); they are
// not measurements. A tolerance in km allows for ranges that cover a whole region.
interface Known {
	name: string;
	kind: Model["kind"];
	breeding: LonLat;
	winter: LonLat;
	months: number[];
	tol: number;
	note?: string;
}
const KNOWN: Known[] = [
	{
		name: "Amur Falcon",
		kind: "passage",
		breeding: [120, 47],
		winter: [28, -20],
		months: [3, 4, 9, 10],
		tol: 2500,
		note: "NE Asia to southern Africa, crossing India",
	},
	{
		name: "Bar-headed Goose",
		kind: "winter",
		breeding: [95, 37],
		winter: [82, 24],
		months: [9, 10, 11, 0, 1, 2],
		tol: 2000,
	},
	{
		name: "Ruddy Shelduck",
		kind: "winter",
		breeding: [90, 40],
		winter: [80, 25],
		months: [9, 10, 11, 0, 1, 2],
		tol: 2000,
	},
	{
		name: "Northern Pintail",
		kind: "winter",
		breeding: [70, 62],
		winter: [78, 23],
		months: [9, 10, 11, 0, 1, 2],
		tol: 2800,
	},
	{
		name: "Common Cuckoo",
		kind: "passage",
		breeding: [80, 55],
		winter: [25, -5],
		months: [3, 4, 8, 9],
		tol: 3500,
		note: "reference is rough: several populations",
	},
	{
		name: "Pied Cuckoo",
		kind: "summer",
		breeding: [78, 20],
		winter: [30, -10],
		months: [5, 6, 7, 8],
		tol: 3000,
		note: "winters in Africa, arrives with the monsoon",
	},
	{
		name: "Pallas's Leaf Warbler",
		kind: "winter",
		breeding: [105, 52],
		winter: [90, 25],
		months: [9, 10, 11, 0, 1, 2],
		tol: 2500,
	},
	{
		name: "Rosy Starling",
		kind: "winter",
		breeding: [60, 45],
		winter: [77, 16],
		months: [10, 11, 0, 1, 2],
		tol: 2000,
	},
];
const knownRows: string[] = [];
let knownPass = 0;
for (const k of KNOWN) {
	const m = byName(k.name);
	if (!m) {
		knownRows.push(row(k.name, "not modelled", "", "", "", "", ""));
		continue;
	}
	const e = ends(m);
	const dB = km(e.breeding, k.breeding);
	const dW = km(e.winter, k.winter);
	const got = indiaMonths(m);
	const want = new Array<boolean>(12).fill(false);
	for (const i of k.months) want[i] = true;
	const both = got.filter((v, i) => v && want[i]).length;
	const either = got.filter((v, i) => v || want[i]).length;
	const jac = both / Math.max(1, either);
	const ok = m.kind === k.kind && dB <= k.tol && dW <= k.tol && jac >= 0.5;
	if (ok) knownPass++;
	knownRows.push(
		row(
			k.name,
			`${m.kind}${m.kind === k.kind ? "" : ` (expected ${k.kind})`}`,
			`${fmt(e.breeding)}: ${Math.round(dB)} km off`,
			`${fmt(e.winter)}: ${Math.round(dW)} km off`,
			monthList(got),
			`${(jac * 100).toFixed(0)}%`,
			ok ? "pass" : "FAIL",
		),
	);
}

// ---------------------------------------------------------------- 2. against the hand-modelled routes
const cross: {
	name: string;
	pop: string;
	dW: number;
	dB: number;
	days: number[];
}[] = [];
for (const c of RAW_SPECIES) {
	const m = models.find((x) => x.sci === c.sci) ?? byName(c.name);
	if (!m) continue;
	const e = ends(m);
	// the curated population closest to the estimate (curated species may have populations on other continents)
	let best: { pop: (typeof c.pops)[number]; d: number } | undefined;
	for (const pop of c.pops) {
		const d =
			km(pop.spring[0] as LonLat, e.winter) +
			km(pop.spring.at(-1) as LonLat, e.breeding);
		if (!best || d < best.d) best = { pop, d };
	}
	if (!best) continue;
	const p = best.pop;
	cross.push({
		name: c.name,
		pop: p.name,
		dW: km(p.spring[0] as LonLat, e.winter),
		dB: km(p.spring.at(-1) as LonLat, e.breeding),
		days: m.pop.dep.map((d, i) => Math.abs(d - p.dep[i]!)),
	});
}
const crossRows = cross.map((c) =>
	row(c.name, c.pop, Math.round(c.dW), Math.round(c.dB), c.days.join(" / ")),
);
const typical = (f: (c: (typeof cross)[number]) => number) =>
	Math.round(median(cross.map(f)));

// ---------------------------------------------------------------- 3. checks on every model
const extra = new Map<string, string[]>();
const flag = (m: Model, why: string) =>
	extra.set(m.id, [...(extra.get(m.id) ?? []), why]);
const counts = {
	total: models.length,
	order: 0,
	ocean: 0,
	detour: 0,
	shortEnd: 0,
	months: 0,
	dates: 0,
	few: 0,
};
const detours: { name: string; ratio: number }[] = [];
for (const m of models) {
	const [a, b, c, d] = m.pop.dep;
	if (!(1 <= a && a < b && b < c && c < d && d <= 365)) {
		counts.order++;
		flag(m, "dates out of order");
	}
	const r = prepareRoute(m.pop.spring as LonLat[]);
	const gc = km(m.pop.spring[0] as LonLat, m.pop.spring.at(-1) as LonLat);
	const ratio = r.len / Math.max(1, gc);
	detours.push({ name: m.name, ratio });
	// a route that bends far off the great circle between its ends is not a plausible migration track
	if (ratio > 1.35) {
		counts.detour++;
		flag(m, `route ${ratio.toFixed(2)}x the great circle`);
	}
	if (!MARINE.test(m.family)) {
		const bad = [ends(m).winter, ends(m).breeding].filter((p) => !nearLand(p));
		if (bad.length) {
			counts.ocean++;
			flag(m, `an end of the route is at sea (${bad.map(fmt).join(", ")})`);
		}
	}
	if (gc < 700) counts.shortEnd++;
	if (m.flags.some((f) => f.startsWith("model disagrees"))) counts.months++;
	if (
		m.flags.some(
			(f) => f.startsWith("timing varies") || f.startsWith("dates from"),
		)
	)
		counts.dates++;
	if (m.flags.some((f) => f.startsWith("few distinct"))) counts.few++;
}

// ---------------------------------------------------------------- 4. outliers
const disagreement = models.map((m) => {
	const s = Object.values(species).find((x) => x.sci === m.sci);
	if (!s) return { m, days: 0 };
	const a = anchors(m.kind, relative(s.months, baseline));
	return {
		m,
		days: a
			? Math.max(Math.abs(a[0] - m.anchor[0]), Math.abs(a[1] - m.anchor[1]))
			: 0,
	};
});
const farthest = [...models].sort((a, b) => b.km - a.km).slice(0, 20);
const worstDates = [...disagreement]
	.sort((a, b) => b.days - a.days)
	.slice(0, 20);

// ---------------------------------------------------------------- write back and report
let lowNow = 0;
for (const m of models) {
	const more = extra.get(m.id) ?? [];
	m.flags = [...new Set([...m.flags, ...more])];
	m.confidence = m.flags.length ? "low" : "ok";
	if (m.confidence === "low") lowNow++;
}
await Bun.write(OUT, JSON.stringify(models));

const kinds = ["winter", "summer", "passage"]
	.map((k) => `${k} ${models.filter((m) => m.kind === k).length}`)
	.join(", ");
const out: string[] = [
	"# India migrant estimates: verification report",
	"",
	`Generated by \`bun run india\` (scripts/india-verify.ts). ${models.length} models: ${kinds}. **${lowNow} flagged low confidence**, ${models.length - lowNow} without flags.`,
	"",
	"## Checks and counts",
	"",
	row("Check", "Species affected"),
	row("---", "---"),
	row("Dates in order and inside the year", `${counts.order} fail`),
	row("Route more than 1.35x the great circle between its ends", counts.detour),
	row(
		"An end of the route at sea (non-marine families, 150 km coast tolerance)",
		counts.ocean,
	),
	row("Other end under 700 km from the first", counts.shortEnd),
	row(
		"Timetable disagrees with India's monthly records in more than 3 months",
		counts.months,
	),
	row(
		"Timing varies over 30 days between years, or dates from under 4 years",
		counts.dates,
	),
	row("Few distinct records at an end of the route", counts.few),
	row("Known species passing all checks", `${knownPass} of ${KNOWN.length}`),
	"",
	"## 1. Known species",
	"",
	"Reference values are approximate, from field-guide range descriptions, not measurements. Months are those the model puts the birds in India; the percentage is the overlap with the expected months.",
	"",
	row(
		"Species",
		"Kind",
		"Breeding end",
		"Wintering end",
		"Model's months in India",
		"Month overlap",
		"Result",
	),
	row("---", "---", "---", "---", "---", "---", "---"),
	...knownRows,
	"",
	"## 2. Against the hand-modelled routes",
	"",
	`Estimator against curated route for the same species (closest curated population). Distances are between the matching ends; dates are the absolute difference in days for [spring departs, spring arrives, autumn departs, autumn arrives]. Typical (median) error over ${cross.length} species: wintering end ${typical((c) => c.dW)} km, breeding end ${typical((c) => c.dB)} km, dates ${Math.round(median(cross.flatMap((c) => c.days)))} days.`,
	"",
	row(
		"Species",
		"Curated population",
		"Wintering end km",
		"Breeding end km",
		"Date differences (days)",
	),
	row("---", "---", "---", "---", "---"),
	...crossRows,
	"",
	"## 3. Longest routes (review by hand)",
	"",
	row("Species", "Kind", "Round trip km", "Ends", "Flags"),
	row("---", "---", "---", "---", "---"),
	...farthest.map((m) =>
		row(
			m.name,
			m.kind,
			m.km.toLocaleString(),
			`${fmt(ends(m).winter)} to ${fmt(ends(m).breeding)}`,
			m.flags.join("; ") || "none",
		),
	),
	"",
	"## 4. Largest disagreement with the species' own GBIF data (review by hand)",
	"",
	"Days between the model's India dates (median of the yearly dates) and the dates read from the pooled monthly counts.",
	"",
	row("Species", "Kind", "Days", "Flags"),
	row("---", "---", "---", "---"),
	...worstDates.map(({ m, days }) =>
		row(m.name, m.kind, Math.round(days), m.flags.join("; ") || "none"),
	),
	"",
	"## 5. Species flagged low confidence",
	"",
	...models
		.filter((m) => m.confidence === "low")
		.map((m) => `- **${m.name}** (${m.kind}): ${m.flags.join("; ")}`),
	"",
];
await Bun.write(REPORT, out.join("\n"));
console.log(out.slice(0, 22).join("\n"));
console.log(`\nfull report: ${REPORT}`);
