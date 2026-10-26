import * as v from "valibot";
import type { Sighting } from "@/lib/model";
import { type Fetch, getJson } from "./http";

const API = "https://api.ebird.org/v2";
const Taxonomy = v.array(
	v.object({ sciName: v.string(), speciesCode: v.string() }),
);
const Observations = v.array(
	v.object({
		lat: v.number(),
		lng: v.number(),
		obsDt: v.string(),
		locName: v.nullish(v.string()),
		subId: v.nullish(v.string()),
		obsValid: v.optional(v.boolean()),
	}),
);

/** eBird needs your own free API key (https://ebird.org/api/keygen); it is only ever sent to api.ebird.org. */
const headers = (key: string) => ({ "X-eBirdApiToken": key });

/** eBird species code for each scientific name, from the eBird taxonomy. */
export async function ebirdCodes(
	fetcher: Fetch,
	key: string,
	sciNames: string[],
): Promise<Record<string, string>> {
	const tax = await getJson(
		fetcher,
		`${API}/ref/taxonomy/ebird?fmt=json&cat=species&locale=en`,
		Taxonomy,
		{ headers: headers(key) },
	);
	const wanted = new Set(sciNames);
	return Object.fromEntries(
		tax
			.filter((t) => wanted.has(t.sciName))
			.map((t) => [t.sciName, t.speciesCode]),
	);
}

/** Recent observations of one species in one region (a country or state code such as IN or IN-KL). */
export async function ebirdRecent(
	fetcher: Fetch,
	key: string,
	region: string,
	code: string,
	backDays = 14,
): Promise<Sighting[]> {
	const url = `${API}/data/obs/${region.trim().toUpperCase()}/recent/${code}?back=${backDays}&maxResults=300&includeProvisional=true`;
	const obs = await getJson(fetcher, url, Observations, {
		headers: headers(key),
	});
	return obs
		.filter((o) => o.obsValid !== false)
		.map((o) => ({
			lon: o.lng,
			lat: o.lat,
			t: Date.parse(o.obsDt.replace(" ", "T")),
			place: (o.locName ?? "").slice(0, 60),
			src: "eBird" as const,
			link: o.subId ? `https://ebird.org/checklist/${o.subId}` : undefined,
		}));
}
