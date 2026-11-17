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
const SPRING: Rgb = [100, 132, 70]; // brand leaf, deepened to read on the light map
const AUTUMN: Rgb = [214, 122, 34]; // brand sun
// deck draws on top of the globe; depth testing against the tiles causes z-fighting
const GP = {
	parameters: { depthCompare: "always", depthWriteEnabled: false },
} as const;

// glows layer over each other: additive blending, which builds a heat map on a dark map, washes out to white on a light one
const OVER = {
	parameters: {
		depthCompare: "always",
		depthWriteEnabled: false,
		blend: true,
		blendColorOperation: "add",
		blendColorSrcFactor: "src-alpha",
		blendColorDstFactor: "one-minus-src-alpha",
		blendAlphaOperation: "add",
		blendAlphaSrcFactor: "one",
		blendAlphaDstFactor: "one-minus-src-alpha",
	},
} as const;
const RAD = Math.PI / 180;
/** A canvas laid over the whole Web Mercator world. */
const WORLD: [LonLat, LonLat, LonLat, LonLat] = [
	[-180, 85.0511],
	[180, 85.0511],
	[180, -85.0511],
	[-180, -85.0511],
];
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
/** A small chevron (">") at fraction `f` of a route, pointing along the direction of travel; `size` is in degrees. */
function arrow(r: Parameters<typeof at>[0], f: number, size: number): LonLat[] {
	const [lon, lat] = at(r, f);
	const back = at(r, Math.max(0, f - 0.004));
	const fwd = at(r, Math.min(1, f + 0.004));
	const cos = Math.max(0.2, Math.cos((lat * Math.PI) / 180));
	// heading in a local flat plane (east, north), then the two wings 150 degrees either side of the way ahead
	let dx = (fwd[0] - back[0]) * cos;
	if (Math.abs(fwd[0] - back[0]) > 180)
		dx = (fwd[0] - back[0] - Math.sign(fwd[0] - back[0]) * 360) * cos;
	const dy = fwd[1] - back[1];
	const len = Math.hypot(dx, dy) || 1;
	const h = Math.atan2(dy, dx);
	const wing = (a: number): LonLat => [
		lon + (Math.cos(h + a) * size) / cos,
		lat + Math.sin(h + a) * size,
	];
	return [wing(Math.PI * 0.82), [lon, lat], wing(-Math.PI * 0.82)].map(
		(p) => (len ? p : [lon, lat]) as LonLat,
	);
}

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
/** density: where the birds are on the chosen date; routes: the routes' glow. */
export type Show = "density" | "routes";
export type View = "globe" | "flat";
export interface PathOptions {
	show: Show;
	/** Which legs the routes glow along: the one being flown now, or the whole year's. */
	span: "current" | "year";
	/** The species whose card is open: its routes drawn crisp in its own colour, the rest dimmed. */
	focus?: string;
	/** Draw every route as a hovered one is (a traced line with drifting arrows) instead of the glow. */
	traceAll?: boolean;
}
type Sel = { s: PreparedSpecies; pop: PreparedPop; leg: 0 | 1 };
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
	private view: View = "globe";
	private pad = { top: 0, right: 0, bottom: 0, left: 0 };
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
			paths: { show: "density", span: "current" },
		};

	constructor(
		container: HTMLElement,
		private handlers: Handlers,
	) {
		this.map = new maplibregl.Map({
			container,
			style: globeStyle,
			center: [50, 20],
			zoom: container.clientWidth < 600 ? 0.6 : 1.4,
			maxZoom: 9,
			// sharp enough on any screen; 3x phones would otherwise draw over twice the pixels
			pixelRatio: Math.min(2, window.devicePixelRatio || 1),
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
				coordinates: WORLD,
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
				"states",
			);
			this.paintHeat();
		});
	}

	/** Switch between the 3D globe and a flat 2D map. */
	setView(view: View) {
		if (view === this.view) return;
		this.view = view;
		const apply = () => {
			this.map.setProjection({ type: view === "globe" ? "globe" : "mercator" });
			// one world framed by the sky, not ocean repeated edge to edge
			this.map.setRenderWorldCopies(view === "globe");
			this.map.setTransformConstrain(view === "flat" ? this.keepWorld : null);
			this.map.setPaintProperty(
				"bg",
				"background-opacity",
				view === "globe" ? 1 : 0,
			);
			this.fit(this.pad);
		};
		if (this.map.isStyleLoaded()) apply();
		else this.map.once("style.load", apply);
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

	private sel: Sel | null = null;
	private selAt = 0;
	private raf = 0;
	private tick = () => {
		this.draw();
		this.raf = this.moving ? requestAnimationFrame(this.tick) : 0;
	};
	/** Arrows are drifting somewhere: a route is hovered, or every route is traced. */
	private get moving() {
		const { paths } = this.last;
		return !!this.sel || (paths.show === "routes" && !!paths.traceAll);
	}
	private select(sel: Sel | null) {
		const same =
			sel && this.sel && sel.pop === this.sel.pop && sel.leg === this.sel.leg;
		if (same || (!sel && !this.sel)) return;
		this.sel = sel;
		this.selAt = performance.now();
		if (this.moving && !this.raf) this.raf = requestAnimationFrame(this.tick);
		else if (!sel) this.draw();
	}

	/** Every route of the enabled species, on the legs the span shows, for tracing them all. */
	private traced(): Sel[] {
		const { species, d, paths } = this.last;
		if (paths.show !== "routes" || !paths.traceAll) return [];
		const out: Sel[] = [];
		for (const s of species)
			for (const pop of s.pops) {
				const { phase } = popState(pop, d);
				for (const leg of [0, 1] as const)
					if (
						paths.span === "year" ||
						s.id === paths.focus ||
						phase === (leg === 0 ? "spring" : "autumn")
					)
						out.push({ s, pop, leg });
			}
		return out;
	}

	/**
	 * The hovered route, drawn like a flight tracker: a solid line where the flock has already flown, a fainter one still ahead,
	 * and small arrows that drift slowly along the whole route in the direction of travel. With "Lines" on, every route is drawn so.
	 */
	private trace(now: number) {
		const { focus } = this.last.paths;
		// fades in, so the reveal is calm; with a species focused, the other traced routes step back
		const all = this.traced().map((t) => ({
			...t,
			e: focus && t.s.id !== focus ? 0.35 : 1,
			// a few arrows in the route's own colour, so a map full of routes stays readable
			n: 5,
			hovered: false,
		}));
		if (this.sel)
			all.push({
				...this.sel,
				e: Math.min(1, (now - this.selAt) / 400),
				n: 14,
				hovered: true,
			});
		if (!all.length) return [];
		// arrows are drawn in degrees, so their size follows the zoom to stay about 11 pixels long
		const size = 2.6 * 2 ** (1.8 - this.map.getZoom());
		const phase = (now / 14000) % 1; // the arrows advance one spacing every 14 seconds: very slow
		type Line = { path: LonLat[]; c: Rgb; e: number; ink?: Rgb };
		const ahead: Line[] = [];
		const flown: Line[] = [];
		const arrows: Line[] = [];
		for (const t of all) {
			const r = t.leg === 0 ? t.pop.sp : t.pop.au;
			const c = rgb(t.s.color);
			const st = popState(t.pop, this.last.d);
			const active = st.route === r;
			// traced routes are stronger than a hovered one's faint line ahead, since they stand on their own
			ahead.push({ path: r.pts, c, e: t.hovered ? t.e : t.e * 1.6 });
			if (active) {
				const f = sliceTo(r, st.f);
				if (f.length > 1) flown.push({ path: f, c, e: t.e });
			}
			const ink: Rgb | undefined = t.hovered ? [60, 64, 67] : undefined;
			const sz = t.hovered ? size : size * 0.8;
			for (let i = 0; i < t.n; i++)
				arrows.push({ path: arrow(r, (i + phase) / t.n, sz), c, e: t.e, ink });
			// the flock itself gets a larger arrow showing where it is heading
			if (active && t.hovered)
				arrows.push({ path: arrow(r, st.f, size * 1.7), c, e: t.e, ink });
		}
		const line = (id: string, data: Line[], a: number, w: number) =>
			new PathLayer<Line>({
				...GP,
				id,
				data,
				getPath: (l) => l.path,
				getColor: (l): [number, number, number, number] => [
					...(l.ink ?? l.c),
					Math.min(255, a * l.e),
				],
				getWidth: w,
				widthUnits: "pixels",
				capRounded: true,
				jointRounded: true,
			});
		return [
			line("trace-ahead", ahead, 90, 1.4),
			line("trace-flown", flown, 235, 2.6),
			line("trace-arrows", arrows, 210, 1.6),
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
	 * Keep the globe inside the part of the window the panels leave free: the padding moves its centre, and the zoom that shows
	 * the whole world inside that space, with a margin, is as far out as the viewer can go and where the view opens.
	 */
	fit(pad: { top: number; right: number; bottom: number; left: number }) {
		this.pad = pad;
		const c = this.map.getContainer();
		// the flat map covers the whole map area, under the header and timeline; the globe sits in the space they leave
		const p =
			this.view === "flat" ? { top: 0, right: 0, bottom: 0, left: 0 } : pad;
		const w = c.clientWidth - p.left - p.right;
		const h = c.clientHeight - p.top - p.bottom;
		this.map.setPadding(p);
		if (w < 100 || h < 100) return;
		// a globe at zoom z is about 512 * 2^z / pi pixels across; the flat world is a 512 * 2^z square, as small as still covers
		const zoom =
			this.view === "globe"
				? Math.log2((Math.PI * Math.min(w, h) * 0.72) / 512)
				: Math.log2(Math.max(w, h) / 512);
		const whole = Math.max(-1, Math.min(3, zoom));
		this.map.setMinZoom(whole);
		if (this.moved) return;
		this.map.easeTo({
			zoom: whole,
			// the flat map opens on the northern latitudes most flyways cross; keepWorld holds its edges to the frame
			...(this.view === "flat" && { center: [this.map.getCenter().lng, 25] }),
			padding: p,
			duration: 0,
		});
	}

	/**
	 * The flat map's own limits: the world cannot be dragged past the edges of the map area, and is centred on an axis where it is
	 * smaller (only for a moment, while the minimum zoom catches up with a resize).
	 */
	private keepWorld = (lngLat: maplibregl.LngLat, z: number) => {
		const zoom = Math.max(z, this.map.getMinZoom());
		const size = 512 * 2 ** zoom;
		const c = this.map.getContainer();
		const w = c.clientWidth;
		const h = c.clientHeight;
		const keep = (v: number, span: number) =>
			span >= size
				? size / 2
				: Math.min(size - span / 2, Math.max(span / 2, v));
		const lat = Math.max(-85.0511, Math.min(85.0511, lngLat.lat));
		const merc = (1 - Math.asinh(Math.tan(lat * RAD)) / Math.PI) / 2;
		const x = keep(((lngLat.lng + 180) / 360) * size, w) / size;
		const y = keep(merc * size, h) / size;
		return {
			center: new maplibregl.LngLat(
				x * 360 - 180,
				Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) / RAD,
			),
			zoom,
		};
	};

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
		if (this.moving && !this.raf) this.raf = requestAnimationFrame(this.tick);
		this.paintHeat();
	}

	/** Redraws the density image (at most once a frame) and tells the map to pick it up. */
	private paintHeat() {
		if (!this.heat || this.heatQueued) return;
		this.heatQueued = requestAnimationFrame(() => {
			this.heatQueued = 0;
			const { species, d, paths } = this.last;
			const on = paths.show === "density";
			this.map.setLayoutProperty("heat", "visibility", on ? "visible" : "none");
			if (!on || !this.heat) return;
			// a species looked at on its own: the density stays as faint context behind it
			this.map.setPaintProperty(
				"heat",
				"raster-opacity",
				paths.focus ? 0.4 : 0.95,
			);
			this.heat.draw(density(species, d), 0.6 + species.length * 0.022);
			const src = this.map.getSource("heat") as
				| maplibregl.CanvasSource
				| undefined;
			// a canvas source copies the canvas to the GPU only while it is "playing": play for a couple of frames
			src?.play();
			requestAnimationFrame(() => requestAnimationFrame(() => src?.pause()));
			this.map.triggerRepaint();
		});
	}

	/** Dim full routes plus a bright flown part on the leg being flown; the focused species gets both legs, in its own colour. */
	private routes(
		species: PreparedSpecies[],
		d: number,
		{ span, focus }: PathOptions,
	) {
		const out: RouteItem[] = [];
		for (const s of species) {
			const own = s.id === focus ? rgb(s.color) : null;
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
					if (span === "current" && !own && !on) continue;
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
		const { focus } = paths;
		const dim = (id: string) => !!focus && id !== focus;
		// the focused species is drawn as crisp lines, so it stays out of the glow
		const heat: HeatPt[] = routes
			.filter((r) => r.s.id !== focus)
			.flatMap((r) =>
				dense(r.path).map((pos) => ({
					pos,
					c: r.c,
					a: (r.flown ? 1 : r.a > 75 ? 0.55 : 0.35) * (focus ? 0.3 : 1),
				})),
			);
		const focusLines = routes.filter((r) => r.s.id === focus);
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
				...(paths.show === "routes" && !paths.traceAll ? GLOW : []).map(
					([radius, alpha]) =>
						new ScatterplotLayer<HeatPt>({
							...OVER,
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
									...OVER,
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
					getFillColor: (f): [number, number, number, number] => [
						...f.c,
						dim(f.s.id) ? 70 : 255,
					],
					stroked: true,
					getLineColor: (f): [number, number, number, number] => [
						250,
						250,
						250,
						dim(f.s.id) ? 70 : 255,
					],
					updateTriggers: { getFillColor: focus, getLineColor: focus },
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
