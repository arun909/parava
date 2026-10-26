import { createQueries, createQuery } from "@tanstack/svelte-query";
import { PersistedState } from "runed";
import { queryClient } from "@/lib/data/client";
import {
	assess,
	type Classified,
	classify,
	dayOfYear,
	PREPARED,
	type Sighting,
} from "@/lib/model";
import { ebirdCodes, fetchEbird, fetchSightings } from "@/lib/sources";
import type { PathOptions } from "./GlobeController";

const WINDOW_DAYS = 30;

/** Shared UI state for the globe island. */
export class GlobeState {
	day = $state(dayOfYear());
	on = $state(new Set(PREPARED.map((s) => s.id)));
	pathMode = $state<PathOptions["mode"]>("active");
	focus = $state<string | undefined>();
	expanded = $state(false);
	paths = $derived<PathOptions>({ mode: this.pathMode, focus: this.focus });
	/** Your eBird key lives only in this browser and is sent only to api.ebird.org. */
	ebird = new PersistedState("flyway-ebird", {
		key: import.meta.env.DEV_EBIRD_KEY ?? "",
		regions: "IN",
	});
	/** Your location, only for "near you" estimates; kept in this browser and never sent anywhere. */
	home = new PersistedState<{ lon: number; lat: number } | null>(
		"flyway-home",
		null,
	);
	homeError = $state("");
	locate() {
		this.homeError = "";
		navigator.geolocation.getCurrentPosition(
			(p) =>
				(this.home.current = {
					lon: p.coords.longitude,
					lat: p.coords.latitude,
				}),
			(e) => (this.homeError = e.message || "Location unavailable"),
			{ maximumAge: 864e5 },
		);
	}
	/** Draw birds seen far from their expected range as hollow rings. */
	showAway = $state(true);
	card = $state<string | undefined>();
	/** Sightings wait for the map's first paint so tiles get the bandwidth first. */
	ready = $state(false);
	/** Enabled species; in Focus mode only the focused one, so the view is uncluttered. */
	shown = $derived(
		PREPARED.filter((s) =>
			this.pathMode === "focus" && this.focus
				? s.id === this.focus
				: this.on.has(s.id),
		),
	);

	private results = createQueries(
		() => ({
			queries: PREPARED.map((s) => ({
				queryKey: ["sightings", s.id, "v2"],
				enabled: this.ready && this.on.has(s.id),
				queryFn: (): Promise<Sighting[]> =>
					fetchSightings(s, {
						fetch: globalThis.fetch.bind(globalThis),
						since: Date.now() - WINDOW_DAYS * 864e5,
						priority: this.focus === s.id ? 1 : 0,
					}),
			})),
		}),
		() => queryClient,
	);

	private ebirdResults = createQueries(
		() => ({
			queries: PREPARED.map((s) => ({
				// the key is deliberately not in the query key: keys are persisted to IndexedDB
				queryKey: ["ebird", s.id, this.ebird.current.regions],
				enabled: this.ready && this.on.has(s.id) && !!this.ebird.current.key,
				queryFn: async (): Promise<Sighting[]> => {
					const { key, regions } = this.ebird.current;
					const f = globalThis.fetch.bind(globalThis);
					const codes = await queryClient.fetchQuery({
						queryKey: ["ebird-codes"],
						queryFn: () =>
							ebirdCodes(
								f,
								key,
								PREPARED.map((p) => p.sci),
							),
						staleTime: 7 * 864e5,
					});
					const code = codes[s.sci];
					if (!code) return [];
					return fetchEbird(
						f,
						key,
						regions
							.split(",")
							.map((r) => r.trim())
							.filter(Boolean),
						code,
					);
				},
			})),
		}),
		() => queryClient,
	);

	private codes = createQuery(
		() => ({
			queryKey: ["ebird-codes"],
			enabled: this.ready && !!this.ebird.current.key,
			staleTime: 7 * 864e5,
			queryFn: () =>
				ebirdCodes(
					globalThis.fetch.bind(globalThis),
					this.ebird.current.key,
					PREPARED.map((p) => p.sci),
				),
		}),
		() => queryClient,
	);
	/** eBird species code (for links), known once a key is set. */
	codeOf = (id: string) => {
		const s = PREPARED.find((x) => x.id === id);
		return s ? this.codes.data?.[s.sci] : undefined;
	};

	/** Flyway-filtered recent reports per species id. */
	classified = $derived.by(() => {
		const m = new Map<string, Classified>();
		PREPARED.forEach((s, i) => {
			const raw = this.results[i]?.data;
			if (raw)
				m.set(
					s.id,
					classify(s, [...raw, ...(this.ebirdResults[i]?.data ?? [])]),
				);
		});
		return m;
	});
	ebirdError = $derived(
		this.ebirdResults.find((r) => r.isError)?.error?.message as
			| string
			| undefined,
	);
	/** How many of the enabled species are still loading. */
	loading = $derived(
		PREPARED.filter((s, i) => this.on.has(s.id) && this.results[i]?.isPending)
			.length,
	);
	match(id: string) {
		const s = PREPARED.find((x) => x.id === id);
		return s ? assess(s, this.classified.get(id), this.day) : undefined;
	}

	toggle(id: string) {
		const n = new Set(this.on);
		n.has(id) ? n.delete(id) : n.add(id);
		this.on = n;
	}
}
