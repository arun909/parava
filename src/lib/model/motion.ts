import { at, prepareRoute, type Route } from "./geo";
import type { LonLat, Population, Species } from "./types";

export type Phase = "spring" | "breeding" | "autumn" | "wintering";

export interface PreparedPop extends Population {
	sp: Route;
	au: Route;
}
export interface PreparedSpecies extends Omit<Species, "pops"> {
	pops: PreparedPop[];
}

/** Smoothstep: birds speed up and slow down along a leg. */
const ease = (t: number) => t * t * (3 - 2 * t);

export function prepare(s: Species): PreparedSpecies {
	return {
		...s,
		pops: s.pops.map((p) => ({
			...p,
			sp: prepareRoute(p.spring),
			au: prepareRoute(p.autumn ?? p.spring.slice().reverse()),
		})),
	};
}

export interface PopState {
	pos: LonLat;
	phase: Phase;
	/** Progress along the current leg (0..1; 1 while breeding, 0 while wintering). */
	f: number;
	/** The route being flown, if migrating. */
	route?: Route;
}

export const isMoving = (m: { phase: Phase }) =>
	m.phase === "spring" || m.phase === "autumn";

/** Where a population is on day-of-year d. */
export function popState(p: PreparedPop, d: number): PopState {
	const [d0, d1, d2, d3] = p.dep;
	if (d >= d0 && d < d1) {
		const f = ease((d - d0) / (d1 - d0));
		return { pos: at(p.sp, f), phase: "spring", f, route: p.sp };
	}
	if (d >= d1 && d < d2)
		return { pos: p.sp.pts.at(-1)!, phase: "breeding", f: 1 };
	if (d >= d2 && d < d3) {
		const f = ease((d - d2) / (d3 - d2));
		return { pos: at(p.au, f), phase: "autumn", f, route: p.au };
	}
	return { pos: p.au.pts.at(-1)!, phase: "wintering", f: 0 };
}

export interface SpeciesState extends PopState {
	pops: PopState[];
	/** Index of the representative population: the heaviest migrating one, else the heaviest overall. */
	main: number;
	moving: boolean;
}

export function speciesState(s: PreparedSpecies, d: number): SpeciesState {
	const pops = s.pops.map((p) => popState(p, d));
	let main = -1;
	pops.forEach((m, i) => {
		if (isMoving(m) && (main < 0 || s.pops[i]!.w > s.pops[main]!.w)) main = i;
	});
	if (main < 0) {
		main = 0;
		s.pops.forEach((p, i) => {
			if (p.w > s.pops[main]!.w) main = i;
		});
	}
	return { ...pops[main]!, pops, main, moving: pops.some(isMoving) };
}
