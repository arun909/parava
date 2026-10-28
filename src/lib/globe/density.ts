import { at, type LonLat, type PreparedSpecies, popState } from "@/lib/model";

export interface Weighted {
	pos: LonLat;
	w: number;
}

const KM_PER_DEG = 111.2;
const GOLDEN = Math.PI * (3 - Math.sqrt(5));

/** `n` points spread evenly over a disc of `km` radius around a position (a sunflower pattern). */
function disc(
	[lon, lat]: LonLat,
	km: number,
	n: number,
	w: number,
): Weighted[] {
	const cos = Math.max(0.2, Math.cos((lat * Math.PI) / 180));
	return Array.from({ length: n }, (_, i) => {
		const r = (km / KM_PER_DEG) * Math.sqrt((i + 0.5) / n);
		const a = i * GOLDEN;
		return {
			pos: [
				lon + (r * Math.cos(a)) / cos,
				Math.max(-85, Math.min(85, lat + r * Math.sin(a))),
			] as LonLat,
			w: w / n,
		};
	});
}

/**
 * Where the birds are on day `d` as weighted points, for a heat map: each species counts once (split over its populations by
 * share). Birds on their grounds fill a disc the size of that ground; birds in flight are a stream trailing the flock along its route.
 */
export function density(species: PreparedSpecies[], d: number): Weighted[] {
	const out: Weighted[] = [];
	for (const s of species) {
		const total = s.pops.reduce((a, p) => a + p.w, 0) || 1;
		for (const p of s.pops) {
			const w = p.w / total;
			const st = popState(p, d);
			if (st.route) {
				// a stream: the last 14% of the leg flown, weighted towards the front of the flock
				const from = Math.max(0, st.f - 0.14);
				const n = 14;
				for (let i = 0; i < n; i++) {
					const f = from + ((st.f - from) * i) / (n - 1);
					out.push({ pos: at(st.route, f), w: (w / n) * (0.5 + i / (n - 1)) });
				}
			} else {
				const km = st.phase === "breeding" ? (p.br ?? 700) : (p.wr ?? 900);
				out.push(...disc(st.pos, km * 0.6, 12, w));
			}
		}
	}
	return out;
}
