/// <reference types="astro/client" />

interface ImportMetaEnv {
	/** Your eBird key from .env: on by default in dev and local builds, blanked by `bun run deploy`. */
	readonly DEV_EBIRD_KEY?: string;
}
