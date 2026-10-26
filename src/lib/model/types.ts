/** [longitude, latitude] in degrees. */
export type LonLat = [lon: number, lat: number];

/** Season audit result for one ground: [share of records in modelled months %, share expected by chance %, records]. */
export type EvidenceCell = [share: number, chance: number, records: number];

export interface Evidence {
	/** Wintering ground. */
	w?: EvidenceCell;
	/** Breeding ground. */
	b?: EvidenceCell;
}

export interface Population {
	name: string;
	/** Share of the species' birds in this flyway (0..1). */
	w: number;
	/** Day-of-year: [spring departs, spring arrives, autumn departs, autumn arrives]. */
	dep: [number, number, number, number];
	/** Winter ground to breeding ground. */
	spring: LonLat[];
	/** Breeding ground to winter ground; defaults to the spring route reversed. */
	autumn?: LonLat[];
	/** Km around the wintering ground where sightings still count (default 900). */
	wr?: number;
	/** Km around the breeding ground where sightings still count (default 700). */
	br?: number;
	ev?: Evidence;
}

export interface Species {
	id: string;
	name: string;
	sci: string;
	color: string;
	/** Rough distance flown per year, km. */
	km: number;
	fact: string;
	pops: Population[];
}

export interface Region {
	id: string;
	name: string;
	/** [[west, south], [east, north]] */
	box: [LonLat, LonLat];
}
