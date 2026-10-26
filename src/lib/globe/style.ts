import type { StyleSpecification } from "maplibre-gl";

const OFM = "https://tiles.openfreemap.org";
const GIBS =
	"https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_ShadedRelief_Bathymetry/default/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpeg";

/** NASA imagery with OpenFreeMap borders and labels on top, rendered as a globe. */
export const globeStyle: StyleSpecification = {
	version: 8,
	projection: { type: "globe" },
	glyphs: `${OFM}/fonts/{fontstack}/{range}.pbf`,
	sources: {
		gibs: {
			type: "raster",
			tiles: [GIBS],
			tileSize: 256,
			maxzoom: 8,
			attribution: "NASA GIBS",
		},
		omt: { type: "vector", url: `${OFM}/planet` },
	},
	sky: {
		"atmosphere-blend": 0.6,
		"sky-color": "#0b0b14",
		"horizon-color": "#4c1d95",
		"sky-horizon-blend": 0.4,
	},
	layers: [
		{ id: "bg", type: "background", paint: { "background-color": "#09090b" } },
		{
			id: "imagery",
			type: "raster",
			source: "gibs",
			paint: { "raster-brightness-max": 0.8, "raster-saturation": -0.2 },
		},
		{
			id: "borders",
			type: "line",
			source: "omt",
			"source-layer": "boundary",
			filter: ["<=", ["get", "admin_level"], 2],
			paint: {
				"line-color": "#f4f4f5",
				"line-opacity": 0.35,
				"line-width": 0.7,
			},
		},
		{
			id: "countries",
			type: "symbol",
			source: "omt",
			"source-layer": "place",
			filter: ["==", ["get", "class"], "country"],
			layout: {
				"text-field": ["get", "name:latin"],
				"text-font": ["Noto Sans Regular"],
				"text-size": 11,
				"text-transform": "uppercase",
				"text-letter-spacing": 0.1,
			},
			paint: {
				"text-color": "#f4f4f5",
				"text-opacity": 0.8,
				"text-halo-color": "#09090b",
				"text-halo-width": 1.2,
			},
		},
		{
			id: "cities",
			type: "symbol",
			source: "omt",
			"source-layer": "place",
			minzoom: 4,
			filter: ["==", ["get", "class"], "city"],
			layout: {
				"text-field": ["get", "name:latin"],
				"text-font": ["Noto Sans Regular"],
				"text-size": 11,
			},
			paint: {
				"text-color": "#f4f4f5",
				"text-halo-color": "#09090b",
				"text-halo-width": 1.2,
			},
		},
	],
};
