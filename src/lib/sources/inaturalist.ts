import * as v from "valibot";
import type { Sighting } from "@/lib/model";
import type { Box } from "./boxes";
import { type Fetch, getJson } from "./http";

const Observations = v.object({
	results: v.array(
		v.object({
			geojson: v.nullish(
				v.object({ coordinates: v.tuple([v.number(), v.number()]) }),
			),
			time_observed_at: v.nullish(v.string()),
			observed_on: v.nullish(v.string()),
			place_guess: v.nullish(v.string()),
			uri: v.optional(v.string()),
			photos: v.optional(
				v.array(
					v.object({
						url: v.string(),
						license_code: v.nullish(v.string()),
						attribution: v.nullish(v.string()),
					}),
				),
			),
		}),
	),
});

const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** Research-grade, non-captive observations inside a box since a given time. Open-licensed photos only. */
export async function inatObservations(
	fetcher: Fetch,
	sci: string,
	box: Box,
	sinceMs: number,
): Promise<Sighting[]> {
	const [w, e, s, n] = box;
	const url =
		`https://api.inaturalist.org/v1/observations?taxon_name=${encodeURIComponent(sci)}&d1=${day(sinceMs)}&geo=true` +
		`&quality_grade=research&captive=false&per_page=200&order_by=observed_on&order=desc` +
		`&swlng=${w.toFixed(2)}&nelng=${e.toFixed(2)}&swlat=${s.toFixed(2)}&nelat=${n.toFixed(2)}`;
	const { results } = await getJson(fetcher, url, Observations);
	return results.flatMap((o) => {
		if (!o.geojson) return [];
		const [lon, lat] = o.geojson.coordinates;
		const photo = o.photos?.find((p) => p.license_code);
		return [
			{
				lon,
				lat,
				t: Date.parse(o.time_observed_at ?? o.observed_on ?? ""),
				place: (o.place_guess ?? "").slice(0, 60),
				src: "iNaturalist" as const,
				img: photo?.url.replace("/square.", "/medium."),
				attr: photo?.attribution ?? undefined,
				link: o.uri,
			},
		];
	});
}

const Taxa = v.object({
	results: v.array(
		v.object({
			observations_count: v.optional(v.number()),
			conservation_status: v.nullish(
				v.object({ status: v.nullish(v.string()) }),
			),
			conservation_statuses: v.optional(
				v.array(
					v.object({
						status: v.nullish(v.string()),
						authority: v.nullish(v.string()),
						place: v.nullish(v.unknown()),
					}),
				),
			),
		}),
	),
});

export interface TaxonInfo {
	/** IUCN code such as "LC" or "CR", if iNaturalist has one. */
	iucn: string;
	/** Research-grade observations worldwide. */
	observations: number;
}

export async function inatTaxon(
	fetcher: Fetch,
	sci: string,
): Promise<TaxonInfo | null> {
	const { results } = await getJson(
		fetcher,
		`https://api.inaturalist.org/v1/taxa?rank=species&per_page=1&q=${encodeURIComponent(sci)}`,
		Taxa,
	);
	const t = results[0];
	if (!t) return null;
	const global =
		t.conservation_status ??
		t.conservation_statuses?.find(
			(c) => c.authority === "IUCN Red List" && !c.place,
		);
	return {
		iucn: global?.status ? global.status.toUpperCase() : "",
		observations: t.observations_count ?? 0,
	};
}
