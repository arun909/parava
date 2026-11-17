<script lang="ts" module>
import type { LonLat, Phase } from "@/lib/model";

export interface HeroBird {
	id: string;
	name: string;
	phase: Phase;
	pos: LonLat;
	/** Waypoints of the leg being flown, for birds on the move. */
	route?: LonLat[];
}
</script>

<script lang="ts">
import type { GeoPermissibleObjects } from "d3-geo";
import { geoDistance, geoOrthographic, geoPath } from "d3-geo";

let { birds }: { birds: HeroBird[] } = $props();

const INK = { spring: "156 184 110", autumn: "241 179 98" };
const LABEL: Record<Phase, string> = {
	spring: "Spring migration",
	autumn: "Autumn migration",
	breeding: "On its breeding grounds",
	wintering: "On its wintering grounds",
};
const SPIN = 4; // degrees per second when idle
const IDLE_MS = 2500;
const DISK = 0.9; // globe radius as a share of half the canvas; the rest is atmosphere
const RAD = Math.PI / 180;

// Inverse orthographic projection per pixel, matching d3's geoOrthographic().rotate([λ, φ]),
// so the texture lines up exactly with the routes drawn by d3 on the overlay.
const VERT = `attribute vec2 a; varying vec2 uv; void main() { uv = a; gl_Position = vec4(a, 0.0, 1.0); }`;
const FRAG = `precision highp float;
uniform sampler2D tex;
uniform vec2 rot;
uniform float disk, px, ready;
varying vec2 uv;
const float PI = 3.14159265;
void main() {
	vec2 p = uv / disk;
	float r = length(p);
	// atmosphere: a thin haze that fades out past the limb, and to nothing before the canvas edge so no square shows
	float haze = exp(-max(r - 1.0, 0.0) * 22.0) * 0.5 * (1.0 - smoothstep(0.94, 1.0, length(uv)));
	vec4 sky = vec4(vec3(0.6, 0.76, 1.0) * haze, haze);
	if (r > 1.0) { gl_FragColor = sky; return; }
	float z = sqrt(1.0 - r * r);
	float cp = cos(rot.y), sp = sin(rot.y);
	float lon = atan(p.x, z * cp + p.y * sp) - rot.x;
	float lat = asin(clamp(p.y * cp - z * sp, -1.0, 1.0));
	vec3 c = ready > 0.5 ? texture2D(tex, vec2(fract(lon / (2.0 * PI) + 0.5), 0.5 - lat / PI)).rgb : vec3(0.05, 0.12, 0.2);
	vec3 n = vec3(p, z);
	vec3 L = normalize(vec3(-0.45, 0.5, 0.75));
	float dif = max(dot(n, L), 0.0);
	float ocean = smoothstep(0.02, 0.12, c.b - max(c.r, c.g) * 0.9);
	float spec = pow(max(dot(n, normalize(L + vec3(0.0, 0.0, 1.0))), 0.0), 60.0) * ocean * 0.4;
	vec3 col = c * (0.3 + 0.85 * dif) + spec;
	col = mix(col, vec3(0.62, 0.78, 1.0), pow(1.0 - z, 2.5) * 0.55);
	float a = clamp((1.0 - r) / px, 0.0, 1.0); // anti-aliased limb
	gl_FragColor = mix(sky, vec4(col, 1.0), a);
}`;

let box: HTMLDivElement;
let earth: HTMLCanvasElement;
let canvas: HTMLCanvasElement;
let tip = $state<{ x: number; y: number; bird: HeroBird } | null>(null);

/** Sets up the textured globe; returns a draw function, or null without WebGL. */
function texturedGlobe(el: HTMLCanvasElement) {
	const gl = el.getContext("webgl", { premultipliedAlpha: true, antialias: false });
	if (!gl) return null;
	const sh = (type: number, src: string) => {
		const s = gl.createShader(type)!;
		gl.shaderSource(s, src);
		gl.compileShader(s);
		return s;
	};
	const prog = gl.createProgram()!;
	gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT));
	gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
	gl.bindAttribLocation(prog, 0, "a");
	gl.linkProgram(prog);
	if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
	gl.useProgram(prog);
	gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
	gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
	gl.enableVertexAttribArray(0);
	gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
	const u = (n: string) => gl.getUniformLocation(prog, n);
	let ready = 0;
	const img = new Image();
	img.onload = () => {
		gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
		gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, img);
		ready = 1;
	};
	img.src = "/brand/earth.jpg"; // NASA Blue Marble, December
	return (rot: [number, number]) => {
		gl.viewport(0, 0, el.width, el.height);
		gl.uniform2f(u("rot"), rot[0] * RAD, rot[1] * RAD);
		gl.uniform1f(u("disk"), DISK);
		gl.uniform1f(u("px"), 2 / (el.width * DISK));
		gl.uniform1f(u("ready"), ready);
		gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
	};
}

$effect(() => {
	const ctx = canvas.getContext("2d")!;
	const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
	const proj = geoOrthographic().clipAngle(90).precision(0.4);
	const path = geoPath(proj, ctx);
	const flights = birds.filter((b) => b.route);
	const globe = texturedGlobe(earth);
	let land: GeoPermissibleObjects | null = null;
	let rot: [number, number] = [-78, -18]; // open over India
	let size = 0;
	let lastInput = -Infinity;
	let drag: { x: number; y: number; rot: [number, number] } | null = null;
	let visible = true;
	let frame = 0;
	let prev = performance.now();

	// without WebGL, fall back to a flat globe drawn from the coastline
	if (!globe)
		Promise.all([import("topojson-client"), import("world-atlas/land-110m.json")]).then(([topo, atlas]) => {
			const t = atlas.default as unknown as Parameters<typeof topo.feature>[0];
			land = topo.feature(t, t.objects.land as never) as GeoPermissibleObjects;
		});

	function resize() {
		size = box.clientWidth;
		const dpr = Math.min(devicePixelRatio, 2);
		for (const el of [earth, canvas]) {
			el.width = el.height = Math.round(size * dpr);
			el.style.width = el.style.height = `${size}px`;
		}
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		proj.translate([size / 2, size / 2]).scale((size / 2) * DISK);
	}

	const facing = (p: LonLat) => geoDistance(p, [-rot[0], -rot[1]]) < Math.PI / 2 - 0.02;

	function draw(now: number) {
		proj.rotate(rot);
		globe?.(rot);
		ctx.clearRect(0, 0, size, size);
		if (!globe) {
			ctx.beginPath();
			path({ type: "Sphere" });
			ctx.fillStyle = "#16263a";
			ctx.fill();
			if (land) {
				ctx.beginPath();
				path(land);
				ctx.fillStyle = "#4b6150";
				ctx.fill();
			}
		}

		ctx.lineWidth = 1.1;
		for (const b of flights) {
			ctx.beginPath();
			path({ type: "LineString", coordinates: b.route! });
			ctx.strokeStyle = `rgb(${INK[b.phase as "spring" | "autumn"]} / 0.5)`;
			ctx.stroke();
		}

		// resting birds as quiet dots, birds in flight as bright pulsing ones
		const pulse = still ? 0.5 : (now / 1600) % 1;
		for (const b of birds) {
			if (!facing(b.pos)) continue;
			const [x, y] = proj(b.pos)!;
			if (b.route) {
				const ink = INK[b.phase as "spring" | "autumn"];
				ctx.beginPath();
				ctx.arc(x, y, 3 + pulse * 7, 0, 7);
				ctx.fillStyle = `rgb(${ink} / ${0.4 * (1 - pulse)})`;
				ctx.fill();
				ctx.beginPath();
				ctx.arc(x, y, 3, 0, 7);
				ctx.fillStyle = `rgb(${ink})`;
				ctx.fill();
			} else {
				ctx.beginPath();
				ctx.arc(x, y, 1.6, 0, 7);
				ctx.fillStyle = "rgb(255 255 250 / 0.6)";
				ctx.fill();
			}
		}
		if (tip) {
			const [x, y] = proj(tip.bird.pos)!;
			ctx.beginPath();
			ctx.arc(x, y, 6, 0, 7);
			ctx.strokeStyle = "#fbfaf4";
			ctx.lineWidth = 1.5;
			ctx.stroke();
		}
	}

	function tick(now: number) {
		const dt = Math.min(now - prev, 100) / 1000;
		prev = now;
		if (!still && !drag && now - lastInput > IDLE_MS) rot = [rot[0] + SPIN * dt, rot[1]];
		draw(now);
		if (visible) frame = requestAnimationFrame(tick);
	}

	function nearest(e: PointerEvent): HeroBird | null {
		const rect = canvas.getBoundingClientRect();
		const mx = e.clientX - rect.left;
		const my = e.clientY - rect.top;
		let best: HeroBird | null = null;
		let bd = 100; // within 10px
		for (const b of birds) {
			if (!facing(b.pos)) continue;
			const [x, y] = proj(b.pos)!;
			const d = (x - mx) ** 2 + (y - my) ** 2;
			if (d < bd || (b.route && d < bd * 1.5)) [best, bd] = [b, d];
		}
		return best;
	}

	function down(e: PointerEvent) {
		canvas.setPointerCapture(e.pointerId);
		drag = { x: e.clientX, y: e.clientY, rot: [...rot] };
		lastInput = performance.now();
	}
	function move(e: PointerEvent) {
		lastInput = performance.now();
		if (drag) {
			const k = 180 / (size * 1.2);
			rot = [drag.rot[0] + (e.clientX - drag.x) * k, Math.max(-60, Math.min(60, drag.rot[1] - (e.clientY - drag.y) * k))];
			tip = null;
			if (still) draw(0);
			return;
		}
		const b = nearest(e);
		const rect = canvas.getBoundingClientRect();
		tip = b ? { x: e.clientX - rect.left, y: e.clientY - rect.top, bird: b } : null;
		canvas.style.cursor = b ? "pointer" : "grab";
		if (still) draw(0);
	}
	function up(e: PointerEvent) {
		const moved = drag && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 4;
		drag = null;
		if (!moved) {
			const b = nearest(e);
			if (b) location.href = `/species/${b.id}/`;
		}
	}
	function key(e: KeyboardEvent) {
		const step = { ArrowLeft: [-10, 0], ArrowRight: [10, 0], ArrowUp: [0, -8], ArrowDown: [0, 8] }[e.key];
		if (!step) return;
		e.preventDefault();
		lastInput = performance.now();
		rot = [rot[0] - step[0]!, Math.max(-60, Math.min(60, rot[1] + step[1]!))];
		if (still) draw(0);
	}
	const leave = () => (tip = null);

	resize();
	const ro = new ResizeObserver(() => {
		resize();
		draw(performance.now());
	});
	ro.observe(box);
	// stop drawing while the hero is scrolled out of view
	const io = new IntersectionObserver(([e]) => {
		visible = e!.isIntersecting;
		cancelAnimationFrame(frame);
		if (visible) {
			prev = performance.now();
			frame = requestAnimationFrame(tick);
		}
	});
	io.observe(box);
	canvas.addEventListener("pointerdown", down);
	canvas.addEventListener("pointermove", move);
	canvas.addEventListener("pointerup", up);
	canvas.addEventListener("pointerleave", leave);
	canvas.addEventListener("keydown", key);
	return () => {
		cancelAnimationFrame(frame);
		ro.disconnect();
		io.disconnect();
		canvas.removeEventListener("pointerdown", down);
		canvas.removeEventListener("pointermove", move);
		canvas.removeEventListener("pointerup", up);
		canvas.removeEventListener("pointerleave", leave);
		canvas.removeEventListener("keydown", key);
	};
});
</script>

<div class="globe" bind:this={box}>
	<canvas class="earth" bind:this={earth} aria-hidden="true"></canvas>
	<canvas
		bind:this={canvas}
		tabindex="0"
		aria-label="Globe of where migratory birds are today. Drag or use the arrow keys to turn it."
	></canvas>
	{#if tip}
		<div class="tip" style:left="{tip.x}px" style:top="{tip.y}px">
			<strong>{tip.bird.name}</strong>
			<span>{LABEL[tip.bird.phase]}</span>
		</div>
	{/if}
</div>

<style>
	.globe { position: relative; width: 100%; aspect-ratio: 1; }
	canvas { position: absolute; inset: 0; display: block; }
	canvas:not(.earth) { cursor: grab; touch-action: pan-y; border-radius: 50%; }
	canvas:not(.earth):active { cursor: grabbing; }
	.tip { position: absolute; transform: translate(-50%, calc(-100% - 14px)); pointer-events: none; padding: 6px 10px; border-radius: 10px; background: var(--surface); border: 1px solid var(--line); box-shadow: var(--shadow); font-size: 0.8rem; line-height: 1.3; white-space: nowrap; text-align: left; }
	.tip strong { display: block; font-weight: 600; }
	.tip span { color: var(--muted); }
</style>
