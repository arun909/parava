import {
	isMoving,
	type PopState,
	type PreparedSpecies,
	popState,
} from "./motion";
import type { Classified, Hit } from "./sightings";

export type Level = "high" | "medium" | "low" | "none";

/** Is a report at this spot on its flyway where the model says birds should be? */
export function fits(h: Hit, m: PopState): boolean {
	if (m.phase === "wintering") return h.zone === "W";
	if (m.phase === "breeding") return h.zone === "B";
	const mine = m.phase === "spring" ? 0 : 1;
	if (h.leg === mine && Math.abs(h.u - m.f) <= 0.3) return true;
	return (
		(m.f < 0.3 && h.zone === (mine === 0 ? "W" : "B")) ||
		(m.f > 0.7 && h.zone === (mine === 0 ? "B" : "W"))
	);
}

/** Share of flyway reports sitting where the model expects birds on day d, or null with no reports. */
export function agreement(
	sp: PreparedSpecies,
	c: Classified | undefined,
	d: number,
): number | null {
	if (!c?.items.length) return null;
	const ps = sp.pops.map((p) => popState(p, d));
	const ok = c.items.filter((o) =>
		o.hits.some((h) => fits(h, ps[h.pop]!)),
	).length;
	return ok / c.items.length;
}

export interface Match {
	level: Level;
	/** Reports along the flyways. */
	n: number;
	/** Reports ignored as outside the flyways. */
	dropped: number;
	total: number;
	/** Where reports sit: at the wintering ground, breeding ground, or mid-migration (shares of n). */
	obs: { W: number; B: number; M: number } | null;
	/** Timing shift in days applied in "now" mode (0 unless live data clearly says the model is early or late). */
	offset: number;
	/** Agreement before and after the shift. */
	base: number | null;
	score: number | null;
}

/**
 * Compare the model with recent reports. Timing is shifted by up to 24 days only if that lifts the species to at least
 * Medium agreement, so noise is never fitted.
 */
export function assess(
	sp: PreparedSpecies,
	c: Classified | undefined,
	today: number,
	enabled = true,
): Match {
	const n = c?.items.length ?? 0;
	const base = agreement(sp, c, today);
	let best = { off: 0, score: base };
	if (n >= 12) {
		for (let off = -24; off <= 24; off += 4) {
			if (!off) continue;
			const sc = agreement(sp, c, today + off);
			if (sc !== null && (best.score === null || sc > best.score))
				best = { off, score: sc };
		}
	}
	if (
		base === null ||
		best.score === null ||
		best.score - base < 0.15 ||
		best.score < 0.4
	)
		best = { off: 0, score: base };
	const z = { W: 0, B: 0, M: 0 };
	for (const o of c?.items ?? []) z[o.hits[0]!.zone]++;
	const sc = best.score ?? 0;
	return {
		level:
			!enabled || n < 5
				? "none"
				: sc >= 0.65 && n >= 12
					? "high"
					: sc >= 0.4
						? "medium"
						: "low",
		n,
		dropped: c?.dropped ?? 0,
		total: c?.total ?? 0,
		obs: n ? { W: z.W / n, B: z.B / n, M: z.M / n } : null,
		offset: best.off,
		base,
		score: best.score,
	};
}

export { isMoving };
