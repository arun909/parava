/// <reference types="astro/client" />

interface ImportMetaEnv {
	/** Your eBird key from .env, injected by `bun run dev` only; never present in production builds. */
	readonly DEV_EBIRD_KEY?: string;
}
