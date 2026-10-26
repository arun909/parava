import { PathLayer, ScatterplotLayer } from "@deck.gl/layers";
import { MapboxOverlay } from "@deck.gl/mapbox";
import maplibregl from "maplibre-gl";
import Supercluster from "supercluster";
import {
	formatDay,
	type LonLat,
	type PreparedPop,
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

export interface Hover {
	x: number;
	y: number;
	id: string;
	title: string;
	sub: string;
}
export interface Handlers {
	onHover: (h: Hover | null) => void;
	onPick: (speciesId: string) => void;
}
interface Meta {
	s: PreparedSpecies;
	pop: PreparedPop;
}
interface RouteItem extends Meta {
	leg: 0 | 1;
	km: number;
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
interface Flock extends Meta {
	pos: LonLat;
	c: Rgb;
	phase: string;
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
	private away: Report[] = [];
	private index = new Supercluster<{ c: Rgb }>({
		radius: 45,
		maxZoom: 8,
	}).load([]); // getClusters throws on an index that was never loaded
	private last: { species: PreparedSpecies[]; d: number; paths: PathOptions } =
		{
			species: [],
			d: 1,
			paths: { mode: "active" },
		};

	constructor(
		container: HTMLElement,
		private handlers: Handlers,
	) {
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
		this.overlay.setProps({
			pickingRadius: 6,
			onHover: (i) => this.hover(i),
			onClick: (i) => {
				const o = i.object as Meta | undefined;
				if (o) this.handlers.onPick(o.s.id);
			},
		});
		this.map.addControl(this.overlay);
		// start the attribution collapsed to its (i) button so it never covers the controls
		this.map.once("load", () =>
			container
				.querySelector(".maplibregl-compact-show")
				?.classList.remove("maplibregl-compact-show"),
		);
		this.map.on("moveend", () => this.draw());
	}

	/** Fly the camera to a position (longitudes may be unwrapped past 180). */
	flyTo([lon, lat]: LonLat, zoom = 4) {
		this.map.flyTo({
			center: [((((lon + 180) % 360) + 360) % 360) - 180, lat],
			zoom,
			duration: 1800,
			essential: true,
		});
	}

	/** Calls back once the map has painted (or after 4 s, whichever is first). */
	whenPainted(fn: () => void) {
		let done = false;
		const go = () => {
			if (done) return;
			done = true;
			fn();
		};
		this.map.once("idle", go);
		setTimeout(go, 4000);
	}

	private hover(i: { object?: unknown; x: number; y: number }) {
		const o = i.object as
			| (Partial<RouteItem> & Partial<Flock> & Meta)
			| undefined;
		this.map.getCanvas().style.cursor = o ? "pointer" : "";
		if (!o) return this.handlers.onHover(null);
		const base = { x: i.x, y: i.y, id: o.s.id };
		if (o.leg === undefined)
			return this.handlers.onHover({
				...base,
				title: o.s.name,
				sub: `${o.pop.name} · ${o.phase}`,
			});
		const [from, to] =
			o.leg === 0 ? [o.pop.dep[0], o.pop.dep[1]] : [o.pop.dep[2], o.pop.dep[3]];
		this.handlers.onHover({
			...base,
			title: o.s.name,
			sub: `${o.pop.name} · ${o.leg === 0 ? "spring" : "autumn"} route · ${Math.round(o.km ?? 0).toLocaleString()} km · ${formatDay(from ?? 1)} to ${formatDay(to ?? 1)}`,
		});
	}

	/** Replace the sightings shown (flyway-filtered, already coloured per species). */
	setReports(reports: Report[], away: Report[] = []) {
		this.away = away;
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
					{
						r: p.sp,
						c: own ?? SPRING,
						on: st.phase === "spring",
						leg: 0 as const,
					},
					{
						r: p.au,
						c: own ?? AUTUMN,
						on: st.phase === "autumn",
						leg: 1 as const,
					},
				];
				for (const { r, c, on, leg } of legs) {
					if (mode === "active" && !on) continue;
					const m = { s, pop: p, leg, km: r.len, c };
					out.push({ ...m, path: r.pts, a: on ? 80 : 70, w: 2 });
					if (on) out.push({ ...m, path: sliceTo(r, st.f), a: 240, w: 3.5 });
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
					pop: p,
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
					widthMinPixels: 2,
					pickable: true,
					autoHighlight: true,
					highlightColor: [255, 255, 255, 140],
					capRounded: true,
					jointRounded: true,
				}),
				// birds seen away from their expected range: hollow rings in the species colour
				new ScatterplotLayer<Report>({
					...GP,
					id: "away",
					data: this.away,
					getPosition: (r) => r.pos,
					getRadius: 5,
					radiusUnits: "pixels",
					filled: false,
					stroked: true,
					getLineColor: (r): [number, number, number, number] => [...r.c, 230],
					lineWidthUnits: "pixels",
					getLineWidth: 1.6,
				}),
				new ScatterplotLayer<{ pos: LonLat; n: number; c: Rgb }>({
					...GP,
					id: "reports",
					data: this.clusters(),
					getPosition: (r) => r.pos,
					getRadius: (r) => 3 + Math.min(7, Math.sqrt(r.n) * 1.1),
					radiusUnits: "pixels",
					getFillColor: (r): [number, number, number, number] => [
						...r.c,
						r.n > 1 ? 80 : 170,
					],
				}),
				new ScatterplotLayer<Flock>({
					...GP,
					id: "flocks",
					data: flocks,
					getPosition: (f) => f.pos,
					getRadius: 7,
					radiusUnits: "pixels",
					pickable: true,
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
