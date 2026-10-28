import distance from "@turf/distance";
import { type PreparedSpecies, speciesState, upcoming } from "@/lib/model";

export interface Preset {
	id: string;
	label: string;
	ids: string[];
}

const INDIA: [number, number] = [79, 22];
const NEAR_INDIA_KM = 1500;

/** One-tap groups of species, worked out for day-of-year `d`. */
export function presets(all: PreparedSpecies[], d: number): Preset[] {
	const ids = (f: (s: PreparedSpecies) => boolean) =>
		all.filter(f).map((s) => s.id);
	const soon = upcoming(all, d, 30);
	const byWhat = (prefix: string) => [
		...new Set(
			soon.filter((e) => e.what.startsWith(prefix)).map((e) => e.species.id),
		),
	];
	const list: Preset[] = [
		{
			id: "flying",
			label: "In flight now",
			ids: ids((s) => speciesState(s, d).moving),
		},
		{
			id: "india",
			label: "Near India now",
			ids: ids(
				(s) =>
					distance(INDIA, speciesState(s, d).pos, { units: "kilometers" }) <=
					NEAR_INDIA_KM,
			),
		},
		{ id: "arriving", label: "Arriving this month", ids: byWhat("Reaches") },
		{ id: "leaving", label: "Leaving this month", ids: byWhat("Leaves") },
		{
			id: "winter",
			label: "Winter visitors",
			ids: ids((s) => s.kind === "winter"),
		},
		{
			id: "summer",
			label: "Summer visitors",
			ids: ids((s) => s.kind === "summer"),
		},
		{
			id: "passage",
			label: "Passage migrants",
			ids: ids((s) => s.kind === "passage"),
		},
		{
			id: "hand",
			label: "Hand-modelled",
			ids: ids((s) => s.source !== "estimated"),
		},
	];
	return list.filter((p) => p.ids.length > 0);
}
