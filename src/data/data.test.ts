import { describe, expect, test } from "bun:test";
import codes from "./ebird-codes.json";
import { SPECIES } from "./index";

describe("species data", () => {
	test("ids and scientific names are unique", () => {
		expect(new Set(SPECIES.map((s) => s.id)).size).toBe(SPECIES.length);
		expect(new Set(SPECIES.map((s) => s.sci)).size).toBe(SPECIES.length);
	});
	test("every population has ordered dates inside the year and a real route", () => {
		for (const s of SPECIES)
			for (const p of s.pops) {
				const [a, b, c, d] = p.dep;
				expect(1 <= a && a < b && b < c && c < d && d <= 365).toBe(true);
				expect(p.spring.length).toBeGreaterThanOrEqual(2);
				for (const [lon, lat] of p.spring) {
					expect(Math.abs(lon)).toBeLessThanOrEqual(180);
					expect(Math.abs(lat)).toBeLessThanOrEqual(90);
				}
			}
	});
	test("every colour is a hex string the globe can parse", () => {
		for (const s of SPECIES) expect(s.color).toMatch(/^#[0-9a-f]{6}$/i);
	});
	test("estimated species are marked and never shadow a hand-modelled one", () => {
		const hand = SPECIES.filter((s) => s.source === "curated");
		expect(hand.length).toBe(20);
		for (const s of SPECIES.filter((x) => x.source === "estimated")) {
			expect(s.kind).toBeDefined();
			// a low-confidence estimate always says why
			if (s.confidence === "low") expect(s.flags?.length).toBeGreaterThan(0);
		}
	});
	test("nearly every species has an eBird code (run `bun scripts/ebird-codes.ts` after the species change)", () => {
		const have = SPECIES.filter(
			(s) => (codes as Record<string, string>)[s.sci],
		);
		expect(have.length / SPECIES.length).toBeGreaterThan(0.95);
	});
});
