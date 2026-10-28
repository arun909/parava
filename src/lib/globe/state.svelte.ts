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
	speciesState,
} from "@/lib/model";
import { ebirdCodes, fetchEbird, fetchSightings } from "@/lib/sources";
import type { PathOptions } from "./GlobeController";

const WINDOW_DAYS = 30;
/** Live sightings load for up to this many species at once: a hundred more would be hundreds of requests. */
export const MAX_LIVE = 30;

const ON_KEY = "flyway-on";
function initialOn(): Set<string> {
	try {
		const saved = JSON.parse(localStorage.getItem(ON_KEY) ?? "null") as
			| string[]
			| null;
		const ids = saved?.filter((id) => PREPARED.some((s) => s.id === id));
		if (ids) return new Set(ids);
	} catch {}
	const d = dayOfYear();
	const hand = PREPARED.filter((s) => s.source !== "estimated");
	const flying = hand.filter((s) => speciesState(s, d).moving);
	return new Set((flying.length ? flying : hand).slice(0, 8).map((s) => s.id));
}

/** Shared UI state for the globe island. */
export class GlobeState {
	day = $state(dayOfYear());
	/** Species switched on: your last choice, else the hand-modelled ones in flight right now (at most 8). */
	on = $state(initialOn());
	/** The set before the last preset, so a preset can be undone. */
	private before: Set<string> | null = null;
	canUndo = $state(false);
	/** Asks the globe to fly to a species' current position (a new `n` each time). */
	flyRequest = $state<{ id: string; n: number } | null>(null);
	pathMode = $state<PathOptions["mode"]>("active");
	heat = $state<PathOptions["heat"]>("now");
	focus = $state<string | undefined>();
	expanded = $state(false);
	paths = $derived<PathOptions>({
		mode: this.pathMode,
		focus: this.focus,
		heat: this.heat,
	});
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

	/** Species whose sightings are fetched: switched on, or being looked at. */
	active = $derived(
		PREPARED.filter(
			(s) =>
				(this.on.size <= MAX_LIVE && this.on.has(s.id)) || this.focus === s.id,
		),
	);

	private results = createQueries(
		() => ({
			queries: this.active.map((s) => ({
				queryKey: ["sightings", s.id, "v2"],
				enabled: this.ready,
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
			queries: this.active.map((s) => ({
				// the key is deliberately not in the query key: keys are persisted to IndexedDB
				queryKey: ["ebird", s.id, this.ebird.current.regions],
				enabled: this.ready && !!this.ebird.current.key,
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
		this.active.forEach((s, i) => {
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
		this.active.filter((_, i) => this.results[i]?.isPending).length,
	);
	match(id: string) {
		const s = PREPARED.find((x) => x.id === id);
		return s ? assess(s, this.classified.get(id), this.day) : undefined;
	}

	private save() {
		try {
			localStorage.setItem(ON_KEY, JSON.stringify([...this.on]));
		} catch {}
	}

	/** Switch a species on, focus it and open its card. */
	open(id: string, fly = true) {
		this.on = new Set(this.on).add(id);
		this.focus = id;
		this.card = id;
		if (fly) this.flyRequest = { id, n: (this.flyRequest?.n ?? 0) + 1 };
		this.save();
	}

	toggle(id: string) {
		const n = new Set(this.on);
		n.has(id) ? n.delete(id) : n.add(id);
		this.on = n;
		this.save();
	}

	remove(id: string) {
		this.toggle(id);
		if (this.focus === id) {
			this.focus = undefined;
			this.card = undefined;
		}
	}

	/** Replace the species shown (a preset); undo brings the previous set back. */
	setOn(ids: string[]) {
		this.before = this.on;
		this.canUndo = true;
		this.on = new Set(ids);
		this.focus = undefined;
		this.card = undefined;
		this.save();
	}

	undo() {
		if (!this.before) return;
		this.on = this.before;
		this.before = null;
		this.canUndo = false;
		this.save();
	}
}
