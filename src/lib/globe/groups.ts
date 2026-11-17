import type { PreparedSpecies } from "@/lib/model";

export interface BirdGroup {
	id: string;
	label: string;
	species: PreparedSpecies[];
}

/** eBird families folded into groups a birder would browse by, each small enough to scan in a menu. */
const FAMILIES: [string, string, string[]][] = [
	[
		"waterfowl",
		"Ducks, geese & grebes",
		["Ducks, Geese, and Waterfowl", "Grebes", "Flamingos"],
	],
	[
		"shorebirds",
		"Shorebirds",
		[
			"Sandpipers and Allies",
			"Plovers and Lapwings",
			"Stilts and Avocets",
			"Oystercatchers",
			"Painted-Snipes",
			"Crab-Plover",
			"Pratincoles and Coursers",
			"Buttonquail",
		],
	],
	[
		"seabirds",
		"Gulls, terns & pelicans",
		["Gulls, Terns, and Skimmers", "Southern Storm-Petrels", "Pelicans"],
	],
	[
		"waders",
		"Herons, storks & cranes",
		[
			"Herons, Egrets, and Bitterns",
			"Storks",
			"Rails, Gallinules, and Coots",
			"Bustards",
		],
	],
	[
		"raptors",
		"Eagles, hawks & falcons",
		["Hawks, Eagles, and Kites", "Falcons and Caracaras"],
	],
	["owls", "Owls & nightjars", ["Owls", "Barn-Owls", "Nightjars and Allies"]],
	[
		"pigeons",
		"Pigeons, cuckoos & swifts",
		[
			"Pigeons and Doves",
			"Sandgrouse",
			"Cuckoos",
			"Swifts",
			"Pheasants, Grouse, and Allies",
		],
	],
	[
		"kingfishers",
		"Kingfishers & woodpeckers",
		[
			"Kingfishers",
			"Bee-eaters",
			"Rollers",
			"Hornbills",
			"Asian Barbets",
			"Woodpeckers",
			"Old World Parrots",
		],
	],
	[
		"flycatchers",
		"Flycatchers, chats & thrushes",
		[
			"Old World Flycatchers",
			"Fairy Flycatchers",
			"Thrushes and Allies",
			"Dippers",
			"Wrens",
		],
	],
	[
		"warblers",
		"Warblers & tits",
		[
			"Leaf Warblers",
			"Reed Warblers and Allies",
			"Bush Warblers and Allies",
			"Grassbirds and Allies",
			"Cisticolas and Allies",
			"Sylviid Warblers and Allies",
			"Long-tailed Tits",
			"Tits, Chickadees, and Titmice",
			"Penduline-Tits",
			"Parrotbills",
			"Treecreepers",
		],
	],
	[
		"babblers",
		"Babblers, bulbuls & sunbirds",
		[
			"Tree-Babblers, Scimitar-Babblers, and Allies",
			"Ground Babblers and Allies",
			"Laughingthrushes and Allies",
			"Bulbuls",
			"Leafbirds",
			"Fairy-bluebirds",
			"Flowerpeckers",
			"Sunbirds and Spiderhunters",
			"Pittas",
			"Hypocolius",
		],
	],
	[
		"shrikes",
		"Shrikes, crows & starlings",
		[
			"Shrikes",
			"Cuckooshrikes",
			"Vireos, Shrike-Babblers, and Erpornis",
			"Old World Orioles",
			"Drongos",
			"Crows, Jays, and Magpies",
			"Starlings",
		],
	],
	[
		"larks",
		"Larks, pipits & swallows",
		["Larks", "Wagtails and Pipits", "Swallows", "Accentors"],
	],
	[
		"finches",
		"Finches, sparrows & buntings",
		[
			"Finches, Euphonias, and Allies",
			"Old World Buntings",
			"Old World Sparrows",
			"Weavers and Allies",
			"Waxbills and Allies",
		],
	],
];

/** The hand-modelled species carry no family. */
const HAND: Record<string, string> = {
	"bar-headed-goose": "waterfowl",
	"northern-pintail": "waterfowl",
	"ruddy-shelduck": "waterfowl",
	"greater-flamingo": "waterfowl",
	"bar-tailed-godwit": "shorebirds",
	"spoon-billed-sandpiper": "shorebirds",
	"arctic-tern": "seabirds",
	"demoiselle-crane": "waders",
	"siberian-crane": "waders",
	"common-crane": "waders",
	"black-necked-crane": "waders",
	"white-stork": "waders",
	"amur-falcon": "raptors",
	osprey: "raptors",
	"steppe-eagle": "raptors",
	"pied-cuckoo": "pigeons",
	"ruby-hummingbird": "pigeons",
	"blackpoll-warbler": "warblers",
	"rosy-starling": "shrikes",
	"barn-swallow": "larks",
};

const byFamily = new Map(
	FAMILIES.flatMap(([id, , fs]) => fs.map((f) => [f, id] as const)),
);

export const groupOf = (s: PreparedSpecies) =>
	HAND[s.id] ?? (s.family && byFamily.get(s.family)) ?? "other";

/** Every species sorted into its group, by name; a group left empty is dropped. */
export function birdGroups(all: PreparedSpecies[]): BirdGroup[] {
	const list: BirdGroup[] = [
		...FAMILIES.map(([id, label]) => ({
			id,
			label,
			species: [] as PreparedSpecies[],
		})),
		{ id: "other", label: "Other birds", species: [] },
	];
	const at = new Map(list.map((g) => [g.id, g]));
	for (const s of all) at.get(groupOf(s))?.species.push(s);
	for (const g of list) g.species.sort((a, b) => a.name.localeCompare(b.name));
	return list.filter((g) => g.species.length > 0);
}

/** Species matching `q` on name, scientific name or family, names that start with it first; everything, A to Z, for an empty `q`. */
export function searchSpecies(all: PreparedSpecies[], q: string) {
	const t = q.trim().toLowerCase();
	const hit = (s: PreparedSpecies) =>
		!t || `${s.name} ${s.sci} ${s.family ?? ""}`.toLowerCase().includes(t);
	const starts = (s: PreparedSpecies) =>
		Number(!!t && s.name.toLowerCase().startsWith(t));
	return all
		.filter(hit)
		.sort((a, b) => starts(b) - starts(a) || a.name.localeCompare(b.name));
}
