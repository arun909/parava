import distance from "@turf/distance";
import type { LonLat } from "./types";

const RAD = Math.PI / 180;

export interface Route {
	/** Smoothed points along the route; longitudes are continuous across the dateline (may exceed 180). */
	pts: LonLat[];
	/** Cumulative distance along `pts`, km. */
	cum: number[];
	/** Total length, km. */
	len: number;
	/** The original waypoints, with the same continuous longitudes. */
	wp: LonLat[];
	/** Length of the waypoint polyline, km. */
	wpLen: number;
}

const toVec = ([lon, lat]: LonLat): [number, number, number] => {
	const a = lat * RAD;
	const b = lon * RAD;
	return [Math.cos(a) * Math.cos(b), Math.cos(a) * Math.sin(b), Math.sin(a)];
};

/** Keep consecutive longitudes within 180 degrees of each other. */
function unwrap(route: LonLat[]): LonLat[] {
	const out: LonLat[] = [[route[0]![0], route[0]![1]]];
	for (let i = 1; i < route.length; i++) {
		let [x, y] = route[i]!;
		const px = out[i - 1]![0];
		x += 360 * Math.round((px - x) / 360);
		out.push([x, y]);
	}
	return out;
}

const polylineKm = (pts: LonLat[]) =>
	pts.slice(1).reduce((a, p, i) => a + distance(pts[i]!, p), 0);

/**
 * Smooth a route on the sphere: Catmull-Rom on unit vectors, so polar and ocean crossings follow great-circle-like curves.
 * No library offers a smooth spline on a sphere; distances and everything around it use turf.
 */
export function prepareRoute(route: LonLat[]): Route {
	const wp = unwrap(route);
	const V = wp.map(toVec);
	const n = V.length;
	const p = (i: number) => V[Math.max(0, Math.min(n - 1, i))]!;
	const pts: LonLat[] = [];
	let prev = wp[0]![0];
	const push = (v: number[]) => {
		const m = Math.hypot(v[0]!, v[1]!, v[2]!);
		let lon = Math.atan2(v[1]!, v[0]!) / RAD;
		lon += 360 * Math.round((prev - lon) / 360);
		prev = lon;
		pts.push([lon, Math.asin(v[2]! / m) / RAD]);
	};
	for (let i = 0; i < n - 1; i++) {
		for (let s = 0; s < 10; s++) {
			const t = s / 10;
			const [a, b, c, d] = [p(i - 1), p(i), p(i + 1), p(i + 2)];
			push(
				[0, 1, 2].map(
					(k) =>
						0.5 *
						(2 * b[k]! +
							(-a[k]! + c[k]!) * t +
							(2 * a[k]! - 5 * b[k]! + 4 * c[k]! - d[k]!) * t * t +
							(-a[k]! + 3 * b[k]! - 3 * c[k]! + d[k]!) * t * t * t),
				),
			);
		}
	}
	push(V[n - 1]!);
	const cum = [0];
	for (let i = 1; i < pts.length; i++)
		cum.push(cum[i - 1]! + distance(pts[i - 1]!, pts[i]!));
	return { pts, cum, len: cum[cum.length - 1]!, wp, wpLen: polylineKm(wp) };
}

/** Position at fraction f (0..1) of the route's length. */
export function at(r: Route, f: number): LonLat {
	const d = Math.max(0, Math.min(1, f)) * r.len;
	let lo = 0;
	let hi = r.cum.length - 1;
	while (hi - lo > 1) {
		const m = (lo + hi) >> 1;
		if (r.cum[m]! < d) lo = m;
		else hi = m;
	}
	const seg = r.cum[hi]! - r.cum[lo]! || 1;
	const t = (d - r.cum[lo]!) / seg;
	const a = r.pts[lo]!;
	const b = r.pts[hi]!;
	return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

/** The part of the route already flown at fraction f. */
export function sliceTo(r: Route, f: number): LonLat[] {
	const d = Math.max(0, Math.min(1, f)) * r.len;
	let lo = 0;
	let hi = r.cum.length - 1;
	while (hi - lo > 1) {
		const m = (lo + hi) >> 1;
		if (r.cum[m]! < d) lo = m;
		else hi = m;
	}
	return r.pts.slice(0, hi).concat([at(r, f)]);
}
