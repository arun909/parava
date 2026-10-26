import { PathLayer, ScatterplotLayer } from "@deck.gl/layers";
import { MapboxOverlay } from "@deck.gl/mapbox";
import maplibregl from "maplibre-gl";
import Supercluster from "supercluster";
import {
	type LonLat,
	type PreparedSpecies,
	popState,
	sliceTo,
} from "@/lib/model";
import { globeStyle } from "./style";

type Rgb = [number, number, number];
const SPRING: Rgb = [139, 92, 246];
const AUTUMN: Rgb = [244, 63, 94];
// deck draws on top of the globe; depth testing against the tiles causes z-fighting
const GP = {
	parameters: { depthCompare: "always", depthWriteEnabled: false },
} as const;

interface RouteItem {
	path: LonLat[];
	c: Rgb;
	a: number;
	w: number;
}
export interface PathOptions {
	mode: "active" | "all" | "focus";
	focus?: string;
}
export interface Report {
	pos: LonLat;
	c: Rgb;
}
interface Flock {
	pos: LonLat;
	c: Rgb;
}
const rgb = (hex: string) =>
	[1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16)) as [
		number,
		number,
		number,
	];

export class GlobeController {
	readonly map: maplibregl.Map;
	private overlay = new MapboxOverlay({ interleaved: true, layers: [] });
	private index = new Supercluster<{ c: Rgb }>({ radius: 45, maxZoom: 8 });
	private last: { species: PreparedSpecies[]; d: number; paths: PathOptions } =
		{
			species: [],
			d: 1,
			paths: { mode: "active" },
		};

	constructor(container: HTMLElement) {
		this.map = new maplibregl.Map({
			container,
			style: globeStyle,
			center: [20, 15],
			zoom: container.clientWidth < 600 ? 0.9 : 1.8,
			maxZoom: 9,
			attributionControl: { compact: true },
			dragRotate: false,
			pitchWithRotate: false,
			maxPitch: 0,
			keyboard: true,
		});
		this.map.touchZoomRotate.disableRotation();
		this.map.addControl(this.overlay);
		// start the attribution collapsed to its (i) button so it never covers the controls
		this.map.once("load", () =>
			container
				.querySelector(".maplibregl-compact-show")
				?.classList.remove("maplibregl-compact-show"),
		);
		this.map.on("moveend", () => this.draw());
	}

	/** Replace the sightings shown (flyway-filtered, already coloured per species). */
	setReports(reports: Report[]) {
		this.index.load(
			reports.map((r) => ({
				type: "Feature" as const,
				properties: { c: r.c },
				geometry: { type: "Point" as const, coordinates: [r.pos[0], r.pos[1]] },
			})),
		);
		this.draw();
	}

	private clusters() {
		const z = Math.floor(this.map.getZoom() + 1);
		return this.index.getClusters([-180, -85, 180, 85], z).map((f) => {
			const n = (f.properties as { point_count?: number }).point_count ?? 1;
			return {
				pos: f.geometry.coordinates as LonLat,
				n,
				c: n > 1 ? ([244, 244, 245] as Rgb) : (f.properties as { c: Rgb }).c,
			};
		});
	}

	/** Redraw routes and flock positions for the enabled species on day `d`. */
	update(species: PreparedSpecies[], d: number, paths: PathOptions) {
		this.last = { species, d, paths };
		this.draw();
	}

	/** Dim full routes plus a bright flown part on the leg being flown, depending on the Paths mode. */
	private routes(
		species: PreparedSpecies[],
		d: number,
		{ mode, focus }: PathOptions,
	) {
		const out: RouteItem[] = [];
		for (const s of species) {
			if (mode === "focus" && focus && s.id !== focus) continue;
			const own = mode === "focus" && s.id === focus ? rgb(s.color) : null;
			for (const p of s.pops) {
				const st = popState(p, d);
				const legs = [
					{ r: p.sp, c: own ?? SPRING, on: st.phase === "spring" },
					{ r: p.au, c: own ?? AUTUMN, on: st.phase === "autumn" },
				];
				for (const { r, c, on } of legs) {
					if (mode === "active" && !on) continue;
					out.push({ path: r.pts, c, a: on ? 80 : 70, w: 2 });
					if (on) out.push({ path: sliceTo(r, st.f), c, a: 240, w: 3.5 });
				}
			}
		}
		return out;
	}

	private draw() {
		const { species, d, paths } = this.last;
		const routes = this.routes(species, d, paths);
		const flocks: Flock[] = species.flatMap((s) =>
			s.pops.map((p) => {
				const st = popState(p, d);
				return {
					pos: st.pos,
					c: rgb(s.color),
					s,
					name: p.name,
					phase: st.phase,
				};
			}),
		);
		this.overlay.setProps({
			layers: [
				new PathLayer<RouteItem>({
					...GP,
					id: "routes",
					data: routes,
					getPath: (r) => r.path,
					getColor: (r): [number, number, number, number] => [...r.c, r.a],
					getWidth: (r) => r.w,
					widthUnits: "pixels",
					capRounded: true,
					jointRounded: true,
				}),
				new ScatterplotLayer<{ pos: LonLat; n: number; c: Rgb }>({
					...GP,
					id: "reports",
					data: this.clusters(),
					getPosition: (r) => r.pos,
					getRadius: (r) => 3 + Math.min(10, Math.sqrt(r.n) * 1.6),
					radiusUnits: "pixels",
					getFillColor: (r): [number, number, number, number] => [...r.c, 170],
				}),
				new ScatterplotLayer<Flock>({
					...GP,
					id: "flocks",
					data: flocks,
					getPosition: (f) => f.pos,
					getRadius: 7,
					radiusUnits: "pixels",
					getFillColor: (f): [number, number, number, number] => [...f.c, 255],
					stroked: true,
					getLineColor: [250, 250, 250, 255],
					lineWidthUnits: "pixels",
					getLineWidth: 2,
				}),
			],
		});
	}

	destroy() {
		this.map.remove();
	}
}
