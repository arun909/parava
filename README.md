# Flyway

Bird migration on a 3D globe: Astro + Svelte 5, MapLibre + deck.gl, a clean dark OpenFreeMap basemap. Bun only.

```bash
bun install
bun run dev       # http://localhost:4321
bun run check     # astro check + biome
bun test
bun run build && bun run budget
bun run audit     # re-check seasons against GBIF, rewrites src/data/evidence.json
bun run india     # regenerate the estimated India migrants and verify them (a couple of hours: GBIF allows about 2.5 requests a second; needs EBIRD_KEY in .env)
bun run india:verify  # re-estimate and re-verify from the cached GBIF data (seconds)
```

## Deploy

Static output in `dist/`. On Cloudflare Pages: `bun run deploy` (needs `wrangler login`), or connect the repo with build command `bun run build` and output `dist`.
Set the real domain as `site` in `astro.config.mjs` (used for the sitemap).

## Data

Sightings come live from iNaturalist and GBIF in the browser. eBird needs your own key (entered on the globe, kept in local storage).

### Two kinds of species

- **Hand-modelled (20):** flyways written by hand in `src/data/species.ts` and checked against GBIF season records.
- **Estimated (India migrants):** every species that is clearly seasonal in India, with a route estimated from GBIF sightings by `scripts/india-geo.ts`. India's seasonality decides whether it is a winter visitor, summer visitor or passage migrant; its other range comes from records in the months it is away, weighted towards countries near India so feral or introduced flocks do not pull the route off. Dates come from when India's relative presence crosses 50%. These are estimates, not field studies, and the app labels them as such. `scripts/india-verify.ts` checks them against known species, the hand-modelled routes and sanity rules, flags doubtful ones as low confidence (shown in the app) and writes `docs/india-estimates-report.md`. Species too rare to judge, resident all year, or moving under 400 km are left out.
