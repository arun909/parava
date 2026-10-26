# Flyway

Bird migration on a 3D globe: Astro + Svelte 5, MapLibre + deck.gl, NASA GIBS imagery, OpenFreeMap labels. Bun only.

```bash
bun install
bun run dev       # http://localhost:4321
bun run check     # astro check + biome
bun test
bun run build && bun run budget
bun run audit     # re-check seasons against GBIF, rewrites src/data/evidence.json
```

## Deploy

Static output in `dist/`. On Cloudflare Pages: `bun run deploy` (needs `wrangler login`), or connect the repo with build command `bun run build` and output `dist`.
Set the real domain as `site` in `astro.config.mjs` (used for the sitemap).

## Data

Sightings come live from iNaturalist and GBIF in the browser. eBird needs your own key (entered on the globe, kept in local storage).
