import type { Weighted } from "./density";

/** The heat colour ramp, faint to hot (RGBA): also drawn as the legend. */
export const HEAT_RAMP: [number, number, number, number][] = [
	[59, 7, 100, 0],
	[91, 33, 182, 120],
	[139, 92, 246, 180],
	[244, 63, 94, 220],
	[251, 146, 60, 240],
	[253, 224, 71, 250],
	[255, 255, 235, 255],
];

const SIZE = 512; // a Web Mercator square over the whole world; the map smooths it when it stretches it over the globe
const EQUATOR_KM = 40075;
const SIGMA_KM = 380; // how far one bird's presence is smeared
const RAD = Math.PI / 180;
// the Gaussian kernel as a lookup over squared distance in sigmas
const STEPS = 400;
const KERNEL = Float32Array.from({ length: STEPS + 1 }, (_, i) =>
	Math.exp(-(i / STEPS) * 4.5),
);

/** Turns weighted points into a smooth density image, coloured by HEAT_RAMP, ready to lay over the map. */
export class HeatCanvas {
	readonly canvas = document.createElement("canvas");
	private ctx = this.canvas.getContext("2d")!;
	private field = new Float32Array(SIZE * SIZE);
	private image = this.ctx.createImageData(SIZE, SIZE);

	constructor() {
		this.canvas.width = this.canvas.height = SIZE;
	}

	draw(points: Weighted[]) {
		const { field } = this;
		field.fill(0);
		for (const p of points) {
			const lat = Math.max(-84, Math.min(84, p.pos[1]));
			const cx = (((((p.pos[0] + 180) / 360) % 1) + 1) % 1) * SIZE;
			const cy =
				(0.5 -
					Math.log(Math.tan(Math.PI / 4 + (lat * RAD) / 2)) / (2 * Math.PI)) *
				SIZE;
			// Web Mercator stretches distances by 1 / cos(latitude): the kernel grows with it so it stays the same size on the ground
			const s = (SIGMA_KM * SIZE) / EQUATOR_KM / Math.cos(lat * RAD);
			const r = Math.ceil(s * 2.1);
			const inv = 1 / (s * s);
			for (
				let y = Math.max(0, Math.floor(cy - r));
				y <= Math.min(SIZE - 1, Math.ceil(cy + r));
				y++
			) {
				const dy = y - cy;
				for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
					const d2 = (dy * dy + (x - cx) * (x - cx)) * inv;
					if (d2 >= 4.5) continue;
					field[y * SIZE + ((x + SIZE) % SIZE)]! +=
						p.w * KERNEL[((d2 / 4.5) * STEPS) | 0]!;
				}
			}
		}
		const px = this.image.data;
		const top = HEAT_RAMP.length - 1;
		for (let i = 0; i < field.length; i++) {
			const v = field[i]!;
			const o = i * 4;
			if (v < 0.015) {
				px[o + 3] = 0;
				continue;
			}
			// soft saturation: a few overlapping species already read as hot, but a crowd keeps climbing
			const t = (1 - Math.exp(-v / 0.5)) * top;
			const k = Math.min(top - 1, Math.floor(t));
			const f = t - k;
			const a = HEAT_RAMP[k]!;
			const b = HEAT_RAMP[k + 1]!;
			px[o] = a[0] + (b[0] - a[0]) * f;
			px[o + 1] = a[1] + (b[1] - a[1]) * f;
			px[o + 2] = a[2] + (b[2] - a[2]) * f;
			px[o + 3] = a[3] + (b[3] - a[3]) * f;
		}
		this.ctx.putImageData(this.image, 0, 0);
	}
}
