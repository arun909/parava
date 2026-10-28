import { describe, expect, test } from "bun:test";
import distance from "@turf/distance";
import { PREPARED, popState, speciesById } from "@/lib/model";
import { density } from "./density";

describe("density", () => {
	test("each species adds one unit of weight, whatever the date", () => {
		const some = PREPARED.slice(0, 25);
		for (const d of [20, 120, 220, 330]) {
			const total = density(some, d).reduce((a, p) => a + p.w, 0);
			// a flock in flight is weighted towards its front, so the sum is close to (not exactly) one per species
			expect(total).toBeGreaterThan(some.length * 0.7);
			expect(total).toBeLessThan(some.length * 1.1);
		}
	});
	test("points stay near the flock", () => {
		const s = speciesById("rosy-starling")!;
		for (const d of [60, 110, 200, 260]) {
			const centre = popState(s.pops[0]!, d).pos;
			for (const p of density([s], d))
				expect(distance(p.pos, centre, { units: "kilometers" })).toBeLessThan(
					6000,
				);
		}
	});
	test("no species, no heat", () => {
		expect(density([], 100)).toEqual([]);
	});
});
