// @ts-check

import sitemap from "@astrojs/sitemap";
import svelte from "@astrojs/svelte";
import { defineConfig } from "astro/config";
import { loadEnv } from "vite";

// the key from .env, unless the environment sets it (even to nothing, which is how `bun run deploy` blanks it)
const ebirdKey =
	process.env.EBIRD_KEY ?? loadEnv("", process.cwd(), "EBIRD_").EBIRD_KEY ?? "";

export default defineConfig({
	site: "https://flyway.example.com", // ponytail: set the real domain at deploy
	integrations: [svelte(), sitemap()],
	devToolbar: { enabled: false },
	// the map page was the globe page
	redirects: { "/globe": "/map" },
	vite: {
		build: {
			rollupOptions: {
				output: {
					// separate long-lived chunks: they download in parallel and stay cached across deploys
					manualChunks(id) {
						if (id.includes("maplibre-gl")) return "maplibre";
						if (/@(deck|luma|math|loaders)\.gl/.test(id)) return "deck";
					},
				},
			},
		},
		plugins: [
			{
				// EBIRD_KEY from .env turns eBird on by default in dev and in local builds. It ends up in the built JavaScript, so `bun run deploy`
				// blanks it: a public site must ask visitors for their own key
				name: "dev-ebird-key",
				config: () => ({
					define: {
						"import.meta.env.DEV_EBIRD_KEY": JSON.stringify(ebirdKey),
					},
				}),
			},
		],
	},
});
