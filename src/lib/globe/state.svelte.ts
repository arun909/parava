import { createQueries } from "@tanstack/svelte-query";
import { PersistedState } from "runed";
import ebirdCodeList from "@/data/ebird-codes.json";
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
import { fetchEbird, fetchSightings } from "@/lib/sources";
import type { PathOptions, View } from "./GlobeController";

const codes = ebirdCodeList as Record<string, string>;
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
	show = $state<PathOptions["show"]>("density");
	span = $state<PathOptions["span"]>("current");
	/** Routes view: every route drawn as a traced line with drifting arrows, as a hovered one is, instead of the glow. */
	traceAll = $state(false);
	focus = $state<string | undefined>();
	expanded = $state(false);
	/** Text typed in the species search; null when not searching. Its results show in the Species menu. */
	query = $state<string | null>(null);
	paths = $derived<PathOptions>({
		show: this.show,
		span: this.span,
		focus: this.focus,
		traceAll: this.traceAll,
	});
	/** Your eBird key lives only in this browser and is sent only to api.ebird.org. The .env key is the default. */
	ebird = new PersistedState("flyway-ebird", {
		key: import.meta.env.DEV_EBIRD_KEY ?? "",
		regions: "IN",
	});
	constructor() {
		// a key saved empty on an earlier visit must not hide the one from .env
		const envKey = import.meta.env.DEV_EBIRD_KEY;
		if (envKey && !this.ebird.current.key)
			this.ebird.current = { ...this.ebird.current, key: envKey };
	}
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
	/** 3D globe or flat 2D map: your last choice, else the globe. */
	// opens on the flat map; a new key, so a 3D choice saved before the flat map became the default is not kept
	view = new PersistedState<View>("flyway-map-view", "flat");
	/** Draw birds seen far from their expected range as hollow rings. */
	showAway = $state(true);
	card = $state<string | undefined>();
	/** Sightings wait for the map's first paint so tiles get the bandwidth first. */
	ready = $state(false);
	/** Enabled species; the focused one is drawn over them, the rest dimmed. */
	shown = $derived(PREPARED.filter((s) => this.on.has(s.id)));

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
					const code = codes[s.sci];
					if (!code) return [];
					return fetchEbird(
						globalThis.fetch.bind(globalThis),
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

	/** eBird species code (for links), from the build: no key needed. */
	codeOf = (id: string) => {
		const s = PREPARED.find((x) => x.id === id);
		return s ? codes[s.sci] : undefined;
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

	/** Close the species card: the map goes back to every species at full strength. */
	close() {
		this.card = undefined;
		this.focus = undefined;
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

	/** Add several species at once (a whole group); undo takes them off again. */
	addAll(ids: string[]) {
		this.before = this.on;
		this.canUndo = true;
		this.on = new Set([...this.on, ...ids]);
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
