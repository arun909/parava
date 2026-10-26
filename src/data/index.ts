import type { Species } from "@/lib/model/types";
import evidence from "./evidence.json";
import { RAW_SPECIES } from "./species";

export { REGIONS } from "./species";

const ev = evidence as unknown as Record<
	string,
	NonNullable<Species["pops"][number]["ev"]>
>;

/** Species with the season-audit results merged in. */
export const SPECIES: Species[] = RAW_SPECIES.map((s) => ({
	...s,
	pops: s.pops.map((p) => ({ ...p, ev: ev[`${s.id}/${p.name}`] })),
}));
