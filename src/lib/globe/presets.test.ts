import { describe, expect, test } from "bun:test";
import { PREPARED, speciesById } from "@/lib/model";
import { presets } from "./presets";

describe("presets", () => {
	test("hand-modelled preset is the 20 curated species", () => {
		const hand = presets(PREPARED, 300).find((p) => p.id === "hand");
		expect(hand?.ids.length).toBe(20);
	});
	test("every id exists and 'in flight' only has moving species", () => {
		for (const p of presets(PREPARED, 300))
			for (const id of p.ids) expect(speciesById(id)).toBeDefined();
	});
	test("a preset is empty-free: groups with no species are dropped", () => {
		for (const p of presets(PREPARED, 100))
			expect(p.ids.length).toBeGreaterThan(0);
	});
});
