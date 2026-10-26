import { persistQueryClient } from "@tanstack/query-persist-client-core";
import { QueryClient } from "@tanstack/svelte-query";
import { del, get, set } from "idb-keyval";

const DAY = 864e5;

export const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			staleTime: 30 * 60e3,
			gcTime: DAY,
			retry: 1,
			refetchOnWindowFocus: false,
		},
	},
});

/** Sightings survive reloads in IndexedDB for a day, so revisits are instant and sources are not re-hit. */
export function persist() {
	persistQueryClient({
		queryClient,
		maxAge: DAY,
		persister: {
			persistClient: (c) => set("flyway-cache", c),
			restoreClient: () => get("flyway-cache"),
			removeClient: () => del("flyway-cache"),
		},
	});
}
