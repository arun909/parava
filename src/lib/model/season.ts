import { SPECIES } from "@/data";
import type { Phase, PreparedPop, PreparedSpecies } from "./motion";

export const MONTHS = [
	"Jan",
	"Feb",
	"Mar",
	"Apr",
	"May",
	"Jun",
	"Jul",
	"Aug",
	"Sep",
	"Oct",
	"Nov",
	"Dec",
] as const;
/** Day-of-year of the day before each month starts. */
export const MSTART = [
	0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334,
] as const;

export const PHASE_LABEL: Record<Phase, string> = {
	spring: "Spring ▲",
	autumn: "Autumn ▼",
	breeding: "Breeding",
	wintering: "Wintering",
};

/** The same, in words for a list, where an arrow would read as a control. */
export const PHASE_TEXT: Record<Phase, string> = {
	spring: "Heading north",
	autumn: "Heading south",
	breeding: "Breeding",
	wintering: "Wintering",
};

/** Day of year as a fraction: 1.0 is 1 January 00:00 local time. */
export function dayOfYear(date = new Date()): number {
	return (
		(date.getTime() - new Date(date.getFullYear(), 0, 0).getTime()) / 864e5
	);
}

/** Calendar date for a day-of-year in the given year. */
export const dateOfDay = (d: number, year = new Date().getFullYear()) =>
	new Date(year, 0, Math.floor(d));
export const formatDay = (d: number, year?: number) =>
	dateOfDay(d, year).toLocaleDateString(undefined, {
		day: "numeric",
		month: "short",
	});

export const seasonName = (d: number) =>
	d < 80 || d >= 355
		? "Winter"
		: d < 172
			? "Spring"
			: d < 266
				? "Summer"
				: "Autumn";

export interface FlightEvent {
	species: PreparedSpecies;
	pop: PreparedPop;
	day: number;
	what: string;
	/** Days from d until the event. */
	in: number;
}

const WHAT = [
	"Leaves wintering grounds",
	"Reaches breeding grounds",
	"Leaves breeding grounds",
	"Reaches wintering grounds",
] as const;

/** Flight events in the next `days` days, soonest first. */
export function upcoming(
	species: PreparedSpecies[],
	d: number,
	days = 30,
): FlightEvent[] {
	const out: FlightEvent[] = [];
	for (const s of species)
		for (const pop of s.pops)
			pop.dep.forEach((day, k) => {
				const inDays = Math.round((day - d + 365) % 365);
				if (inDays <= days)
					out.push({ species: s, pop, day, what: WHAT[k]!, in: inDays });
			});
	return out.sort((a, b) => a.in - b.in);
}

export interface NextEvent {
	what: string;
	in: number;
	day: number;
}

/** The next flight event of a population. */
export function nextEvent(pop: PreparedPop, d: number): NextEvent {
	let best: NextEvent | null = null;
	pop.dep.forEach((day, k) => {
		const inDays = Math.round((day - d + 365) % 365);
		if (!best || inDays < best.in) best = { what: WHAT[k]!, in: inDays, day };
	});
	return best!;
}

/** How many wintering / breeding grounds could be checked against historical records, and how many show clear seasonality. */
export function evidenceStats() {
	let checked = 0;
	let good = 0;
	let total = 0;
	// the audit covers the hand-modelled species; estimated ones are derived from the same records
	for (const s of SPECIES.filter((x) => x.source === "curated"))
		for (const p of s.pops)
			for (const k of ["w", "b"] as const) {
				total++;
				const e = p.ev?.[k];
				if (e) {
					checked++;
					if (e[0] >= e[1] + 10) good++;
				}
			}
	return { checked, good, total };
}

const INDIA = { w: 68, e: 97.5, s: 6, n: 36 };
/** Does any route of the species pass through India? */
export const touchesIndia = (s: PreparedSpecies) =>
	s.pops.some((p) =>
		[p.sp, p.au].some((r) =>
			r.pts.some(
				([lon, lat]) =>
					lon >= INDIA.w && lon <= INDIA.e && lat >= INDIA.s && lat <= INDIA.n,
			),
		),
	);
