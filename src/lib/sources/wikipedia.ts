import * as v from "valibot";
import { type Fetch, getJson } from "./http";

const Summary = v.object({
	extract: v.optional(v.string()),
	thumbnail: v.optional(v.object({ source: v.string() })),
	originalimage: v.optional(v.object({ source: v.string() })),
	content_urls: v.optional(
		v.object({ desktop: v.object({ page: v.string() }) }),
	),
});

export interface WikiSummary {
	extract: string;
	thumb: string;
	original: string;
	url: string;
}

/** Wikipedia page summary for a species by its scientific name (redirects are followed). */
export async function wikiSummary(
	fetcher: Fetch,
	sci: string,
): Promise<WikiSummary> {
	const s = await getJson(
		fetcher,
		`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(sci.replace(/ /g, "_"))}`,
		Summary,
	);
	return {
		extract: s.extract ?? "",
		thumb: s.thumbnail?.source ?? "",
		original: s.originalimage?.source ?? "",
		url: s.content_urls?.desktop.page ?? "",
	};
}
