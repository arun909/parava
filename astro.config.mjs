// @ts-check

import sitemap from "@astrojs/sitemap";
import svelte from "@astrojs/svelte";
import { defineConfig } from "astro/config";

export default defineConfig({
	site: "https://flyway.example.com", // ponytail: set the real domain at deploy
	integrations: [svelte(), sitemap()],
});
