// Static files the globe loads from this site instead of tile servers, so it appears at once:
// - public/globe/tiles/{z}/{x}/{y}.pbf: vector tiles of the land, lakes, every country, border, state / province and populated place in Natural
//   Earth 1:10m (public domain), zooms 0-6 (the map overzooms them to 9). Each is simplified for its zoom and holds only the
//   places big enough to label there, so a view loads a few small tiles. Replaces OpenFreeMap's planet tiles, 1.5 MB each at
//   the zoom the globe opens at.
//   Borders, countries and states follow India's official boundaries (Natural Earth's India point of view): all of Jammu &
//   Kashmir and Ladakh, Aksai Chin included, is India's, and the Line of Control is not drawn as a border.
// - public/globe/cover/{z}/{y}/{x}.webp: land cover in Google Maps' pastels for zooms 0-5, made from Sentinel-2 cloudless imagery
//   (EOX, CC BY 4.0): green where the land is vegetated, sand where it is bare, white where it is ice. The map overzooms them.
// Downloads are cached in node_modules/.cache.
import { mkdir, rm } from "node:fs/promises";
import { booleanPointInPolygon } from "@turf/boolean-point-in-polygon";
import geojsonvt from "geojson-vt";
import sharp from "sharp";
import { fromGeojsonVt } from "vt-pbf";

const NE =
	"https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson";
const CACHE = "node_modules/.cache/natural-earth";
const EOX = "https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless_3857/default/g";
const IMAGERY = "node_modules/.cache/s2cloudless";
const COVER_MAX_Z = 5;
const TILE_MAX_Z = 6;
const OUT = "public/globe/tiles";

type Pos = [number, number];
type Props = Record<string, unknown>;
interface Feature {
	type: "Feature";
	geometry: { type: string; coordinates: unknown } | null;
	properties: Props;
}

async function get(name: string): Promise<Feature[]> {
	const path = `${CACHE}/${name}.geojson`;
	if (!(await Bun.file(path).exists())) {
		const res = await fetch(`${NE}/${name}.geojson`);
		if (!res.ok) throw new Error(`${name}: ${res.status}`);
		await Bun.write(path, await res.text());
	}
	// a fresh handle: one made before the write still reports the empty file
	const data = (await Bun.file(path).json()) as { features: Feature[] };
	return data.features.filter((f) => f.geometry);
}

// Natural Earth's zooms count 256 px tiles; MapLibre's count 512 px, one level fewer for the same scale
const zoomOf = (neZoom: unknown, min = 0) =>
	Math.max(min, Math.round(Number(neZoom) || 0) - 1);
const point = (lon: number, lat: number, properties: Props): Feature => ({
	type: "Feature",
	geometry: { type: "Point", coordinates: [lon, lat] as Pos },
	properties,
});

// borders, land and lakes at three scales: the 1:10m shapes are far too dense to draw the whole world with
const scaled = async (name: string, scale: string, z: number, until: number) =>
	(await get(`ne_${scale}_${name}`)).map((f) => ({
		...f,
		properties: { z, until },
	}));
const scales = async (name: string) => [
	...(await scaled(name, "110m", 0, 1)),
	...(await scaled(name, "50m", 2, 3)),
	...(await scaled(name, "10m", 4, TILE_MAX_Z)),
];

// The countries as India sees them: Natural Earth's default draws borders where control lies (the Line of Control, Aksai Chin
// under China); this edition draws India's official boundaries. It comes at 1:10m only; the tiles simplify it per zoom.
const countriesIN = await get("ne_10m_admin_0_countries_ind");
const india = countriesIN.find((f) => f.properties.ADM0_A3 === "IND");
if (!india) throw new Error("ne_10m_admin_0_countries_ind: no India");
const inIndia = (p: Pos) =>
	booleanPointInPolygon(
		p,
		india as Parameters<typeof booleanPointInPolygon>[1],
	);

/**
 * Land borders: the edges two countries share. Natural Earth's countries share their vertices exactly, so an edge on two
 * countries' rings is a border and one on a single ring is a coast. Natural Earth has no India point of view for border lines.
 */
function borders(countries: Feature[]): Feature[] {
	const rings = countries.map((f) => {
		const g = f.geometry as { type: string; coordinates: Pos[][] | Pos[][][] };
		return (
			g.type === "Polygon" ? [g.coordinates] : g.coordinates
		) as Pos[][][];
	});
	const key = (a: Pos, b: Pos) => {
		const [p, q] = [a.join(), b.join()];
		return p < q ? `${p}|${q}` : `${q}|${p}`;
	};
	const owners = new Map<string, Set<number>>();
	rings.forEach((polys, i) => {
		for (const ring of polys.flat())
			for (let k = 1; k < ring.length; k++) {
				const s = key(ring[k - 1]!, ring[k]!);
				owners.set(s, (owners.get(s) ?? new Set()).add(i));
			}
	});
	// each run of consecutive shared edges along a ring is one line; an edge is taken once, from the first ring that has it
	const taken = new Set<string>();
	const lines: Pos[][] = [];
	for (const ring of rings.flat(2)) {
		const n = ring.length - 1;
		const edge = (k: number) => key(ring[k]!, ring[(k + 1) % n]!);
		const shared = (k: number) =>
			owners.get(edge(k))!.size > 1 && !taken.has(edge(k));
		// start on a coast, so a run doesn't break where the ring closes
		let start = 0;
		while (start < n && shared(start)) start++;
		if (start === n) start = 0;
		let run: Pos[] | null = null;
		for (let t = 0; t < n; t++) {
			const k = (start + t) % n;
			if (shared(k)) {
				taken.add(edge(k));
				run ??= [ring[k]!];
				run.push(ring[(k + 1) % n]!);
			} else if (run) {
				lines.push(run);
				run = null;
			}
		}
		if (run) lines.push(run);
	}
	// three levels of detail, as the other layers' 1:110m, 1:50m and 1:10m: geojson-vt does not simplify a tile set's deepest
	// zoom, which every zoom here is built as. The tolerances keep about as many points as Natural Earth's own border lines
	const levels: [tolerance: number, z: number, until: number][] = [
		[0.1, 0, 1],
		[0.01, 2, 3],
		[0, 4, TILE_MAX_Z],
	];
	return levels.flatMap(([tolerance, z, until]) =>
		lines.map((line) => ({
			type: "Feature" as const,
			geometry: {
				type: "LineString",
				coordinates: tolerance ? simplify(line, tolerance) : line,
			},
			properties: { z, until },
		})),
	);
}

/** Douglas-Peucker in degrees; keeps both ends, so the lines still meet. */
function simplify(line: Pos[], tolerance: number): Pos[] {
	const keep = new Uint8Array(line.length);
	keep[0] = keep[line.length - 1] = 1;
	const stack: [number, number][] = [[0, line.length - 1]];
	while (stack.length) {
		const [a, b] = stack.pop()!;
		const [ax, ay] = line[a]!;
		const [bx, by] = line[b]!;
		const [dx, dy] = [bx - ax, by - ay];
		const len = dx * dx + dy * dy;
		let far = -1;
		let most = tolerance * tolerance;
		for (let i = a + 1; i < b; i++) {
			const [px, py] = line[i]!;
			const t = len
				? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len))
				: 0;
			const d = (px - ax - t * dx) ** 2 + (py - ay - t * dy) ** 2;
			if (d > most) [most, far] = [d, i];
		}
		if (far >= 0) {
			keep[far] = 1;
			stack.push([a, far], [far, b]);
		}
	}
	return line.filter((_, i) => keep[i]);
}

/** A line's middle vertex: enough to tell which side of a border a state line lies on. */
const middle = (f: Feature) => {
	const c = (f.geometry!.coordinates as unknown[]).flat(
		Number.POSITIVE_INFINITY,
	) as number[];
	const i = Math.floor(c.length / 4) * 2;
	return [c[i]!, c[i + 1]!] as Pos;
};

/** A point inside a sea's largest polygon, as near its middle as the shape allows: seas come as polygons without a label point. */
function inside(f: Feature): Pos {
	const g = f.geometry as { type: string; coordinates: Pos[][] | Pos[][][] };
	const polys = (
		g.type === "Polygon" ? [g.coordinates] : g.coordinates
	) as Pos[][][];
	const area = (p: Pos[][]) => {
		const xs = p[0]!.map((c) => c[0]);
		const ys = p[0]!.map((c) => c[1]);
		return (
			(Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys))
		);
	};
	const poly = polys.reduce((a, b) => (area(b) > area(a) ? b : a));
	const xs = poly[0]!.map((c) => c[0]);
	const ys = poly[0]!.map((c) => c[1]);
	const [x0, x1, y0, y1] = [
		Math.min(...xs),
		Math.max(...xs),
		Math.min(...ys),
		Math.max(...ys),
	];
	const mid: Pos = [(x0 + x1) / 2, (y0 + y1) / 2];
	const shape = { type: "Polygon" as const, coordinates: poly };
	let best = mid;
	let near = Number.POSITIVE_INFINITY;
	for (let i = 0; i <= 20; i++)
		for (let j = 0; j <= 20; j++) {
			const c: Pos = [x0 + ((x1 - x0) * i) / 20, y0 + ((y1 - y0) * j) / 20];
			const d = (c[0] - mid[0]) ** 2 + (c[1] - mid[1]) ** 2;
			if (d < near && booleanPointInPolygon(c, shape)) [best, near] = [c, d];
		}
	return best;
}

/** Each layer's features, with `z`: the first zoom it appears at, and `until`: the last zoom whose tiles carry it. */
const layers: Record<string, Feature[]> = {
	land: await scales("land"),
	// drawn over the satellite tint, so the sea stays one flat blue
	ocean: await scales("ocean"),
	lakes: await scales("lakes"),
	rivers: await scales("rivers_lake_centerlines"),
	// oceans, seas, gulfs and bays
	seas: (await get("ne_10m_geography_marine_polys"))
		.filter((f) => f.properties.name)
		.map((f) => {
			const [lon, lat] = inside(f);
			return point(lon, lat, {
				name: f.properties.name,
				r: f.properties.scalerank,
				z: Math.max(0, Math.round(Number(f.properties.min_label) || 0) - 1),
			});
		}),
	// mountain ranges, deserts, plains and peaks
	physical: [
		...(await get("ne_10m_geography_regions_points")),
		...(await get("ne_10m_geography_regions_elevation_points")),
	].map((f) => {
		const [lon, lat] = f.geometry!.coordinates as Pos;
		return point(lon, lat, {
			name: f.properties.name,
			r: f.properties.scalerank,
			ele: f.properties.elevation ?? 0,
			z: zoomOf(f.properties.min_zoom, 2),
		});
	}),
	borders: borders(countriesIN),
	// without the lines India does not recognise (Pakistan's along the border with Jammu & Kashmir) and other countries' lines
	// inside India (Pakistan's and China's provinces across Jammu & Kashmir and Ladakh)
	states: (await get("ne_10m_admin_1_states_provinces_lines"))
		.filter(
			(f) =>
				!String(f.properties.FCLASS_IN ?? "").startsWith("Unrecognized") &&
				(f.properties.ADM0_A3 === "IND" || !inIndia(middle(f))),
		)
		.map((f) => ({
			...f,
			properties: { z: zoomOf(f.properties.MIN_ZOOM, 3) },
		})),
	countries: countriesIN.map((f) =>
		point(Number(f.properties.LABEL_X), Number(f.properties.LABEL_Y), {
			name: f.properties.NAME,
			r: f.properties.LABELRANK,
			// a level early: the flat map shows the whole world below zoom 1
			z: Math.max(0, zoomOf(f.properties.MIN_LABEL) - 1),
		}),
	),
	// one label per state / province: island regions come with a point per island. None of another country's inside India,
	// such as Pakistan's Azad Kashmir and Northern Areas or the Siachen Glacier's own
	regions: [
		...new Map(
			(await get("ne_10m_admin_1_label_points")).map((f) => [
				f.properties.adm1_code,
				f,
			]),
		).values(),
	]
		.filter(
			(f) =>
				f.properties.admin === "India" ||
				!inIndia(f.geometry!.coordinates as Pos),
		)
		.map((f) => {
			const [lon, lat] = f.geometry!.coordinates as Pos;
			const r = Number(f.properties.scalerank);
			return point(lon, lat, {
				name: f.properties.name,
				r,
				z: Math.max(2, r - 3),
			});
		}),
	cities: (await get("ne_10m_populated_places_simple")).map((f) => {
		const [lon, lat] = f.geometry!.coordinates as Pos;
		return point(lon, lat, {
			name: f.properties.name,
			r: f.properties.scalerank,
			cap: f.properties.adm0cap ? 1 : 0,
			z: zoomOf(f.properties.min_zoom, 2) - 1,
		});
	}),
};

await rm(OUT, { recursive: true, force: true });
let files = 0;
let bytes = 0;
let biggest = 0;
for (let z = 0; z <= TILE_MAX_Z; z++) {
	// a tile holds what shows at its zoom; the deepest tiles hold everything, for the zooms the map overzooms them to
	const tiles = new Map<string, Record<string, unknown>>();
	for (const [name, all] of Object.entries(layers)) {
		const features = all.filter(
			(f) =>
				(z === TILE_MAX_Z || Number(f.properties.z) <= z) &&
				Number(f.properties.until ?? TILE_MAX_Z) >= z,
		);
		if (!features.length) continue;
		const index = geojsonvt(
			{ type: "FeatureCollection", features },
			{
				maxZoom: z,
				indexMaxZoom: z,
				indexMaxPoints: 0,
				tolerance: 2,
				buffer: 64,
			},
		);
		for (const c of index.tileCoords) {
			if (c.z !== z) continue;
			const tile = index.getTile(c.z, c.x, c.y);
			if (!tile?.features.length) continue;
			const key = `${c.x}/${c.y}`;
			tiles.set(key, { ...tiles.get(key), [name]: tile });
		}
	}
	for (const [key, ls] of tiles) {
		const pbf = fromGeojsonVt(ls, { version: 2 });
		const [x, y] = key.split("/");
		await mkdir(`${OUT}/${z}/${x}`, { recursive: true });
		await Bun.write(`${OUT}/${z}/${x}/${y}.pbf`, pbf);
		files++;
		bytes += pbf.length;
		biggest = Math.max(biggest, pbf.length);
	}
}
console.log(
	`vector tiles: ${files} files, ${(bytes / 1024).toFixed(0)} KB, largest ${(biggest / 1024).toFixed(0)} KB`,
);

type Rgb = [number, number, number];
const SAND: Rgb = [245, 240, 226];
const GRASS: Rgb = [218, 236, 204];
const FOREST: Rgb = [184, 222, 178];
const ICE: Rgb = [255, 255, 255];
const LAND: Rgb = [242, 239, 233]; // under water pixels: the sea is drawn over them, this only shows along coasts
const clamp = (v: number) => Math.max(0, Math.min(1, v));
const mix = (a: Rgb, b: Rgb, t: number): Rgb => [
	a[0] + (b[0] - a[0]) * t,
	a[1] + (b[1] - a[1]) * t,
	a[2] + (b[2] - a[2]) * t,
];

/** One satellite pixel as a pastel land cover colour. */
function cover(r: number, g: number, b: number): Rgb {
	const light = (r + g + b) / 3;
	if (b > r + 8 && b > g) return LAND;
	if (light > 185 && Math.max(r, g, b) - Math.min(r, g, b) < 30) return ICE;
	// vegetation is greener than it is red; dense forest is also dark
	const green = clamp((g - r + 6) / 26);
	const dense = clamp((120 - light) / 70);
	return mix(mix(SAND, GRASS, green), FOREST, green * dense);
}

const tiles: [number, number, number][] = [];
for (let z = 0; z <= COVER_MAX_Z; z++)
	for (let y = 0; y < 2 ** z; y++)
		for (let x = 0; x < 2 ** z; x++) tiles.push([z, y, x]);
let made = 0;
// a few at a time: the server is slow per tile but happy in parallel
for (let i = 0; i < tiles.length; i += 8)
	await Promise.all(
		tiles.slice(i, i + 8).map(async ([z, y, x]) => {
			const src = `${IMAGERY}/${z}/${y}/${x}.jpg`;
			if (!(await Bun.file(src).exists())) {
				const res = await fetch(`${EOX}/${z}/${y}/${x}.jpg`);
				if (!res.ok) throw new Error(`EOX ${z}/${y}/${x}: ${res.status}`);
				await Bun.write(src, await res.bytes());
			}
			const { data, info } = await sharp(src)
				.removeAlpha()
				.raw()
				.toBuffer({ resolveWithObject: true });
			for (let p = 0; p < data.length; p += 3) {
				const [r, g, b] = cover(data[p]!, data[p + 1]!, data[p + 2]!);
				data[p] = r;
				data[p + 1] = g;
				data[p + 2] = b;
			}
			const webp = await sharp(data, {
				raw: { width: info.width, height: info.height, channels: 3 },
			})
				// soft patches, like Google's, not the satellite's every field
				.blur(1.2)
				.webp({ quality: 75 })
				.toBuffer();
			await mkdir(`public/globe/cover/${z}/${y}`, { recursive: true });
			await Bun.write(`public/globe/cover/${z}/${y}/${x}.webp`, webp);
			made += webp.length;
		}),
	);
console.log(
	`cover tiles: ${tiles.length} for zooms 0-${COVER_MAX_Z}, ${(made / 1024).toFixed(0)} KB`,
);
