// The tile builders used by globe-assets.ts ship without types.
declare module "geojson-vt" {
	interface Tile {
		features: unknown[];
	}
	interface Index {
		tileCoords: { z: number; x: number; y: number }[];
		getTile(z: number, x: number, y: number): Tile | null;
	}
	export default function geojsonvt(data: unknown, options?: object): Index;
}
declare module "vt-pbf" {
	export function fromGeojsonVt(
		layers: Record<string, unknown>,
		options?: { version?: number; extent?: number },
	): Uint8Array;
}
