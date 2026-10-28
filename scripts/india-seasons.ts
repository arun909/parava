// India's species (eBird list) and how seasonal each one is in India (GBIF human observations per month, relative to birding effort).
// Output: scripts/.cache/india-months.json  { code: { sci, name, family, months: number[12] } }
import PQueue from "p-queue";

const KEY = process.env.EBIRD_KEY;
if (!KEY) throw new Error("EBIRD_KEY missing (.env)");
const OUT = "scripts/.cache/india-months.json";
const eb = (path: string) =>
	fetch(`https://api.ebird.org/v2/${path}`, {
		headers: { "X-eBirdApiToken": KEY },
	}).then((r) => r.json());

const gbif = async (sci: string | null): Promise<number[] | null> => {
	const taxon = sci
		? `scientificName=${encodeURIComponent(sci)}`
		: "taxonKey=212";
	const url = `https://api.gbif.org/v1/occurrence/search?country=IN&${taxon}&year=2015,2026&basisOfRecord=HUMAN_OBSERVATION&facet=month&facetLimit=12&limit=0`;
	for (let k = 0; k < 4; k++) {
		try {
			const r = await fetch(url);
			if (!r.ok) throw new Error(String(r.status));
			const j = (await r.json()) as {
				facets: { counts: { name: string; count: number }[] }[];
			};
			const m = new Array<number>(12).fill(0);
			for (const c of j.facets[0]?.counts ?? []) m[+c.name - 1] = c.count;
			return m;
		} catch {
			await new Promise((r) => setTimeout(r, 1000 * (k + 1)));
		}
	}
	return null;
};

const codes: string[] = await eb("product/spplist/IN");
const tax: {
	sciName: string;
	comName: string;
	speciesCode: string;
	familyComName: string;
}[] = await eb("ref/taxonomy/ebird?fmt=json&cat=species&locale=en");
const byCode = new Map(tax.map((t) => [t.speciesCode, t]));
const out: Record<
	string,
	{ sci: string; name: string; family: string; months: number[] }
> = {};
const baseline = await gbif(null);
const q = new PQueue({ concurrency: 4 });
let done = 0;
await Promise.all(
	codes.map((c) =>
		q.add(async () => {
			const t = byCode.get(c);
			if (!t) return;
			const months = await gbif(t.sciName);
			if (months)
				out[c] = {
					sci: t.sciName,
					name: t.comName,
					family: t.familyComName,
					months,
				};
			if (++done % 200 === 0) console.log(done, "/", codes.length);
		}),
	),
);
await Bun.write(OUT, JSON.stringify({ baseline, species: out }));
console.log("species with data:", Object.keys(out).length);
