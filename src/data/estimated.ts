// Migrants of India with routes estimated from GBIF records by `bun run india` (scripts/india-geo.ts). Estimates, not field studies.
import type { Species } from "@/lib/model/types";
import india from "./india.json";

interface Raw {
	id: string;
	name: string;
	sci: string;
	family: string;
	kind: "winter" | "summer" | "passage";
	km: number;
	where: string[];
	confidence: "ok" | "low";
	flags: string[];
	pop: {
		dep: [number, number, number, number];
		spring: [number, number][];
		wr: number;
		br: number;
	};
}

const KIND = {
	winter: "Winter visitor to India",
	summer: "Summer visitor to India",
	passage: "Passes through India on migration",
} as const;
const countries = new Intl.DisplayNames("en", { type: "region" });
const names = (codes: string[]) =>
	[...new Set(codes)]
		.map((c) => {
			try {
				return countries.of(c) ?? c;
			} catch {
				return c;
			}
		})
		.slice(0, 4)
		.join(", ");

// a stable colour per species, spread around the hue wheel (hex, because the globe parses #rrggbb)
const colour = (id: string) => {
	let h = 0;
	for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) % 360;
	const [sat, light] = [0.7, 0.62];
	const a = sat * Math.min(light, 1 - light);
	const f = (n: number) => {
		const k = (n + h / 30) % 12;
		const c = light - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
		return Math.round(c * 255)
			.toString(16)
			.padStart(2, "0");
	};
	return `#${f(0)}${f(8)}${f(4)}`;
};

export const ESTIMATED: Species[] = (india as unknown as Raw[]).map((m) => ({
	id: m.id,
	name: m.name,
	sci: m.sci,
	color: colour(m.id),
	km: m.km,
	family: m.family,
	kind: m.kind,
	where: m.where,
	confidence: m.confidence,
	flags: m.flags,
	source: "estimated" as const,
	fact: `${KIND[m.kind]}. Route estimated from recorded sightings${m.where.length ? `; the other end of its range is around ${names(m.where)}` : ""}.`,
	pops: [{ name: "India flyway", w: 1, ...m.pop, spring: m.pop.spring }],
}));
