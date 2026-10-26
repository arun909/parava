import distance from "@turf/distance";
import {
	type Phase,
	type PreparedPop,
	type PreparedSpecies,
	popState,
} from "./motion";

const span = (from: number, to: number) => (to - from + 365) % 365 || 365;

export interface Leg {
	from: number;
	to: number;
	days: number;
	km: number;
	kmPerDay: number;
}

/** Timing and distance of both migrations of a population (day-of-year from/to, route length). */
export function legStats(p: PreparedPop) {
	const leg = (from: number, to: number, km: number): Leg => {
		const days = span(from, to);
		return { from, to, days, km, kmPerDay: km / days };
	};
	const spring = leg(p.dep[0], p.dep[1], p.sp.len);
	const autumn = leg(p.dep[2], p.dep[3], p.au.len);
	return { spring, autumn, roundTripKm: spring.km + autumn.km };
}

export interface Visit {
	/** Day-of-year ranges (inclusive) when a population is within reach, merged across populations. */
	ranges: [number, number][];
	closestKm: number;
	closestDay: number;
	phase: Phase;
}

/** When, over the year, birds of this species are within `radiusKm` of a place (null if never). */
export function visitWindow(
	s: PreparedSpecies,
	lon: number,
	lat: number,
	radiusKm = 700,
): Visit | null {
	const near = new Array<boolean>(366).fill(false);
	let best: Visit | null = null;
	for (const p of s.pops)
		for (let d = 1; d <= 365; d++) {
			const st = popState(p, d);
			const km = distance([lon, lat], st.pos, { units: "kilometers" });
			if (km > radiusKm) continue;
			near[d] = true;
			if (!best || km < best.closestKm)
				best = { ranges: [], closestKm: km, closestDay: d, phase: st.phase };
		}
	if (!best) return null;
	// contiguous runs, joining the end of the year to the start
	const runs: [number, number][] = [];
	for (let d = 1; d <= 365; d++) {
		if (!near[d]) continue;
		const last = runs.at(-1);
		if (last && last[1] === d - 1) last[1] = d;
		else runs.push([d, d]);
	}
	const first = runs[0];
	const last = runs.at(-1);
	if (runs.length > 1 && first && last && first[0] === 1 && last[1] === 365) {
		runs.pop();
		runs[0] = [last[0], first[1]];
	}
	best.ranges = runs;
	return best;
}
