import { describe, expect, test } from "bun:test";
import distance from "@turf/distance";
import {
	assess,
	classify,
	dayOfYear,
	evidenceStats,
	fits,
	hitsFor,
	isMoving,
	legStats,
	PREPARED,
	popState,
	prepareRoute,
	type Sighting,
	speciesById,
	speciesState,
	upcoming,
	visitWindow,
} from "./index";

const sp = (id: string) => speciesById(id)!;
const report = (lon: number, lat: number, daysAgo = 2): Sighting => ({
	lon,
	lat,
	t: Date.now() - daysAgo * 864e5,
	place: "test",
	src: "iNaturalist",
});

describe("routes", () => {
	test("start and end where the waypoints say", () => {
		const r = prepareRoute([
			[0, 0],
			[10, 10],
			[20, 0],
		]);
		expect(r.pts[0]).toEqual([0, 0]);
		expect(r.pts.at(-1)![0]).toBeCloseTo(20, 5);
		expect(r.len).toBeGreaterThan(2000);
		expect(r.cum.every((v, i) => i === 0 || v >= r.cum[i - 1]!)).toBe(true);
	});
	test("longitudes stay continuous across the dateline", () => {
		for (const s of PREPARED)
			for (const p of s.pops)
				for (const r of [p.sp, p.au])
					for (let i = 1; i < r.pts.length; i++)
						// a wrap error would be a jump of thousands of km between neighbouring points
						expect(
							distance(r.pts[i]!, r.pts[i - 1]!, { units: "kilometers" }),
						).toBeLessThan(1500);
	});
	test("autumn defaults to the spring route reversed", () => {
		const p = sp("rosy-starling").pops[0]!;
		expect(p.au.pts[0]![1]).toBeCloseTo(p.sp.pts.at(-1)![1], 3);
	});
});

describe("motion", () => {
	const p = sp("rosy-starling").pops[0]!;
	const [d0, d1, d2, d3] = p.dep;
	test("phases follow the dates", () => {
		expect(popState(p, d0 - 5).phase).toBe("wintering");
		expect(popState(p, (d0 + d1) / 2).phase).toBe("spring");
		expect(popState(p, (d1 + d2) / 2).phase).toBe("breeding");
		expect(popState(p, (d2 + d3) / 2).phase).toBe("autumn");
		expect(popState(p, d3 + 5).phase).toBe("wintering");
	});
	test("progress rises along a leg", () => {
		expect(popState(p, d0 + 1).f).toBeLessThan(popState(p, d1 - 1).f);
	});
	test("the species summary prefers a migrating population", () => {
		const osprey = sp("osprey");
		const mid = (osprey.pops[2]!.dep[0] + osprey.pops[2]!.dep[1]) / 2; // Siberian flyway in spring flight
		const m = speciesState(osprey, mid);
		expect(isMoving(m.pops[m.main]!)).toBe(m.moving);
	});
});

describe("flyway filter", () => {
	test("a Rosy Starling in Kerala counts (the wintering range reaches the south)", () => {
		const hits = hitsFor(sp("rosy-starling"), 76.95, 8.52); // Thiruvananthapuram
		expect(hits.some((h) => h.zone === "W")).toBe(true);
	});
	test("a Bar-headed Goose in Europe is rejected as feral", () => {
		expect(hitsFor(sp("bar-headed-goose"), 5, 51)).toHaveLength(0);
	});
	test("duplicates collapse and photo copies win", () => {
		const a = report(76.95, 8.52);
		const b = { ...a, src: "GBIF" as const, img: "x.jpg" };
		const c = classify(sp("rosy-starling"), [a, b]);
		expect(c.total).toBe(1);
		expect(c.items[0]!.img).toBe("x.jpg");
	});
	test("reports outside every flyway are counted as dropped", () => {
		const c = classify(sp("rosy-starling"), [
			report(76.95, 8.52),
			report(-60, 40),
		]);
		expect(c.dropped).toBe(1);
	});
});

describe("confidence", () => {
	const s = sp("rosy-starling");
	const winter = (s.pops[0]!.dep[3] + 20) % 365 || 300; // well after the autumn arrival
	test("wintering birds are expected near the wintering ground only", () => {
		const m = popState(s.pops[0]!, winter);
		expect(m.phase).toBe("wintering");
		expect(fits({ pop: 0, leg: 1, u: 1, zone: "W" }, m)).toBe(true);
		expect(fits({ pop: 0, leg: 0, u: 1, zone: "B" }, m)).toBe(false);
	});
	test("agreeing reports give high confidence", () => {
		const reports = Array.from({ length: 15 }, (_, i) =>
			report(76 + i * 0.1, 14 + i * 0.05),
		);
		const m = assess(s, classify(s, reports), winter);
		expect(m.level).toBe("high");
	});
	test("too few reports means no verdict", () => {
		expect(assess(s, classify(s, [report(76, 14)]), winter).level).toBe("none");
	});
});

describe("calendar helpers", () => {
	test("upcoming events are sorted and within the window", () => {
		const ev = upcoming(PREPARED, 100, 30);
		expect(ev.every((e) => e.in >= 0 && e.in <= 30)).toBe(true);
		expect(ev.map((e) => e.in)).toEqual(
			[...ev.map((e) => e.in)].sort((a, b) => a - b),
		);
	});
	test("day of year is 1.0 at the start of the year", () => {
		expect(dayOfYear(new Date(2026, 0, 1, 0, 0))).toBeCloseTo(1, 5);
	});
	test("the season audit covers most grounds and most of those are clear", () => {
		const e = evidenceStats();
		expect(e).toEqual({ checked: 69, good: 63, total: 78 });
	});
});

describe("travel", () => {
	test("leg stats are consistent with the route lengths", () => {
		for (const s of PREPARED)
			for (const p of s.pops) {
				const t = legStats(p);
				expect(t.roundTripKm).toBeCloseTo(p.sp.len + p.au.len, 5);
				expect(t.spring.days).toBeGreaterThan(0);
				expect(t.spring.days).toBeLessThanOrEqual(365);
			}
	});
	test("Trivandrum: Rosy Starling winters nearby, an Arctic Tern is never near", () => {
		const rosy = visitWindow(sp("rosy-starling"), 76.95, 8.52);
		expect(rosy).not.toBeNull();
		expect(rosy!.ranges.length).toBeGreaterThan(0);
		expect(visitWindow(sp("arctic-tern"), 76.95, 8.52)).toBeNull();
	});
});

describe("off-path sightings", () => {
	test("a Rosy Starling far from its flyway is kept as away, not lost", () => {
		const c = classify(sp("rosy-starling"), [report(77, 14), report(-20, 64)]);
		expect(c.items.length).toBe(1);
		expect(c.away.length).toBe(1);
		expect(c.dropped).toBe(1);
	});
});
