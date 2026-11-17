import type {
	FilterSpecification,
	StyleSpecification,
	SymbolLayerSpecification,
} from "maplibre-gl";

const OFM = "https://tiles.openfreemap.org";
const S2 =
	'<a href="https://s2maps.eu" target="_blank" rel="noreferrer">Sentinel-2 cloudless</a> by EOX IT Services GmbH (contains modified Copernicus Sentinel data 2016)';
/** The deepest zoom of the land cover tiles built by scripts/globe-assets.ts; the map stretches them beyond it. */
const COVER_MAX_Z = 5;
/** A place shows from the zoom its tiles say (`z`): bigger places first. */
const SHOWN: FilterSpecification = [">=", ["zoom"], ["get", "z"]];
const LABEL: SymbolLayerSpecification["layout"] = {
	// lower ranks are bigger places, and win when labels collide
	"symbol-sort-key": ["get", "r"],
	"text-max-width": 8,
};
const HALO = { "text-halo-color": "#ffffff", "text-halo-width": 1.4 } as const;
/** Google Maps' default palette: pale blue water, near-white land, grey borders and labels. */
const WATER = "#aadaff";
const LAND = "#f2efe9";
const INK = "#3c4043";
/** The flat world as one water polygon, so the 2D map is a rectangle that ends where the world does. */
const OCEAN: GeoJSON.Feature = {
	type: "Feature",
	properties: {},
	geometry: {
		type: "Polygon",
		coordinates: [
			[
				[-180, 85.0511],
				[180, 85.0511],
				[180, -85.0511],
				[-180, -85.0511],
				[-180, 85.0511],
			],
		],
	},
};

/**
 * A light map in Google Maps' colours: pastel land cover and hillshaded relief under Natural Earth water, rivers, borders and
 * labels. All but the relief (AWS terrain tiles) and the fonts (OpenFreeMap) is served by this site, so it appears at once.
 */
export const globeStyle: StyleSpecification = {
	version: 8,
	projection: { type: "globe" },
	glyphs: `${OFM}/fonts/{fontstack}/{range}.pbf`,
	sources: {
		world: { type: "geojson", data: OCEAN },
		cover: {
			type: "raster",
			tiles: ["/globe/cover/{z}/{y}/{x}.webp"],
			tileSize: 256,
			maxzoom: COVER_MAX_Z,
			attribution: S2,
		},
		// elevation for the hillshade (Mapzen terrain on AWS open data)
		dem: {
			type: "raster-dem",
			tiles: [
				"https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png",
			],
			encoding: "terrarium",
			tileSize: 256,
			maxzoom: 12,
			attribution:
				'<a href="https://github.com/tilezen/joerd/blob/master/docs/attribution.md" target="_blank" rel="noreferrer">Mapzen terrain</a>',
		},
		// land, sea, lakes, rivers, borders, places and physical features from Natural Earth, as tiles built by scripts/globe-assets.ts
		places: {
			type: "vector",
			// absolute: MapLibre fetches vector tiles from a worker, which cannot resolve a path against the page
			tiles: [`${location.origin}/globe/tiles/{z}/{x}/{y}.pbf`],
			maxzoom: 6,
			attribution:
				'<a href="https://www.naturalearthdata.com/" target="_blank" rel="noreferrer">Natural Earth</a>',
		},
	},
	// no atmosphere: it ray-marches every pixel of every frame and made the globe stutter
	sky: { "atmosphere-blend": 0 },
	layers: [
		// water past the world's 85° edge on the globe; hidden on the flat map, where the world polygon ends the world
		{ id: "bg", type: "background", paint: { "background-color": WATER } },
		{ id: "world", type: "fill", source: "world", paint: { "fill-color": WATER } },
		// plain land while the cover loads
		{
			id: "land",
			type: "fill",
			source: "places",
			"source-layer": "land",
			paint: { "fill-color": LAND },
		},
		{ id: "cover", type: "raster", source: "cover", paint: { "raster-fade-duration": 0 } },
		{
			id: "relief",
			type: "hillshade",
			source: "dem",
			paint: {
				"hillshade-exaggeration": 0.5,
				"hillshade-shadow-color": "#6b6455",
				"hillshade-highlight-color": "#ffffff",
				"hillshade-accent-color": "#8a8270",
			},
		},
		{
			id: "ocean",
			type: "fill",
			source: "places",
			"source-layer": "ocean",
			paint: { "fill-color": WATER },
		},
		{
			id: "lakes",
			type: "fill",
			source: "places",
			"source-layer": "lakes",
			paint: { "fill-color": WATER },
		},
		{
			id: "rivers",
			type: "line",
			source: "places",
			"source-layer": "rivers",
			minzoom: 2,
			paint: {
				"line-color": WATER,
				"line-width": ["interpolate", ["linear"], ["zoom"], 2, 0.5, 8, 2],
			},
		},
		{
			id: "states",
			type: "line",
			source: "places",
			"source-layer": "states",
			minzoom: 3,
			filter: SHOWN,
			paint: {
				"line-color": "#9aa0a6",
				"line-opacity": 0.6,
				"line-width": ["interpolate", ["linear"], ["zoom"], 3, 0.4, 8, 0.9],
				"line-dasharray": [3, 2],
			},
		},
		{
			id: "borders",
			type: "line",
			source: "places",
			"source-layer": "borders",
			paint: {
				"line-color": "#80868b",
				"line-opacity": 0.8,
				"line-width": ["interpolate", ["linear"], ["zoom"], 0, 0.6, 6, 1.3],
			},
		},
		{
			id: "seas",
			type: "symbol",
			source: "places",
			"source-layer": "seas",
			filter: SHOWN,
			layout: {
				...LABEL,
				"text-field": ["get", "name"],
				"text-font": ["Noto Sans Italic"],
				"text-size": ["interpolate", ["linear"], ["get", "r"], 0, 13, 6, 10],
				"text-letter-spacing": 0.08,
			},
			paint: { "text-color": "#4a7fb5", "text-halo-color": WATER, "text-halo-width": 1 },
		},
		{
			id: "physical",
			type: "symbol",
			source: "places",
			"source-layer": "physical",
			filter: SHOWN,
			layout: {
				...LABEL,
				"text-field": ["get", "name"],
				"text-font": ["Noto Sans Italic"],
				"text-size": 10,
				"text-letter-spacing": 0.05,
			},
			paint: { ...HALO, "text-color": "#6d6a5f" },
		},
		{
			id: "regions",
			type: "symbol",
			source: "places",
			"source-layer": "regions",
			minzoom: 3,
			filter: SHOWN,
			layout: {
				...LABEL,
				"text-field": ["get", "name"],
				"text-font": ["Noto Sans Italic"],
				"text-size": ["interpolate", ["linear"], ["zoom"], 3, 9, 8, 12],
				"text-letter-spacing": 0.05,
			},
			paint: { ...HALO, "text-color": "#80868b" },
		},
		{
			id: "cities",
			type: "symbol",
			source: "places",
			"source-layer": "cities",
			minzoom: 2,
			filter: SHOWN,
			layout: {
				...LABEL,
				"text-field": ["get", "name"],
				"text-font": [
					"case",
					["==", ["get", "cap"], 1],
					["literal", ["Noto Sans Bold"]],
					["literal", ["Noto Sans Regular"]],
				],
				"text-size": ["interpolate", ["linear"], ["get", "r"], 0, 13, 10, 10],
			},
			paint: { ...HALO, "text-color": INK },
		},
		{
			id: "countries",
			type: "symbol",
			source: "places",
			"source-layer": "countries",
			filter: SHOWN,
			layout: {
				...LABEL,
				"text-field": ["get", "name"],
				"text-font": ["Noto Sans Bold"],
				"text-size": ["interpolate", ["linear"], ["zoom"], 1, 10, 6, 15],
			},
			paint: { ...HALO, "text-color": "#5f6368" },
		},
	],
};
