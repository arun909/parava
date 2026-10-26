// Season audit: for each population's wintering and breeding ground, count historical GBIF records per calendar month and compare
// the share that falls in the months the model says birds are there with the share expected by chance. Run: bun run audit
import PQueue from "p-queue";
import {
	type LonLat,
	PREPARED,
	type PreparedPop,
	type PreparedSpecies,
	popState,
} from "@/lib/model";
import { gbifMatch, gbifMonthHistogram, pointBoxes } from "@/lib/sources";

const queue = new PQueue({ concurrency: 3 });
const retry = async <T>(fn: () => Promise<T>, tries = 5): Promise<T> => {
	for (let k = 0; ; k++) {
		try {
			return await fn();
		} catch (e) {
			if (k >= tries - 1) throw e;
			await Bun.sleep(1200 * (k + 1));
		}
	}
};

/** Fraction of each month (0..11) the population spends in a phase. */
function presence(p: PreparedPop, phase: "wintering" | "breeding"): number[] {
	const r = new Array<number>(12).fill(0);
	for (let d = 1; d <= 365; d++)
		if (popState(p, d).phase === phase)
			r[Math.min(11, Math.floor((d - 1) / 30.42))]! += 1 / 30.42;
	return r;
}

type Cell = [share: number, chance: number, records: number];
async function cell(
	s: PreparedSpecies,
	at: LonLat,
	pr: number[],
): Promise<Cell | null> {
	const parts = await Promise.all(
		pointBoxes(at).map((b) => retry(() => gbifMonthHistogram(fetch, s.sci, b))),
	);
	const c = parts[0]!.map((_, i) => parts.reduce((a, p) => a + p[i]!, 0));
	const n = c.reduce((a, b) => a + b, 0);
	if (n < 25) return null;
	return [
		Math.round((c.reduce((a, b, i) => a + b * pr[i]!, 0) / n) * 100),
		Math.round((pr.reduce((a, b) => a + b, 0) / 12) * 100),
		n,
	];
}

const evidence: Record<string, { w?: Cell; b?: Cell }> = {};
const problems: string[] = [];
await Promise.all(
	PREPARED.flatMap((s) => [
		queue.add(async () => {
			const m = await retry(() => gbifMatch(fetch, s.sci));
			if (m.status !== "ACCEPTED")
				problems.push(
					`${s.name}: "${s.sci}" is ${m.status} in GBIF (${m.species ?? "no match"})`,
				);
		}),
		...s.pops.map((p) =>
			queue.add(async () => {
				const [w, b] = [
					await cell(s, p.au.pts.at(-1)!, presence(p, "wintering")),
					await cell(s, p.sp.pts.at(-1)!, presence(p, "breeding")),
				];
				const e: { w?: Cell; b?: Cell } = {};
				if (w) e.w = w;
				if (b) e.b = b;
				if (e.w || e.b) evidence[`${s.id}/${p.name}`] = e;
			}),
		),
	]),
);

const ordered = Object.fromEntries(
	PREPARED.flatMap((s) => s.pops.map((p) => `${s.id}/${p.name}`))
		.filter((k) => evidence[k])
		.map((k) => [k, evidence[k]]),
);
await Bun.write(
	"src/data/evidence.json",
	`${JSON.stringify(ordered, null, "\t")}\n`,
);
const cells = Object.values(ordered)
	.flatMap((e) => [e?.w, e?.b])
	.filter(Boolean) as Cell[];
console.log(
	`${cells.length} grounds had enough records; ${cells.filter((c) => c[0] >= c[1] + 10).length} show clear seasonality.`,
);
for (const p of problems) console.log("name:", p);
