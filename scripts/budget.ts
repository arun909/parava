// Fails the build if the JS budget is blown: content pages ship no JS, and the globe stays under its size.
import { gzipSync } from "node:zlib";
import { Glob } from "bun";

const GLOBE_GZ_KB = 560; // maplibre + deck.gl are about 520 KB gzipped on their own
const OTHER_GZ_KB = 60;

let failed = false;
const fail = (m: string) => {
	console.error(`✗ ${m}`);
	failed = true;
};

for await (const f of new Glob("dist/_astro/*.js").scan()) {
	const kb = gzipSync(await Bun.file(f).bytes()).length / 1024;
	const limit = /Globe\./.test(f) ? GLOBE_GZ_KB : OTHER_GZ_KB;
	console.log(`${kb.toFixed(0).padStart(5)} KB gz  ${f}`);
	if (kb > limit) fail(`${f} is ${kb.toFixed(0)} KB gz, budget ${limit}`);
}
for await (const f of new Glob("dist/**/*.html").scan()) {
	if (f.includes("globe")) continue;
	if ((await Bun.file(f).text()).includes("<script"))
		fail(`${f} ships JavaScript`);
}
process.exit(failed ? 1 : 0);
