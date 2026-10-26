import distance from "@turf/distance";
import { lineString, point } from "@turf/helpers";
import nearestPointOnLine from "@turf/nearest-point-on-line";
import type { Feature, LineString } from "geojson";
import type { Route } from "./geo";
import type { PreparedSpecies } from "./motion";

export type Source = "iNaturalist" | "GBIF" | "eBird";

export interface Sighting {
	lon: number;
	lat: number;
	/** Epoch ms. */
	t: number;
	place: string;
	src: Source;
	img?: string;
	attr?: string;
	link?: string;
}

/** W = near the wintering ground, B = near the breeding ground, M = in between. */
export type Zone = "W" | "B" | "M";

/** Where a sighting sits on one flyway leg. */
export interface Hit {
	pop: number;
	/** 0 = spring route, 1 = autumn route. */
	leg: 0 | 1;
	/** Fraction along the route (0..1). */
	u: number;
	zone: Zone;
}

export interface InFlyway extends Sighting {
	hits: Hit[];
}

export interface Classified {
	items: InFlyway[];
	/** Distinct reports considered, before the flyway filter. */
	total: number;
	/** Reports outside every flyway (other populations, feral or vagrant birds). */
	dropped: number;
}

/** Reports within this distance of a route count as being on the flyway. */
export const CORRIDOR_KM = 700;

export const zoneOf = (leg: 0 | 1, u: number): Zone =>
	leg === 0
		? u < 0.3
			? "W"
			: u > 0.7
				? "B"
				: "M"
		: u < 0.3
			? "B"
			: u > 0.7
				? "W"
				: "M";

interface Line {
	feature: Feature<LineString>;
	minLat: number;
	maxLat: number;
	minLon: number;
	maxLon: number;
}
const lines = new WeakMap<Route, Line>();
function lineOf(r: Route): Line {
	let l = lines.get(r);
	if (!l) {
		const lats = r.wp.map((p) => p[1]);
		const lons = r.wp.map((p) => p[0]);
		l = {
			feature: lineString(r.wp),
			minLat: Math.min(...lats),
			maxLat: Math.max(...lats),
			minLon: Math.min(...lons),
			maxLon: Math.max(...lons),
		};
		lines.set(r, l);
	}
	return l;
}

/** Which flyway legs a point lies along (within the corridor), plus the wintering / breeding ranges. */
export function hitsFor(sp: PreparedSpecies, lon: number, lat: number): Hit[] {
	const hits: Hit[] = [];
	const pt = point([lon, lat]);
	sp.pops.forEach((p, pop) => {
		([p.sp, p.au] as const).forEach((r, leg) => {
			const l = lineOf(r);
			// cheap bounding-box test before the geodesic search
			const margin = 8;
			if (lat < l.minLat - margin || lat > l.maxLat + margin) return;
			const lonAdj =
				lon + 360 * Math.round(((l.minLon + l.maxLon) / 2 - lon) / 360);
			const lonMargin = Math.min(
				180,
				margin / Math.max(0.1, Math.cos((lat * Math.PI) / 180)),
			);
			if (lonAdj < l.minLon - lonMargin || lonAdj > l.maxLon + lonMargin)
				return;
			const near = nearestPointOnLine(l.feature, point([lonAdj, lat]));
			if (near.properties.dist <= CORRIDOR_KM) {
				const u = Math.min(1, Math.max(0, near.properties.location / r.wpLen));
				hits.push({
					pop,
					leg: leg as 0 | 1,
					u: +u.toFixed(3),
					zone: zoneOf(leg as 0 | 1, u),
				});
			}
		});
		const w = p.au.pts.at(-1)!;
		const b = p.sp.pts.at(-1)!;
		if (distance(pt, w) <= (p.wr ?? 900))
			hits.push({ pop, leg: 1, u: 1, zone: "W" });
		if (distance(pt, b) <= (p.br ?? 700))
			hits.push({ pop, leg: 0, u: 1, zone: "B" });
	});
	return hits;
}

/** Drop duplicates (prefer the copy with a photo) and keep reports along a flyway. */
export function classify(sp: PreparedSpecies, raw: Sighting[]): Classified {
	const seen = new Set<string>();
	const items: InFlyway[] = [];
	let total = 0;
	for (const o of [...raw].sort((a, b) => Number(!!b.img) - Number(!!a.img))) {
		if (
			!Number.isFinite(o.t) ||
			!Number.isFinite(o.lat) ||
			!Number.isFinite(o.lon)
		)
			continue;
		const key = `${o.lat.toFixed(3)},${o.lon.toFixed(3)},${Math.floor(o.t / 864e5)}`;
		if (seen.has(key)) continue;
		seen.add(key);
		total++;
		const hits = hitsFor(sp, o.lon, o.lat);
		if (hits.length) items.push({ ...o, hits });
	}
	return { items, total, dropped: total - items.length };
}
