import * as v from "valibot";

export type Fetch = typeof fetch;

export class HttpError extends Error {
	constructor(
		readonly status: number,
		url: string,
	) {
		super(`HTTP ${status} for ${url}`);
	}
}

/** GET a URL and validate the JSON against a schema: external APIs are a trust boundary. */
export async function getJson<S extends v.GenericSchema>(
	fetcher: Fetch,
	url: string,
	schema: S,
	init?: RequestInit,
): Promise<v.InferOutput<S>> {
	const res = await fetcher(url, init);
	if (!res.ok) throw new HttpError(res.status, url);
	return v.parse(schema, await res.json());
}
