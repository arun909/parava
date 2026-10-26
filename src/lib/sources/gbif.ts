import * as v from "valibot";
import type { Sighting } from "@/lib/model";
import type { Box } from "./boxes";
import { type Fetch, getJson } from "./http";

const Occurrences = v.object({
	results: v.array(
		v.object({
			decimalLatitude: v.nullish(v.number()),
			decimalLongitude: v.nullish(v.number()),
			eventDate: v.nullish(v.string()),
			stateProvince: v.nullish(v.string()),
			country: v.nullish(v.string()),
		}),
	),
});

const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** Human observations inside a box since a given time. */
export async function gbifOccurrences(
	fetcher: Fetch,
	sci: string,
	box: Box,
	sinceMs: number,
	nowMs = Date.now(),
): Promise<Sighting[]> {
	const [w, e, s, n] = box;
	const url =
		`https://api.gbif.org/v1/occurrence/search?scientificName=${encodeURIComponent(sci)}&hasCoordinate=true&hasGeospatialIssue=false` +
		`&basisOfRecord=HUMAN_OBSERVATION&eventDate=${day(sinceMs)},${day(nowMs)}` +
		`&decimalLongitude=${w.toFixed(2)},${e.toFixed(2)}&decimalLatitude=${s.toFixed(2)},${n.toFixed(2)}&limit=200`;
	const { results } = await getJson(fetcher, url, Occurrences);
	return results.flatMap((o) =>
		o.decimalLatitude == null || o.decimalLongitude == null
			? []
			: [
					{
						lon: o.decimalLongitude,
						lat: o.decimalLatitude,
						t: Date.parse(String(o.eventDate).split("/")[0] ?? ""),
						place: [o.stateProvince, o.country]
							.filter(Boolean)
							.join(", ")
							.slice(0, 60),
						src: "GBIF" as const,
					},
				],
	);
}

const Facets = v.object({
	facets: v.array(
		v.object({
			counts: v.array(v.object({ name: v.string(), count: v.number() })),
		}),
	),
});

/** Historical records per calendar month (index 0 = January) inside a box: used by the season audit. */
export async function gbifMonthHistogram(
	fetcher: Fetch,
	sci: string,
	box: Box,
	years = "2008,2026",
): Promise<number[]> {
	const [w, e, s, n] = box;
	const url =
		`https://api.gbif.org/v1/occurrence/search?scientificName=${encodeURIComponent(sci)}&hasCoordinate=true&hasGeospatialIssue=false` +
		`&year=${years}&decimalLongitude=${w.toFixed(1)},${e.toFixed(1)}&decimalLatitude=${s.toFixed(1)},${n.toFixed(1)}&facet=month&facetLimit=12&limit=0`;
	const { facets } = await getJson(fetcher, url, Facets);
	const out = new Array<number>(12).fill(0);
	for (const c of facets[0]?.counts ?? []) out[Number(c.name) - 1] = c.count;
	return out;
}

const Match = v.object({
	status: v.optional(v.string()),
	species: v.optional(v.string()),
	matchType: v.optional(v.string()),
});

/** How GBIF's backbone sees a scientific name (ACCEPTED, SYNONYM, ...). */
export async function gbifMatch(fetcher: Fetch, sci: string) {
	return getJson(
		fetcher,
		`https://api.gbif.org/v1/species/match?kingdom=Animalia&name=${encodeURIComponent(sci)}`,
		Match,
	);
}
