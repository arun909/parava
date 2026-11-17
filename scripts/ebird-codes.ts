// eBird species codes for every species the site models, from the eBird taxonomy (one 3.5 MB download, here instead of in every
// visitor's browser). Writes src/data/ebird-codes.json: { "<scientific name>": "<code>" }. Needs EBIRD_KEY in .env.
import { SPECIES } from "../src/data";

const key = process.env.EBIRD_KEY;
if (!key) throw new Error("EBIRD_KEY missing (.env)");
const tax = (await (
	await fetch(
		"https://api.ebird.org/v2/ref/taxonomy/ebird?fmt=json&cat=species&locale=en",
		{
			headers: { "X-eBirdApiToken": key },
		},
	)
).json()) as { sciName: string; comName: string; speciesCode: string }[];
const bySci = new Map(tax.map((t) => [t.sciName, t.speciesCode]));
const byName = new Map(
	tax.map((t) => [t.comName.toLowerCase(), t.speciesCode]),
);

const out: Record<string, string> = {};
const missing: string[] = [];
for (const s of SPECIES) {
	// GBIF and eBird sometimes disagree on a scientific name (Anthropoides virgo / Grus virgo): fall back to the common name
	const code = bySci.get(s.sci) ?? byName.get(s.name.toLowerCase());
	if (code) out[s.sci] = code;
	else missing.push(s.name);
}
await Bun.write("src/data/ebird-codes.json", JSON.stringify(out));
console.log(
	`${Object.keys(out).length} of ${SPECIES.length} species have an eBird code`,
	missing.length ? `(none for: ${missing.join(", ")})` : "",
);
