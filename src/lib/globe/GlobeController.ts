import { PathLayer, ScatterplotLayer } from "@deck.gl/layers";
import { MapboxOverlay } from "@deck.gl/mapbox";
import maplibregl from "maplibre-gl";
import Supercluster from "supercluster";
import {
	at,
	formatDay,
	type LonLat,
	type PreparedPop,
	type PreparedSpecies,
	popState,
	sliceTo,
} from "@/lib/model";
import { density } from "./density";
import { HEAT_RAMP, HeatCanvas } from "./heat";

export { HEAT_RAMP };

import { globeStyle } from "./style";

type Rgb = [number, number, number];
const SPRING: Rgb = [139, 92, 246];
const AUTUMN: Rgb = [244, 63, 94];
// deck draws on top of the globe; depth testing against the tiles causes z-fighting
const GP = {
	parameters: { depthCompare: "always", depthWriteEnabled: false },
} as const;

// additive blending: overlapping glows add up, which is what makes a heat map
const ADD = {
	parameters: {
		depthCompare: "always",
		depthWriteEnabled: false,
		blend: true,
		blendColorOperation: "add",
		blendColorSrcFactor: "src-alpha",
		blendColorDstFactor: "one",
		blendAlphaOperation: "add",
		blendAlphaSrcFactor: "one",
		blendAlphaDstFactor: "one",
	},
} as const;
const AWAY_ZOOM = 3.5; // off-path sightings appear once you zoom in this far
// soft glow: wide faint, medium and tight cores stacked
const GLOW: [radius: number, alpha: number][] = [
	[20, 1],
	[11, 1.8],
	[5, 3.6],
];
interface HeatPt {
	pos: LonLat;
	c: Rgb;
	a: number;
}
/** Subdivide a polyline so glow dots overlap into a continuous band. */
function dense(path: LonLat[], k = 4): LonLat[] {
	const out: LonLat[] = [];
	for (let i = 0; i < path.length - 1; i++) {
		const [a, b] = [path[i]!, path[i + 1]!];
		for (let j = 0; j < k; j++)
			out.push([
				a[0] + ((b[0] - a[0]) * j) / k,
				a[1] + ((b[1] - a[1]) * j) / k,
			]);
	}
	const last = path.at(-1);
	if (last) out.push(last);
	return out;
}
const hash = (i: number, k: number) => {
	const x = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453;
	return x - Math.floor(x);
};

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
	flown: boolean;
	path: LonLat[];
	c: Rgb;
	a: number;
	w: number;
}
export type HeatMode = "now" | "flyways" | "off";
export interface PathOptions {
	mode: "active" | "all" | "focus";
	focus?: string;
	/** now: where the birds are on the chosen date; flyways: the routes' glow; off: none. */
	heat: HeatMode;
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
	private heat?: HeatCanvas;
	/** The viewer has moved the camera themselves: do not re-fit it behind their back. */
	private moved = false;
	private heatQueued = 0;
	private index = new Supercluster<{ c: Rgb }>({
		radius: 45,
		maxZoom: 8,
	}).load([]); // getClusters throws on an index that was never loaded
	private last: { species: PreparedSpecies[]; d: number; paths: PathOptions } =
		{
			species: [],
			d: 1,
			paths: { mode: "active", heat: "now" },
		};

	constructor(
		container: HTMLElement,
		private handlers: Handlers,
	) {
		this.map = new maplibregl.Map({
			container,
			style: globeStyle,
			center: [50, 20],
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
		for (const ev of ["dragstart", "zoomstart", "rotatestart"] as const)
			this.map.on(ev, (e) => {
				if ((e as { originalEvent?: Event }).originalEvent) this.moved = true;
			});
		// the heat map is a canvas laid over the globe under the borders and labels (deck.gl's own HeatmapLayer does not render on
		// MapLibre's globe)
		this.map.on("load", () => {
			this.heat = new HeatCanvas();
			this.map.addSource("heat", {
				type: "canvas",
				canvas: this.heat.canvas,
				coordinates: [
					[-180, 85.0511],
					[180, 85.0511],
					[180, -85.0511],
					[-180, -85.0511],
				],
				animate: false,
			});
			this.map.addLayer(
				{
					id: "heat",
					type: "raster",
					source: "heat",
					paint: {
						"raster-opacity": 0.95,
						"raster-fade-duration": 0,
						"raster-resampling": "linear",
					},
				},
				"borders",
			);
			this.paintHeat();
		});
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

	private sel: { s: PreparedSpecies; pop: PreparedPop; leg: 0 | 1 } | null =
		null;
	private selAt = 0;
	private raf = 0;
	private tick = () => {
		this.draw();
		this.raf = this.sel ? requestAnimationFrame(this.tick) : 0;
	};
	private select(
		sel: { s: PreparedSpecies; pop: PreparedPop; leg: 0 | 1 } | null,
	) {
		const same =
			sel && this.sel && sel.pop === this.sel.pop && sel.leg === this.sel.leg;
		if (same || (!sel && !this.sel)) return;
		this.sel = sel;
		this.selAt = performance.now();
		if (sel && !this.raf) this.raf = requestAnimationFrame(this.tick);
		else if (!sel) this.draw();
	}

	/**
	 * The hovered route is revealed: scattered particles converge on the path while it fades in, then bright
	 * particles keep flowing along it in the direction of travel.
	 */
	private trace(now: number) {
		const sel = this.sel;
		if (!sel) return [];
		const r = sel.leg === 0 ? sel.pop.sp : sel.pop.au;
		const col = rgb(sel.s.color);
		const t = Math.min(1, (now - this.selAt) / 600);
		const e = 1 - (1 - t) ** 3;
		const scatter = Array.from({ length: 56 }, (_, i) => {
			const p = at(r, (i + 0.5) / 56);
			const k = (1 - e) * 3.5;
			return [
				p[0] + (hash(i, 1) - 0.5) * 2 * k,
				p[1] + (hash(i, 2) - 0.5) * 2 * k,
			] as LonLat;
		});
		const flow = Array.from({ length: 30 }, (_, i) =>
			at(r, (now / 7000 + i / 30) % 1),
		);
		return [
			new PathLayer<{ path: LonLat[] }>({
				...GP,
				id: "trace-glow",
				data: [{ path: r.pts }],
				getPath: (d) => d.path,
				getColor: [...col, 28 * e],
				getWidth: 7,
				widthUnits: "pixels",
				capRounded: true,
				jointRounded: true,
			}),
			new PathLayer<{ path: LonLat[] }>({
				...GP,
				id: "trace",
				data: [{ path: r.pts }],
				getPath: (d) => d.path,
				getColor: [...col, 120 * e],
				getWidth: 1.4,
				widthUnits: "pixels",
				capRounded: true,
				jointRounded: true,
			}),
			new ScatterplotLayer<LonLat>({
				...ADD,
				id: "trace-merge",
				data: scatter,
				getPosition: (p) => p,
				getRadius: 1.5,
				radiusUnits: "pixels",
				getFillColor: [...col, 150 * (1 - e * 0.7)],
			}),
			new ScatterplotLayer<LonLat>({
				...ADD,
				id: "trace-flow",
				data: flow,
				getPosition: (p) => p,
				getRadius: 2,
				radiusUnits: "pixels",
				getFillColor: [255, 255, 255, 130 * e],
			}),
		];
	}

	private hover(i: { object?: unknown; x: number; y: number }) {
		const o = i.object as
			| (Partial<RouteItem> & Partial<Flock> & Meta)
			| undefined;
		this.map.getCanvas().style.cursor = o ? "pointer" : "";
		this.select(
			o
				? { s: o.s, pop: o.pop, leg: o.leg ?? (o.phase === "autumn" ? 1 : 0) }
				: null,
		);
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

	/**
	 * Keep the globe inside the part of the window the panels leave free: the padding moves its centre, and until the viewer has
	 * moved the camera, the zoom makes it fill that space.
	 */
	fit(pad: { top: number; right: number; bottom: number; left: number }) {
		const c = this.map.getContainer();
		const w = c.clientWidth - pad.left - pad.right;
		const h = c.clientHeight - pad.top - pad.bottom;
		this.map.setPadding(pad);
		if (this.moved || w < 100 || h < 100) return;
		// a globe at zoom z is about 512 * 2^z / pi pixels across
		const zoom = Math.log2((Math.PI * Math.min(w, h) * 0.94) / 512);
		this.map.easeTo({
			zoom: Math.max(0.6, Math.min(3, zoom)),
			padding: pad,
			duration: 0,
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
		this.paintHeat();
	}

	/** Redraws the density image (at most once a frame) and tells the map to pick it up. */
	private paintHeat() {
		if (!this.heat || this.heatQueued) return;
		this.heatQueued = requestAnimationFrame(() => {
			this.heatQueued = 0;
			const { species, d, paths } = this.last;
			const on = paths.heat === "now";
			this.map.setLayoutProperty("heat", "visibility", on ? "visible" : "none");
			if (!on || !this.heat) return;
			this.heat.draw(density(species, d));
			const src = this.map.getSource("heat") as
				| maplibregl.CanvasSource
				| undefined;
			// a canvas source copies the canvas to the GPU only while it is "playing": play for a couple of frames
			src?.play();
			requestAnimationFrame(() => requestAnimationFrame(() => src?.pause()));
			this.map.triggerRepaint();
		});
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
					out.push({ ...m, flown: false, path: r.pts, a: on ? 80 : 70, w: 2 });
					if (on)
						out.push({
							...m,
							flown: true,
							path: sliceTo(r, st.f),
							a: 240,
							w: 3.5,
						});
				}
			}
		}
		return out;
	}

	private draw() {
		const { species, d, paths } = this.last;
		const routes = this.routes(species, d, paths);
		// full routes carry the picking; the heat map is drawn from every route, hotter where already flown
		const heat: HeatPt[] = routes.flatMap((r) =>
			dense(r.path).map((pos) => ({
				pos,
				c: r.c,
				a: r.flown ? 1 : r.a > 75 ? 0.55 : 0.35,
			})),
		);
		const focusLines = paths.mode === "focus" ? routes : [];
		// a hundred coloured dots would hide the heat map: show flocks for a few species, or once zoomed in
		const showFlocks = species.length <= 30 || this.map.getZoom() >= 4;
		const flocks: Flock[] = (showFlocks ? species : []).flatMap((s) =>
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
				...(paths.heat === "flyways" ? GLOW : []).map(
					([radius, alpha]) =>
						new ScatterplotLayer<HeatPt>({
							...ADD,
							id: `heat-${radius}`,
							data: heat,
							getPosition: (h) => h.pos,
							getRadius: radius,
							radiusUnits: "pixels",
							getFillColor: (h): [number, number, number, number] => [
								...h.c,
								h.a * alpha,
							],
						}),
				),
				// crisp lines only for the focused species; everything else stays a glow until hovered
				new PathLayer<RouteItem>({
					...GP,
					id: "routes-focus",
					data: focusLines,
					getPath: (r) => r.path,
					getColor: (r): [number, number, number, number] => [...r.c, r.a],
					getWidth: (r) => r.w,
					widthUnits: "pixels",
					widthMinPixels: 2,
					capRounded: true,
					jointRounded: true,
				}),
				// an almost invisible, wide strip along every full route so hovering the glow finds it
				new PathLayer<RouteItem>({
					...GP,
					id: "routes-pick",
					data: routes.filter((r) => !r.flown),
					getPath: (r) => r.path,
					getColor: [0, 0, 0, 1],
					getWidth: 16,
					widthUnits: "pixels",
					pickable: true,
				}),
				// birds seen away from their expected range: small soft glows, only once zoomed in
				...(this.map.getZoom() >= AWAY_ZOOM
					? (
							[
								[8, 38],
								[3, 150],
							] as const
						).map(
							([radius, alpha]) =>
								new ScatterplotLayer<Report>({
									...ADD,
									id: `away-${radius}`,
									data: this.away,
									getPosition: (r) => r.pos,
									getRadius: radius,
									radiusUnits: "pixels",
									getFillColor: (r): [number, number, number, number] => [
										...r.c,
										alpha,
									],
								}),
						)
					: []),
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
				...this.trace(performance.now()),
			],
		});
	}

	destroy() {
		this.map.remove();
	}
}
