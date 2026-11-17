import { describe, expect, test } from "bun:test";
import { speciesById } from "@/lib/model";
import {
	fetchEbird,
	fetchSightings,
	flywayBoxes,
	gbifMonthHistogram,
	inatObservations,
	inatTaxon,
	makeQueues,
	pointBoxes,
	wikiSummary,
} from "./index";

type Handler = (url: string, init?: RequestInit) => unknown | Response;
const fake = (h: Handler): typeof fetch =>
	(async (url: string | URL | Request, init?: RequestInit) => {
		const r = h(String(url), init);
		return r instanceof Response
			? r
			: new Response(JSON.stringify(r), { status: 200 });
	}) as typeof fetch;

const inatPayload = {
	results: [
		{
			geojson: { coordinates: [76.5, 9.0] },
			time_observed_at: "2026-10-15T09:00:00+05:30",
			place_guess: "Alappad, Kerala",
			uri: "https://www.inaturalist.org/observations/1",
			photos: [
				{
					url: "https://x/photos/1/square.jpg",
					license_code: "cc-by",
					attribution: "(c) someone",
				},
			],
		},
		{
			geojson: { coordinates: [77, 10] },
			observed_on: "2026-10-14",
			photos: [{ url: "https://x/photos/2/square.jpg", license_code: null }],
		},
		{ geojson: null, observed_on: "2026-10-13" },
	],
};

describe("iNaturalist", () => {
	test("maps observations, keeps open-licensed photos only, skips ungeolocated ones", async () => {
		const out = await inatObservations(
			fake(() => inatPayload),
			"Pastor roseus",
			[60, 100, 0, 40],
			Date.now() - 14 * 864e5,
		);
		expect(out).toHaveLength(2);
		expect(out[0]).toMatchObject({
			lon: 76.5,
			lat: 9,
			src: "iNaturalist",
			img: "https://x/photos/1/medium.jpg",
			attr: "(c) someone",
		});
		expect(out[1]!.img).toBeUndefined();
	});
	test("rejects a payload of the wrong shape", async () => {
		await expect(
			inatObservations(
				fake(() => ({ results: "nope" })),
				"x",
				[0, 1, 0, 1],
				0,
			),
		).rejects.toThrow();
	});
	test("reports HTTP errors", async () => {
		await expect(
			inatObservations(
				fake(() => new Response("", { status: 429 })),
				"x",
				[0, 1, 0, 1],
				0,
			),
		).rejects.toThrow("HTTP 429");
	});
	test("reads the IUCN status", async () => {
		const t = await inatTaxon(
			fake(() => ({
				results: [
					{ observations_count: 4700, conservation_status: { status: "cr" } },
				],
			})),
			"Leucogeranus leucogeranus",
		);
		expect(t).toEqual({ iucn: "CR", observations: 4700 });
	});
});

describe("combined fetch", () => {
	const sp = speciesById("rosy-starling")!;
	test("merges both sources over every flyway box", async () => {
		const seen: string[] = [];
		const f = fake((url) => {
			seen.push(url.includes("inaturalist") ? "inat" : "gbif");
			return url.includes("inaturalist")
				? inatPayload
				: {
						results: [
							{
								decimalLatitude: 12,
								decimalLongitude: 77,
								eventDate: "2026-10-16T10:00",
								country: "India",
							},
						],
					};
		});
		const out = await fetchSightings(sp, {
			fetch: f,
			since: 0,
			queues: makeQueues(false),
		});
		// every flyway box, plus one worldwide request for birds far off their route
		expect(seen.filter((s) => s === "inat").length).toBe(
			flywayBoxes(sp.pops[0]!).length + 1,
		);
		expect(out.some((o) => o.src === "GBIF")).toBe(true);
		expect(out.some((o) => o.src === "iNaturalist")).toBe(true);
	});
	test("tolerates one source failing", async () => {
		const f = fake((url) =>
			url.includes("gbif") ? new Response("", { status: 500 }) : inatPayload,
		);
		const out = await fetchSightings(sp, {
			fetch: f,
			since: 0,
			queues: makeQueues(false),
		});
		expect(out.length).toBeGreaterThan(0);
	});
	test("throws when everything fails", async () => {
		await expect(
			fetchSightings(sp, {
				fetch: fake(() => new Response("", { status: 500 })),
				since: 0,
				queues: makeQueues(false),
			}),
		).rejects.toThrow("All");
	});
});

describe("flyway boxes", () => {
	test("a route crossing the dateline is split into two boxes", () => {
		const boxes = flywayBoxes(speciesById("bar-tailed-godwit")!.pops[0]!);
		expect(boxes).toHaveLength(2);
		expect(boxes.every(([w, e]) => w >= -180 && e <= 180 && w < e)).toBe(true);
	});
});

describe("point boxes", () => {
	test("a box around a point near the dateline is split into valid halves", () => {
		const b = pointBoxes([175, -37]);
		expect(b).toHaveLength(2);
		expect(b.every(([w, e]) => w < e)).toBe(true);
		expect(pointBoxes([10, 10])).toEqual([[4, 16, 4, 16]]);
	});
});

describe("eBird", () => {
	test("sends the key in the documented header and normalises region codes", async () => {
		const calls: { url: string; key?: string }[] = [];
		const f = fake((url, init) => {
			calls.push({
				url,
				key: (init?.headers as Record<string, string> | undefined)?.[
					"X-eBirdApiToken"
				],
			});
			return url.includes("taxonomy")
				? [
						{ sciName: "Pastor roseus", speciesCode: "rossta2" },
						{ sciName: "Other", speciesCode: "oth" },
					]
				: [
						{
							lat: 8.52,
							lng: 76.94,
							obsDt: "2026-10-17 07:30",
							locName: "Napier Museum",
							subId: "S123",
						},
					];
		});
		const out = await fetchEbird(f, "KEY", ["in-kl"], "rossta2");
		expect(out[0]).toMatchObject({
			lon: 76.94,
			lat: 8.52,
			src: "eBird",
			link: "https://ebird.org/checklist/S123",
		});
		expect(calls.every((c) => c.key === "KEY")).toBe(true);
		expect(calls.at(-1)!.url).toContain("/data/obs/IN-KL/recent/rossta2");
	});
});

describe("GBIF month histogram and Wikipedia", () => {
	test("histogram fills the right months", async () => {
		const h = await gbifMonthHistogram(
			fake(() => ({
				facets: [
					{
						counts: [
							{ name: "1", count: 5 },
							{ name: "12", count: 9 },
						],
					},
				],
			})),
			"x",
			[0, 1, 0, 1],
		);
		expect(h[0]).toBe(5);
		expect(h[11]).toBe(9);
		expect(h[5]).toBe(0);
	});
	test("wikipedia summary tolerates missing fields", async () => {
		const w = await wikiSummary(
			fake(() => ({ extract: "A bird." })),
			"Pastor roseus",
		);
		expect(w).toEqual({ extract: "A bird.", thumb: "", original: "", url: "" });
	});
});
