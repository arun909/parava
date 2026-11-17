import { describe, expect, test } from "bun:test";
import { PREPARED } from "@/lib/model";
import { birdGroups, groupOf, searchSpecies } from "./groups";

describe("bird groups", () => {
	test("every species falls in a named group, none in Other", () => {
		expect(
			PREPARED.filter((s) => groupOf(s) === "other").map((s) => s.id),
		).toEqual([]);
	});
	test("each species is in exactly one group, and no group is too long to scan", () => {
		const groups = birdGroups(PREPARED);
		expect(groups.reduce((n, g) => n + g.species.length, 0)).toBe(
			PREPARED.length,
		);
		for (const g of groups) expect(g.species.length).toBeLessThanOrEqual(60);
	});
});

describe("species search", () => {
	test("an empty search lists everything A to Z; a name that starts with the text comes first", () => {
		expect(searchSpecies(PREPARED, "  ").length).toBe(PREPARED.length);
		const owls = searchSpecies(PREPARED, "owl");
		expect(owls.length).toBeGreaterThan(5);
		expect(
			owls.every((s) =>
				`${s.name} ${s.sci} ${s.family}`.toLowerCase().includes("owl"),
			),
		).toBe(true);
	});
});
