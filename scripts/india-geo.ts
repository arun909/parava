// Estimates a migration model for every species that is clearly seasonal in India, from GBIF records alone.
//
//   fetch    (slow, cached per species in scripts/.cache/india-raw/): India's records month by month for each year; where the
//            species is when it is away from India, as GBIF density tiles (record counts per ~3 degree cell, over all years,
//            for the months it is absent); and the same for India itself. A few requests per species, no sampling.
//   estimate (instant, repeatable from the cache): robust centres of those cell maps, dates from every year then the median,
//            and quality flags. Output: src/data/india.json
//
//   bun scripts/india-geo.ts            fetch what is missing, then estimate
//   bun scripts/india-geo.ts --offline  estimate from the cache only
//   bun scripts/india-geo.ts "Rosy Starling" ...  only those species (prints them)
//
// These are estimates, not field studies. scripts/india-verify.ts checks them and adds more flags.
import { VectorTile } from "@mapbox/vector-tile";
import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import { point } from "@turf/helpers";
import PQueue from "p-queue";
import { PbfReader } from "pbf";
import { feature } from "topojson-client";
import countriesAtlas from "world-atlas/countries-50m.json";
import countryList from "world-countries";

export type LonLat = [number, number];
/** A map cell: [longitude, latitude, number of records]. */
export type Cell = [number, number, number];
export const SEASONS = "scripts/.cache/india-months.json";
export const RAW = "scripts/.cache/india-raw";
const BASE_YEARS = "scripts/.cache/india-baseline-years.json";
export const OUT = "src/data/india.json";

const SPEED = 180; // km per day on migration
const MIN_RECORDS = 150;
const MIN_KM = 400; // shorter movements are local or altitudinal, not migration routes
const LOW_KM = 500; // flagged: a very short route is probably not a real migration
const YEARS = Array.from({ length: 11 }, (_, i) => 2015 + i);
const TOP_COUNTRIES = 3;
const MID = [15, 45, 74, 105, 135, 166, 196, 227, 258, 288, 319, 349];
const START = [1, 32, 60, 91, 121, 152, 182, 213, 244, 274, 305, 335];
const monthOf = (day: number) => START.findLastIndex((s) => s <= day);

// ---------------------------------------------------------------- geometry
const RAD = Math.PI / 180;
const vec = ([lon, lat]: LonLat): [number, number, number] => [
	Math.cos(lat * RAD) * Math.cos(lon * RAD),
	Math.cos(lat * RAD) * Math.sin(lon * RAD),
	Math.sin(lat * RAD),
];
const unvec = ([x, y, z]: number[]): LonLat => [
	Math.atan2(y!, x!) / RAD,
	Math.atan2(z!, Math.hypot(x!, y!)) / RAD,
];
export const km = (a: LonLat, b: LonLat) => {
	const [p, q] = [vec(a), vec(b)];
	return (
		6371 *
		Math.acos(
			Math.min(1, Math.max(-1, p[0] * q[0] + p[1] * q[1] + p[2] * q[2])),
		)
	);
};
type W = { p: LonLat; w: number; n?: number };
const mean = (pts: W[]): LonLat => {
	const s = [0, 0, 0];
	for (const { p, w } of pts) {
		vec(p).forEach((v, i) => {
			s[i]! += v * w;
		});
	}
	return unvec(s);
};
export const mid = (a: LonLat, b: LonLat): LonLat =>
	mean([
		{ p: a, w: 1 },
		{ p: b, w: 1 },
	]);
export const median = (a: number[]) => {
	const s = [...a].sort((x, y) => x - y);
	return s.length
		? (s[(s.length - 1) >> 1]! + s[s.length >> 1]!) / 2
		: Number.NaN;
};
export const quantile = (a: number[], q: number) => {
	const s = [...a].sort((x, y) => x - y);
	return s.length
		? s[Math.min(s.length - 1, Math.floor(q * s.length))]!
		: Number.NaN;
};

/** Weighted geometric median on the sphere (Weiszfeld): resistant to stray points, unlike the mean. */
function geoMedian(pts: W[], start: LonLat): LonLat {
	let c = vec(start);
	for (let it = 0; it < 20; it++) {
		const n = [0, 0, 0];
		let d = 0;
		for (const { p, w } of pts) {
			const v = vec(p);
			const dist = Math.max(
				1e-6,
				Math.hypot(v[0] - c[0], v[1] - c[1], v[2] - c[2]),
			);
			for (let i = 0; i < 3; i++) n[i]! += (w * v[i]!) / dist;
			d += w / dist;
		}
		const m = [n[0]! / d, n[1]! / d, n[2]! / d];
		const len = Math.hypot(m[0]!, m[1]!, m[2]!) || 1;
		c = [m[0]! / len, m[1]! / len, m[2]! / len];
	}
	return unvec(c);
}

export interface Centre {
	pt: LonLat;
	/** km around the centre holding most records: the radius where sightings still count. */
	rad: number;
	/** Cells kept after trimming, and cells before. */
	kept: number;
	n: number;
	/** Records in the cells that were kept. */
	records: number;
}
/** Median centre of a trimmed set: points further than two spreads (1.4826 MAD) beyond the median distance are dropped. */
export function robustCentre(pts: W[]): Centre {
	let c = mean(pts);
	let kept = pts;
	for (let it = 0; it < 3; it++) {
		const d = pts.map(({ p }) => km(p, c));
		const med = median(d);
		const spread = Math.max(
			60,
			1.4826 * median(d.map((x) => Math.abs(x - med))),
		);
		const next = pts.filter((_, i) => d[i]! <= med + 2 * spread);
		if (next.length < 3) break;
		kept = next;
		c = geoMedian(kept, c);
	}
	// the radius holds 75% of the records (by weight), so a few far cells do not stretch it
	const byDist = kept
		.map((k) => ({ d: km(k.p, c), w: k.w }))
		.sort((a, b) => a.d - b.d);
	const total = byDist.reduce((a, b) => a + b.w, 0);
	let acc = 0;
	let rad = 300;
	for (const b of byDist) {
		acc += b.w;
		if (acc >= 0.75 * total) {
			rad = b.d;
			break;
		}
	}
	return {
		pt: c,
		rad: Math.min(1500, Math.max(300, rad)),
		kept: kept.length,
		n: pts.length,
		records: Math.round(kept.reduce((a, k) => a + (k.n ?? 0), 0)),
	};
}

// ---------------------------------------------------------------- GBIF access
// GBIF tolerates about 2 requests a second when they are evenly spaced, but answers 429 to bursts and stalls on some connections.
// Every request takes the next free time slot (shared by all species), has a timeout, and a 429 pauses everything for a while.
let gap = 500; // ms between request starts
let nextAt = 0;
let streak = 0;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function slot() {
	const t = Math.max(Date.now(), nextAt);
	nextAt = t + gap;
	await sleep(t - Date.now());
}
const stat: Record<string, number> = {};
if (process.env.DEBUG)
	setInterval(
		() => process.stderr.write(`${JSON.stringify(stat)} gap ${gap}\n`),
		10_000,
	).unref();
async function get<T>(
	url: string,
	read: (r: Response) => Promise<T>,
): Promise<T | null> {
	let last = "";
	for (let k = 0; k < 8; k++) {
		try {
			await slot();
			const r = await fetch(url, { signal: AbortSignal.timeout(40_000) });
			stat[r.status] = (stat[r.status] ?? 0) + 1;
			if (r.ok) {
				// recover speed after a slowdown: a run of successes shortens the gap again
				if (++streak % 15 === 0) gap = Math.max(500, gap * 0.85);
				return await read(r);
			}
			streak = 0;
			if (r.status === 400 || r.status === 404) return null;
			last = String(r.status);
			if (r.status === 429) {
				gap = Math.min(3000, gap * 1.3);
				nextAt = Math.max(nextAt, Date.now() + 45_000);
			}
		} catch (e) {
			last = String(e);
		}
		await sleep(1000 * (k + 1));
	}
	// a failed request must not be mistaken for "no records": it throws, and the species is retried on the next run
	throw new Error(`GBIF failed (${last}): ${url.slice(0, 300)}`);
}
const gj = <T>(url: string) => get<T>(url, (r) => r.json() as Promise<T>);

const V1 = "https://api.gbif.org/v1";
const BASE = `${V1}/occurrence/search?basisOfRecord=HUMAN_OBSERVATION&hasCoordinate=true&hasGeospatialIssue=false`;
interface Page {
	facets: { counts: { name: string; count: number }[] }[];
}
const monthCounts = async (
	taxon: string,
	filter: string,
): Promise<number[]> => {
	const j = await gj<Page>(
		`${BASE}&${taxon}&${filter}&facet=month&facetLimit=12&limit=0`,
	);
	const m = new Array<number>(12).fill(0);
	for (const c of j?.facets[0]?.counts ?? []) m[+c.name - 1] = c.count;
	return m;
};
const speciesKey = async (sci: string): Promise<number | null> => {
	const m = await gj<{ usageKey?: number; matchType?: string }>(
		`${V1}/species/match?kingdom=Animalia&name=${encodeURIComponent(sci)}`,
	);
	return m?.matchType === "NONE" ? null : (m?.usageKey ?? null);
};

/**
 * Where a species is, as record counts per cell, from GBIF's density tiles (the whole world in two small requests): a grid of
 * ~2.8 degree squares over all years and months (the tile API has no month filter), optionally one country.
 */
async function cells(key: number, country?: string): Promise<Cell[]> {
	const q = `srs=EPSG:4326&bin=square&squareSize=64&taxonKey=${key}&year=2010,2026&basisOfRecord=HUMAN_OBSERVATION${country ? `&country=${country}` : ""}`;
	const out: Cell[] = [];
	for (const x of [0, 1]) {
		const buf = await get(
			`https://api.gbif.org/v2/map/occurrence/density/0/${x}/0.mvt?${q}`,
			async (r) => new Uint8Array(await r.arrayBuffer()),
		);
		if (!buf?.length) continue;
		const layer = Object.values(new VectorTile(new PbfReader(buf)).layers)[0];
		for (let i = 0; layer && i < layer.length; i++) {
			const f = layer.feature(i);
			const g = f.loadGeometry()[0]?.[0];
			if (!g) continue;
			// a 4326 tile at zoom 0 spans 180 degrees each way; the point is the cell's corner, so add half a cell
			out.push([
				x * 180 - 180 + ((g.x + 32) / 4096) * 180,
				90 - ((g.y + 32) / 4096) * 180,
				Number(f.properties.total),
			]);
		}
	}
	return out;
}

/** Which country (ISO 3166 alpha-2) each map cell is in, from Natural Earth outlines (1:50m): the tiles carry no country. */
const CELL_COUNTRY = "scripts/.cache/cell-country.json";
let cellCountry: Record<string, string> = {};
function buildCellCountries(): Record<string, string> {
	const alpha2 = new Map(countryList.map((c) => [c.ccn3, c.cca2]));
	const fc = feature(
		countriesAtlas as never,
		(countriesAtlas as never as { objects: { countries: never } }).objects
			.countries,
	) as never as GeoJSON.FeatureCollection<
		GeoJSON.Polygon | GeoJSON.MultiPolygon
	>;
	const boxes = fc.features.map((f) => {
		let w = 180,
			e = -180,
			so = 90,
			n = -90;
		const polys =
			f.geometry.type === "Polygon"
				? [f.geometry.coordinates]
				: f.geometry.coordinates;
		for (const poly of polys)
			for (const [lon, lat] of poly[0] ?? []) {
				w = Math.min(w, lon!);
				e = Math.max(e, lon!);
				so = Math.min(so, lat!);
				n = Math.max(n, lat!);
			}
		return { f, w, e, so, n, cc: alpha2.get(String(f.id)) };
	});
	const out: Record<string, string> = {};
	// the grid: two tiles of 64 x 64 cells, cell centres as in cells()
	for (const x of [0, 1])
		for (let gx = 0; gx < 64; gx++)
			for (let gy = 0; gy < 64; gy++) {
				const lon = x * 180 - 180 + ((gx * 64 + 32) / 4096) * 180;
				const lat = 90 - ((gy * 64 + 32) / 4096) * 180;
				const hit = boxes.find(
					(b) =>
						b.cc &&
						lon >= b.w &&
						lon <= b.e &&
						lat >= b.so &&
						lat <= b.n &&
						booleanPointInPolygon(point([lon, lat]), b.f as never),
				);
				if (hit?.cc) out[`${lon.toFixed(2)},${lat.toFixed(2)}`] = hit.cc;
			}
	return out;
}
async function ensureCellCountries() {
	if (await Bun.file(CELL_COUNTRY).exists())
		cellCountry = await Bun.file(CELL_COUNTRY).json();
	else {
		cellCountry = buildCellCountries();
		await Bun.write(CELL_COUNTRY, JSON.stringify(cellCountry));
	}
}

// ---------------------------------------------------------------- raw data (cached)
export interface AwayRaw {
	months: number[];
	/** Records outside India in those months, and the countries holding them (top 60). */
	total: number;
	countries: [string, number][];
}
export interface Raw {
	/** 2: away countries are the top 60 with their counts (not trimmed to a share). */
	v?: number;
	/** India's records per month for each year. */
	years: Record<number, number[]>;
	/** Where the species is, over all months and years, as record counts per map cell. */
	all: Cell[];
	/** The same inside India. */
	india: { peak: number; cells: Cell[] } | null;
	north?: AwayRaw | null;
	south?: AwayRaw | null;
	/** Set when the species was ruled out while fetching. */
	skip?: string;
	/** Species with nothing to fetch (too rare, or there all year). */
	none?: boolean;
}
export interface Season {
	sci: string;
	name: string;
	family: string;
	months: number[];
}
export const { baseline, species } = (await Bun.file(SEASONS).json()) as {
	baseline: number[];
	species: Record<string, Season>;
};

export const relative = (months: number[], base: number[]): number[] => {
	const n = months.reduce((a, b) => a + b, 0);
	const bt = base.reduce((a, b) => a + b, 0);
	const r = months.map((m, i) => m / n / (base[i]! / bt));
	const mx = Math.max(...r);
	return r.map((x) => x / mx);
};
export type Kind = "winter" | "summer" | "passage";
/** Winter visitor if present in India in December and January, summer visitor if present in June and July, otherwise passage. */
export function kindOf(rel: number[]): Kind | null {
	const on = (m: number) => rel[m]! >= 0.35;
	const w = on(11) && on(0);
	const su = on(5) && on(6);
	if (w && su) return null; // there all year
	return w ? "winter" : su ? "summer" : "passage";
}

/** The countries holding the species' records away from India in the given months (one cheap facet request per month). */
async function awayRaw(sci: string, months: number[]): Promise<AwayRaw | null> {
	const counts = new Map<string, number>();
	for (const m of months) {
		const j = await gj<Page>(
			`${BASE}&scientificName=${encodeURIComponent(sci)}&month=${m}&year=2010,2026&facet=country&facetLimit=80&limit=0`,
		);
		for (const c of j?.facets[0]?.counts ?? [])
			if (c.name !== "IN")
				counts.set(c.name, (counts.get(c.name) ?? 0) + c.count);
	}
	const total = [...counts.values()].reduce((a, b) => a + b, 0);
	if (total < 20) return null;
	return {
		months,
		total,
		countries: [...counts].sort((a, b) => b[1] - a[1]).slice(0, 60),
	};
}

// all birds' records per cell: how hard each part of the world is watched
const EFFORT = "scripts/.cache/india-effort.json";
let effort: Cell[] = [];
/** All birds' records per country in each away season. */
const EFFORT_COUNTRIES = "scripts/.cache/india-effort-countries.json";
let watchedCountries: Record<string, Record<string, number>> = {};
const seasonKey = (months: number[]) => months.join(",");
const effortMap = new Map<string, number>();
const cellKey = (lon: number, lat: number) =>
	`${lon.toFixed(2)},${lat.toFixed(2)}`;
async function ensureEffort(fetchMissing: boolean) {
	if (await Bun.file(EFFORT).exists()) effort = await Bun.file(EFFORT).json();
	else if (fetchMissing) {
		effort = await cells(212);
		await Bun.write(EFFORT, JSON.stringify(effort));
	}
	if (await Bun.file(EFFORT_COUNTRIES).exists())
		watchedCountries = await Bun.file(EFFORT_COUNTRIES).json();
	else if (fetchMissing) {
		for (const months of [
			[6, 7],
			[12, 1],
		]) {
			const m = new Map<string, number>();
			for (const month of months) {
				const j = await gj<Page>(
					`${BASE}&taxonKey=212&month=${month}&year=2010,2026&facet=country&facetLimit=300&limit=0`,
				);
				for (const c of j?.facets[0]?.counts ?? [])
					m.set(c.name, (m.get(c.name) ?? 0) + c.count);
			}
			watchedCountries[seasonKey(months)] = Object.fromEntries(m);
		}
		await Bun.write(EFFORT_COUNTRIES, JSON.stringify(watchedCountries));
	}
	for (const [lon, lat, n] of effort) effortMap.set(cellKey(lon, lat), n);
	await ensureCellCountries();
}

let baseYears: Record<number, number[]> = {};
async function ensureBaseYears(fetchMissing: boolean) {
	if (await Bun.file(BASE_YEARS).exists())
		baseYears = await Bun.file(BASE_YEARS).json();
	if (!fetchMissing) return;
	let changed = false;
	await Promise.all(
		YEARS.map(async (y) => {
			if (baseYears[y]) return;
			baseYears[y] = await monthCounts("taxonKey=212", `country=IN&year=${y}`);
			changed = true;
		}),
	);
	if (changed) await Bun.write(BASE_YEARS, JSON.stringify(baseYears));
}

async function fetchRaw(s: Season): Promise<Raw | null> {
	const n = s.months.reduce((a, b) => a + b, 0);
	if (n < MIN_RECORDS) return null;
	const rel = relative(s.months, baseline);
	const kind = kindOf(rel);
	if (!kind) return null;
	const key = await speciesKey(s.sci);
	if (!key)
		return { years: {}, all: [], india: null, skip: "name not found in GBIF" };
	const peak = rel.indexOf(1) + 1;
	const north = kind !== "summer" ? await awayRaw(s.sci, [6, 7]) : undefined;
	const south = kind !== "winter" ? await awayRaw(s.sci, [12, 1]) : undefined;
	// rule out residents and vagrants before the costly work
	if ((kind !== "summer" && !north) || (kind !== "winter" && !south))
		return {
			years: {},
			all: [],
			india: null,
			skip: "no records away from India",
		};
	const years: Record<number, number[]> = {};
	for (const y of YEARS)
		years[y] = await monthCounts(
			`scientificName=${encodeURIComponent(s.sci)}`,
			`country=IN&year=${y}`,
		);
	const all = await cells(key);
	const inCells = await cells(key, "IN");
	return {
		v: 2,
		years,
		all,
		india: inCells.length >= 3 ? { peak, cells: inCells } : null,
		north,
		south,
	};
}

// ---------------------------------------------------------------- estimate
export interface Model {
	id: string;
	name: string;
	sci: string;
	family: string;
	kind: Kind;
	km: number;
	where: string[];
	pop: {
		dep: [number, number, number, number];
		spring: LonLat[];
		wr: number;
		br: number;
	};
	/** Days between the 25th and 75th percentile (interquartile range) of the yearly dates: how much the timing varies from year to year. */
	spread: number;
	/** Years of India records the dates come from. */
	years: number;
	/** Day-of-year dates read from India's records: [leaves, arrives] for a winter visitor, [arrives, leaves] for a summer visitor, [spring, autumn] passage. */
	anchor: [number, number];
	confidence: "ok" | "low";
	flags: string[];
}
export type Result = { model: Model } | { reason: string };

const curve = (rel: number[]): number[] =>
	Array.from({ length: 366 }, (_, d) => {
		const i = MID.findLastIndex((m) => m <= d);
		const a = i < 0 ? 11 : i;
		const b = (a + 1) % 12;
		const da = i < 0 ? d + 365 - MID[11]! : d - MID[a]!;
		const span =
			i < 0 ? MID[0]! + 365 - MID[11]! : (MID[b] ?? MID[0]! + 365) - MID[a]!;
		return rel[a]! + (rel[b]! - rel[a]!) * (da / span);
	});
const cross = (
	c: number[],
	from: number,
	dir: "up" | "down",
	level = 0.5,
): number | null => {
	for (let k = 0; k < 365; k++) {
		const d = ((from - 1 + k) % 365) + 1;
		const prev = c[((d - 2 + 365) % 365) + 1]!;
		if (
			dir === "up"
				? prev < level && c[d]! >= level
				: prev >= level && c[d]! < level
		)
			return d;
	}
	return null;
};
const peakIn = (rel: number[], from: number, to: number) =>
	Array.from({ length: to - from + 1 }, (_, i) => from + i).reduce(
		(b, m) => (rel[m]! > rel[b]! ? m : b),
		from,
	);

/** The two day-of-year dates India's presence is read from, for one year of month counts. */
export function anchors(kind: Kind, rel: number[]): [number, number] | null {
	const c = curve(rel);
	if (kind === "winter") {
		const a = cross(c, 1, "down");
		const b = cross(c, 152, "up");
		return a && b ? [a, b] : null; // [leaves India in spring, arrives in autumn]
	}
	if (kind === "summer") {
		const a = cross(c, 1, "up");
		const b = a ? cross(c, a, "down") : null;
		return a && b ? [a, b] : null; // [arrives in spring, leaves in autumn]
	}
	return [MID[peakIn(rel, 0, 5)]!, MID[peakIn(rel, 6, 11)]!]; // spring and autumn passage
}

/**
 * The other end of the route. The countries holding the species in that season (from the monthly facets) pick out its cells; records
 * mostly show where people watch birds, so each cell is weighted by how large a share of ALL birds recorded there the species is (a
 * rare bird in a thinly watched steppe counts for more than a feral flock among millions of European records), and cells nearer
 * India count a little more: a population visiting India shares a flyway with its neighbours. The densest neighbourhood leads;
 * everything within 2500 km of it forms the range.
 */
function awayCentre(
	a: AwayRaw,
	all: Cell[],
	anchor: LonLat,
	ok: (p: LonLat) => boolean = () => true,
): { c: Centre; countries: string[] } | null {
	// countries where the species is a large share of all birds recorded in this season (a raw count would only name the best
	// watched countries: Osprey in June and July is 77% United States, and Siberia would never make the list)
	const watched = watchedCountries[seasonKey(a.months)] ?? {};
	const rate = a.countries
		.filter(([, n]) => n >= 10)
		.map(([cc, n]) => ({ cc, r: n / ((watched[cc] ?? 0) + 200) }));
	const topRate = Math.max(...rate.map((x) => x.r), 0);
	const chosen = rate
		.filter((x) => x.r >= 0.25 * topRate)
		.sort((x, y) => y.r - x.r);
	const wanted = new Set(chosen.map((x) => x.cc));
	const pts = all
		.filter(
			([lon, lat, n]) =>
				n >= 2 &&
				wanted.has(cellCountry[cellKey(lon, lat)] ?? "") &&
				ok([lon, lat]),
		)
		.map(([lon, lat, n]) => ({
			p: [lon, lat] as LonLat,
			n,
			w:
				(n / ((effortMap.get(cellKey(lon, lat)) ?? 0) + 20)) *
				Math.exp(-km(anchor, [lon, lat]) / 3000),
		}));
	if (pts.length < 3) return null;
	let lead = pts[0]!;
	let best = -1;
	for (const p of pts) {
		const score = pts.reduce((s, q) => (km(p.p, q.p) <= 1200 ? s + q.w : s), 0);
		if (score > best) {
			best = score;
			lead = p;
		}
	}
	const near = pts.filter((p) => km(p.p, lead.p) <= 2500);
	const top = Math.max(...near.map((p) => p.w));
	const joined = near.filter((p) => p.w >= 0.1 * top);
	return {
		c: robustCentre(joined),
		countries: chosen.slice(0, 3).map((x) => x.cc),
	};
}

const slug = (s: string) =>
	s
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "");
const round1 = (n: number) => Math.round(n * 10) / 10;
const pt1 = (p: LonLat): LonLat => [round1(p[0]), round1(p[1])];

export function estimate(s: Season, raw: Raw): Result {
	if (raw.skip) return { reason: raw.skip };
	const rel = relative(s.months, baseline);
	const kind = kindOf(rel);
	if (!kind) return { reason: "present all year" };
	if (!raw.india) return { reason: "too few records in India" };
	const flags: string[] = [];

	// dates: from every year, then the median
	const per: [number, number][] = [];
	for (const y of YEARS) {
		const m = raw.years[y];
		const b = baseYears[y];
		if (!m || !b || m.reduce((a, c) => a + c, 0) < 40) continue;
		const a = anchors(kind, relative(m, b));
		if (a) per.push(a);
	}
	let anchor: [number, number];
	let spread: number;
	if (per.length >= 4) {
		anchor = [median(per.map((p) => p[0])), median(per.map((p) => p[1]))];
		const iqr = (i: 0 | 1) => {
			const v = per.map((p) => p[i]);
			return quantile(v, 0.75) - quantile(v, 0.25);
		};
		spread = Math.max(iqr(0), iqr(1));
	} else {
		const a = anchors(kind, rel);
		if (!a) return { reason: "no clear arrival and departure dates" };
		anchor = a;
		spread = 0;
		flags.push(`dates from ${per.length} years only`);
	}
	if (spread > 30)
		flags.push(`timing varies ${Math.round(spread)} days between years`);

	// places
	const india = robustCentre(
		raw.india.cells.map(([lon, lat, n]) => ({
			p: [lon, lat] as LonLat,
			n,
			w: Math.sqrt(n),
		})),
	);
	const north = raw.north ? awayCentre(raw.north, raw.all, india.pt) : null;
	// a passage migrant's wintering ground lies beyond India from its breeding ground: on the far side of it, not back the way it came
	const beyond = (p: LonLat) => {
		if (!north) return true;
		const dir = (q: LonLat): [number, number] => {
			let dx = q[0] - india.pt[0];
			if (dx > 180) dx -= 360;
			if (dx < -180) dx += 360;
			return [dx * Math.cos(india.pt[1] * RAD), q[1] - india.pt[1]];
		};
		const [a, b] = [dir(north.c.pt), dir(p)];
		const cos =
			(a[0] * b[0] + a[1] * b[1]) / (Math.hypot(...a) * Math.hypot(...b) || 1);
		return cos < -0.6;
	};
	const south = raw.south
		? awayCentre(
				raw.south,
				raw.all,
				india.pt,
				kind === "passage" ? beyond : undefined,
			)
		: null;
	let wp: LonLat[];
	let wr: number;
	let br: number;
	let dep: number[];
	let where: string[];
	const ends: Centre[] = [india];
	if (kind === "winter") {
		if (!north) return { reason: "no breeding ground found" };
		const t = km(india.pt, north.c.pt) / SPEED;
		dep = [anchor[0], anchor[0] + t, anchor[1] - t, anchor[1]];
		wp = [india.pt, mid(india.pt, north.c.pt), north.c.pt];
		[wr, br, where] = [india.rad, north.c.rad, north.countries];
		ends.push(north.c);
	} else if (kind === "summer") {
		if (!south) return { reason: "no wintering ground found" };
		const t = km(india.pt, south.c.pt) / SPEED;
		dep = [anchor[0] - t, anchor[0], anchor[1], anchor[1] + t];
		wp = [south.c.pt, mid(south.c.pt, india.pt), india.pt];
		[wr, br, where] = [south.c.rad, india.rad, south.countries];
		ends.push(south.c);
	} else {
		if (!north || !south)
			return { reason: "no breeding or wintering ground found" };
		const dA = km(south.c.pt, india.pt);
		const dB = km(india.pt, north.c.pt);
		dep = [
			anchor[0] - dA / SPEED,
			anchor[0] + dB / SPEED,
			anchor[1] - dB / SPEED,
			anchor[1] + dA / SPEED,
		];
		wp = [south.c.pt, india.pt, north.c.pt];
		[wr, br, where] = [
			south.c.rad,
			north.c.rad,
			[...north.countries, ...south.countries],
		];
		ends.push(north.c, south.c);
		// a passage migrant whose India waypoint is far off the line between its two ends is a vagrant here
		if ((dA + dB) / Math.max(1, km(wp[0]!, wp[2]!)) > 1.6)
			return { reason: "vagrant: India is far off its route" };
	}
	const trip = km(wp[0]!, wp.at(-1)!);
	if (trip < MIN_KM)
		return { reason: "moves under 400 km: local or altitudinal" };
	if (trip < LOW_KM) flags.push("route under 500 km");
	const d = dep.map((v) => Math.max(1, Math.min(365, Math.round(v)))) as [
		number,
		number,
		number,
		number,
	];
	if (!(d[0] < d[1] && d[1] < d[2] && d[2] < d[3]))
		return { reason: "dates do not fit inside one year" };
	if (ends.some((e) => e.kept < 4 || e.records < 50))
		flags.push("few records at an end of the route");

	// does the model's own timetable reproduce the months India's records show?
	const inIndia = new Array<boolean>(12).fill(false);
	const mark = (a: number, b: number) => {
		for (let day = Math.max(1, a); day <= Math.min(365, b); day += 3)
			inIndia[monthOf(day)] = true;
	};
	if (kind === "winter") {
		mark(d[3], 365);
		mark(1, d[0]);
	} else if (kind === "summer") mark(d[1], d[2]);
	else {
		mark(Math.round(anchor[0]) - 20, Math.round(anchor[0]) + 20);
		mark(Math.round(anchor[1]) - 20, Math.round(anchor[1]) + 20);
	}
	const mismatch = rel.filter((r, i) => inIndia[i] !== r >= 0.35).length;
	if (mismatch > 3)
		flags.push(`model disagrees with India's records in ${mismatch} months`);

	return {
		model: {
			id: slug(s.name),
			name: s.name,
			sci: s.sci,
			family: s.family,
			kind,
			km: Math.round(trip * 2),
			where,
			pop: {
				dep: d,
				spring: wp.map(pt1),
				wr: Math.round(wr),
				br: Math.round(br),
			},
			spread: Math.round(spread),
			years: per.length,
			anchor: [Math.round(anchor[0]), Math.round(anchor[1])],
			confidence: flags.length ? "low" : "ok",
			flags,
		},
	};
}

// ---------------------------------------------------------------- run
export async function estimateAll(only: string[] = []) {
	await ensureBaseYears(false);
	await ensureEffort(false);
	const models: Model[] = [];
	const reasons = new Map<string, number>();
	for (const [code, s] of Object.entries(species)) {
		if (
			only.length &&
			!only.some((o) => s.name.toLowerCase() === o.toLowerCase())
		)
			continue;
		const f = Bun.file(`${RAW}/${code}.json`);
		if (!(await f.exists())) continue;
		const raw = (await f.json()) as Raw;
		if (raw.none) continue;
		const r = estimate(s, raw);
		if ("model" in r) models.push(r.model);
		else reasons.set(r.reason, (reasons.get(r.reason) ?? 0) + 1);
	}
	const seen = new Set<string>();
	for (const m of models) {
		while (seen.has(m.id)) m.id += "-2";
		seen.add(m.id);
	}
	return { models, reasons };
}

if (import.meta.main) {
	const args = process.argv.slice(2);
	const offline = args.includes("--offline");
	const only = args.filter((a) => !a.startsWith("--"));
	const entries = Object.entries(species).filter(
		([, s]) =>
			!only.length ||
			only.some((o) => s.name.toLowerCase() === o.toLowerCase()),
	);

	if (!offline) {
		await ensureBaseYears(true);
		await ensureEffort(true);
		const q = new PQueue({ concurrency: 12 });
		let done = 0;
		let failed = 0;
		await Promise.all(
			entries.map(([code, s]) =>
				q.add(async () => {
					const file = Bun.file(`${RAW}/${code}.json`);
					if (await file.exists()) {
						// files from before the country lists were kept whole: refresh just those two facet requests
						const old = (await file.json()) as Raw;
						if (old.v === 2 || old.none || old.skip) return;
						try {
							if (old.north) old.north = await awayRaw(s.sci, [6, 7]);
							if (old.south) old.south = await awayRaw(s.sci, [12, 1]);
							old.v = 2;
							await Bun.write(file, JSON.stringify(old));
						} catch (e) {
							console.error(s.name, String(e).slice(0, 160));
						}
						return;
					}
					try {
						const raw = await fetchRaw(s);
						await Bun.write(
							file,
							JSON.stringify(
								raw ?? { years: {}, all: [], india: null, none: true },
							),
						);
					} catch (e) {
						failed++;
						console.error(s.name, String(e).slice(0, 160));
					}
					if (++done % 10 === 0)
						process.stderr.write(
							`${done} fetched / ${entries.length}${failed ? ` (${failed} failed, retried on the next run)` : ""}\n`,
						);
				}),
			),
		);
	}

	const { models, reasons } = await estimateAll(only);
	if (!only.length) await Bun.write(OUT, JSON.stringify(models));
	console.log(
		"models:",
		models.length,
		"(low confidence:",
		models.filter((m) => m.confidence === "low").length,
		")",
	);
	console.log("left out:", Object.fromEntries(reasons));
	if (only.length) for (const m of models) console.log(JSON.stringify(m));
}
