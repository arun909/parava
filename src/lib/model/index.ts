import { SPECIES } from "@/data";
import { type PreparedSpecies, prepare } from "./motion";

/** All species, with their routes smoothed and ready to use. */
export const PREPARED: PreparedSpecies[] = SPECIES.map(prepare);
export const speciesById = (id: string) => PREPARED.find((s) => s.id === id);

export * from "./confidence";
export * from "./geo";
export * from "./motion";
export * from "./season";
export * from "./sightings";
export * from "./travel";
export * from "./types";
