import PQueue from "p-queue";
import type { PreparedSpecies, Sighting } from "@/lib/model";
import { flywayBoxes } from "./boxes";
import { ebirdRecent } from "./ebird";
import { gbifOccurrences } from "./gbif";
import type { Fetch } from "./http";
import { inatObservations } from "./inaturalist";

export interface Queues {
	inat: PQueue;
	gbif: PQueue;
}

/** iNaturalist allows about 60 requests a minute, so it is paced to roughly one a second; GBIF is more generous. */
export const makeQueues = (paced = true): Queues => ({
	inat: new PQueue(
		paced
			? { concurrency: 1, interval: 1100, intervalCap: 1 }
			: { concurrency: 4 },
	),
	gbif: new PQueue({ concurrency: 3 }),
});
export const defaultQueues = makeQueues();

export interface SyncOptions {
	fetch: Fetch;
	/** Epoch ms: only reports since then. */
	since: number;
	queues?: Queues;
}

/**
 * Recent reports for one species along every one of its flyways, from iNaturalist and GBIF. Individual request failures are
 * tolerated (the other source still counts); it only throws if every request failed.
 */
export async function fetchSightings(
	sp: PreparedSpecies,
	{ fetch, since, queues = defaultQueues }: SyncOptions,
): Promise<Sighting[]> {
	const jobs: Promise<Sighting[]>[] = [];
	for (const pop of sp.pops)
		for (const box of flywayBoxes(pop)) {
			jobs.push(
				queues.inat.add(() =>
					inatObservations(fetch, sp.sci, box, since),
				) as Promise<Sighting[]>,
			);
			jobs.push(
				queues.gbif.add(() =>
					gbifOccurrences(fetch, sp.sci, box, since),
				) as Promise<Sighting[]>,
			);
		}
	const settled = await Promise.allSettled(jobs);
	const ok = settled.filter(
		(r): r is PromiseFulfilledResult<Sighting[]> => r.status === "fulfilled",
	);
	if (!ok.length)
		throw new AggregateError(
			settled.map((r) => (r as PromiseRejectedResult).reason),
			`All ${settled.length} requests failed for ${sp.name}`,
		);
	return ok.flatMap((r) => r.value);
}

/** eBird reports for one species in the regions you listed (needs an API key and the species' eBird code). */
export async function fetchEbird(
	fetch: Fetch,
	key: string,
	regions: string[],
	code: string,
): Promise<Sighting[]> {
	const all = await Promise.all(
		regions.map((r) => ebirdRecent(fetch, key, r, code)),
	);
	return all.flat();
}
