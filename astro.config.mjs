// @ts-check

import sitemap from "@astrojs/sitemap";
import svelte from "@astrojs/svelte";
import { defineConfig } from "astro/config";

export default defineConfig({
	site: "https://flyway.example.com", // ponytail: set the real domain at deploy
	integrations: [svelte(), sitemap()],
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
				// EBIRD_KEY from .env prefills the key in dev only, so it can never ship in a build
				name: "dev-ebird-key",
				config: (_, { command }) => ({
					define: {
						"import.meta.env.DEV_EBIRD_KEY": JSON.stringify(
							command === "serve" ? (process.env.EBIRD_KEY ?? "") : "",
						),
					},
				}),
			},
		],
	},
});
