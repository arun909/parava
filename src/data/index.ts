import type { Species } from "@/lib/model/types";
import { ESTIMATED } from "./estimated";
import evidence from "./evidence.json";
import { RAW_SPECIES } from "./species";

export { REGIONS } from "./species";

const ev = evidence as unknown as Record<
	string,
	NonNullable<Species["pops"][number]["ev"]>
>;

const CURATED: Species[] = RAW_SPECIES.map((s) => ({
	...s,
	source: "curated" as const,
	pops: s.pops.map((p) => ({ ...p, ev: ev[`${s.id}/${p.name}`] })),
}));
// match by scientific name or id: the eBird and GBIF names of a species can differ (Grus virgo / Anthropoides virgo)
const known = new Set(CURATED.flatMap((s) => [s.sci, s.id]));

/** Hand-modelled flyways first, then the estimated India migrants (without any species already modelled by hand). */
export const SPECIES: Species[] = [
	...CURATED,
	...ESTIMATED.filter((s) => !known.has(s.sci) && !known.has(s.id)),
];
