// Fails the build if the JS budget is blown: content pages ship no JS, and the globe stays under its size.
import { gzipSync } from "node:zlib";
import { Glob } from "bun";

const GLOBE_GZ_KB = 600; // maplibre + deck.gl + the globe island and its 300-odd species, all chunks together
const OTHER_GZ_KB = 60;

let failed = false;
const fail = (m: string) => {
	console.error(`✗ ${m}`);
	failed = true;
};

let globeKb = 0;
for await (const f of new Glob("dist/_astro/*.js").scan()) {
	const kb = gzipSync(await Bun.file(f).bytes()).length / 1024;
	console.log(`${kb.toFixed(0).padStart(5)} KB gz  ${f}`);
	if (/\/(Globe|maplibre|deck)\./.test(f)) globeKb += kb;
	else if (kb > OTHER_GZ_KB)
		fail(`${f} is ${kb.toFixed(0)} KB gz, budget ${OTHER_GZ_KB}`);
}
console.log(`${globeKb.toFixed(0).padStart(5)} KB gz  globe total`);
if (globeKb > GLOBE_GZ_KB)
	fail(`globe is ${globeKb.toFixed(0)} KB gz, budget ${GLOBE_GZ_KB}`);
for await (const f of new Glob("dist/**/*.html").scan()) {
	if (f.includes("globe") || f.includes("species/index")) continue; // the globe and the searchable directory are islands
	if ((await Bun.file(f).text()).includes("<script"))
		fail(`${f} ships JavaScript`);
}
process.exit(failed ? 1 : 0);
