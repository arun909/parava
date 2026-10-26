import type { LonLat, PreparedPop } from "@/lib/model";

/** [west, east, south, north] */
export type Box = [number, number, number, number];

/** Boxes around a population's flyway, split at the dateline so API bounding-box queries stay valid. */
export function flywayBoxes(pop: PreparedPop, margin = 6): Box[] {
	// the spring and autumn routes are unwrapped from different starting points: align them before merging their extents
	const ext = [pop.sp, pop.au].map((r) => {
		const lons = r.pts.map((p) => p[0]);
		return { a: Math.min(...lons) - margin, b: Math.max(...lons) + margin };
	});
	const shift =
		360 * Math.round((ext[0]!.a + ext[0]!.b - ext[1]!.a - ext[1]!.b) / 720);
	let a = Math.min(ext[0]!.a, ext[1]!.a + shift);
	let b = Math.max(ext[0]!.b, ext[1]!.b + shift);
	const k = Math.floor((a + 180) / 360);
	a -= 360 * k;
	b -= 360 * k;
	const lats = [...pop.sp.pts, ...pop.au.pts].map((p) => p[1]);
	const south = Math.max(-85, Math.min(...lats) - margin);
	const north = Math.min(85, Math.max(...lats) + margin);
	if (b - a >= 360) return [[-180, 180, south, north]];
	if (b > 180)
		return [
			[a, 180, south, north],
			[-180, b - 360, south, north],
		];
	return [[a, b, south, north]];
}

/** Boxes of +/- r degrees around a point, split at the dateline (a single box would have west > east). */
export function pointBoxes([lon, lat]: LonLat, r = 6): Box[] {
	const l = ((((lon + 180) % 360) + 360) % 360) - 180;
	const south = Math.max(-85, lat - r);
	const north = Math.min(85, lat + r);
	if (l - r < -180)
		return [
			[l - r + 360, 180, south, north],
			[-180, l + r, south, north],
		];
	if (l + r > 180)
		return [
			[l - r, 180, south, north],
			[-180, l + r - 360, south, north],
		];
	return [[l - r, l + r, south, north]];
}
