/**
 * THE CREW — the dip's residents, recruited permanently as you dig.
 *
 * Operator's design (2026-07-27): characters PERSIST as you descend — "like
 * your crew" — recruited at each layer breakthrough, not transient visitors.
 * It starts with a lil smart dog (scoop), present from the very first frame:
 * Plain Salsa is not empty, it has an appetite.
 *
 * The crew are also THE SHOP. Every jar in the catalog is sold by exactly one
 * critter ("tie in the crew critters as the vendors for new items - they want
 * your chips!!!"), and a purchase is paid in crumbs PLUS one live cooked chip
 * fed to the vendor off the fryer. The crumb price is the fold's business and
 * never changes here; the fed chip is client policy — its pot is simply
 * forgone, the exact honesty model the rest of the game runs on.
 *
 * Recruitment is DERIVED FROM DURABLE STATE ONLY (state.dipIndex), the same
 * rule the tutorial learned the hard way: no storage, no live conditions —
 * a member is on the crew iff the player has broken through their layer.
 *
 * PURE MODULE: no React, no DOM, no storage. Copy is verbatim from the
 * comedy pass — do not paraphrase it in code review.
 */
import { UPGRADES, UPGRADE_CHAINS, type Upgrade } from './chipsConst';

export interface CrewMember {
  id: string;
  /** Display name, lowercase (CSS uppercases it for the ceremony). */
  name: string;
  /** dipIndex at which this member joins the crew (0 = day one). */
  layer: number;
  /** Idle loitering chatter, one bubble at a time. */
  lines: string[];
  /** Feed-mode: the vendor waits to be fed a chip. */
  armLines: string[];
  /** The chip is eaten, the jar handed over. */
  munchLines: string[];
  /** scoop only: the player dipped a chip instead of feeding it to him. */
  dipLines?: string[];
  /** Upgrade keys this critter's stall sells (empty = not a vendor). */
  sells: string[];
  /** What chip the critter accepts as payment. */
  feed: 'any' | 'golden';
  /** Phase-2 job, if any. */
  job?: 'rat' | 'angel';
}

export const CREW: CrewMember[] = [
  {
    id: 'scoop', name: 'scoop', layer: 0,
    lines: [
      "make another. that one's mine.",
      "i'm not begging. this is a business meeting.",
      "i counted the chips. one is missing. i'm not accusing you. i'm accusing you.",
      "drop one. accidentally. i'll handle everything after that.",
      "you have thumbs. i have a plan. i don't see the problem.",
      "the fryer's just sitting there. so am i. one of us can be fixed.",
      "i've done the math. you can't eat all of them. i've done the math twice.",
      "that chip looks heavy. let me hold it. in my mouth. for safety.",
      "the salsa doesn't love you. i could. rates are reasonable.",
      'sit. stay. good. now fry.',
    ],
    armLines: [
      "yes. a fresh one. off the fryer. i'm not fussy. i'm exactly this fussy.",
      'the jar is yours. the chip is mine. this is called an economy. i invented it.',
      "take your time. i've stared at that fryer for hours. i have more hours.",
      'warm one, please. i can hear which ones are warm.',
    ],
    munchLines: [
      "crunch. deal's a deal. jar's yours. tell your friends. individually.",
      'mm. as agreed. i remain a professional.',
      'gone. no evidence. pleasure doing business. bring another sometime. no reason.',
    ],
    dipLines: [
      "i watched you do that. the whole thing. the dip doesn't even have a jar for you.",
      "fine. dip it. i've adjusted the plan. the new plan is longer and involves more staring.",
    ],
    sells: ['season1', 'bowl1', 'airtight', 'fryer2'],
    feed: 'any',
  },
  {
    id: 'avo', name: 'avo the unripe', layer: 1,
    lines: ["come back thursday. i'm not ready. nobody squeeze me."],
    armLines: ["fine. one chip. hand it over slowly. don't touch me with it. don't touch me at all."],
    munchLines: ["crunch. okay. take the jar. transaction's over. everyone go back to not perceiving me."],
    sells: ['season2', 'autodip'],
    feed: 'any',
  },
  {
    id: 'limewedge', name: 'limewedge', layer: 1,
    lines: ["you're welcome. no — don't thank me. you weren't going to."],
    armLines: ['a chip. for me. correct decision. arguably i invented chips. bring it here.'],
    munchLines: ["delicious. because of me, mostly. here's your jar. you're welcome. you're always welcome."],
    sells: ['doubledip1'],
    feed: 'any',
  },
  {
    id: 'onion', name: 'the weeping onion', layer: 2,
    lines: ["i'm fine. it's the caramelization. we don't talk about what got caramelized."],
    armLines: ["a chip. for me. nobody usually — it's fine. i'm fine. hand it over before i get more fine."],
    munchLines: ["thank you. these are fryer tears. from the fryer. take the jar. we don't talk about where the jar's been."],
    sells: ['season3', 'bowl2', 'detector'],
    feed: 'any',
  },
  {
    id: 'rat', name: 'cheese rat', layer: 3,
    lines: ['i live here. legally, nobody can prove that. dip it again.'],
    armLines: ["slide the chip over casual. no eye contact. as far as anyone can prove, this isn't happening."],
    munchLines: ['crunch. beautiful. the jar fell off a truck. i was the truck. dip it again.'],
    sells: ['cellar', 'fryer3'],
    feed: 'any',
    job: 'rat',
  },
  {
    id: 'angel', name: 'queso angel', layer: 3,
    lines: [
      'you have been witnessed.',
      'nobody is watching, except me. i am always watching. dip it again, child.',
    ],
    armLines: ['only the golden one. i would know an ordinary chip. i know all chips. bring me the one that shines, child.'],
    munchLines: ['it is accepted. the shine passes through me. take your seasoning. you have been witnessed. you are always being witnessed.'],
    sells: ['season4'],
    feed: 'golden',
    job: 'angel',
  },
  {
    id: 'committee', name: 'the committee', layer: 4,
    lines: ['the olives abstain. the olives always abstain. motion carries. dip it again.'],
    armLines: ['the chip is tabled. motion to receive it passes 5-2. the olives abstain. approach the layers in order.'],
    munchLines: ['consumed, 6-1, one bean recused. the jar is hereby released under subsection dip. the olives abstain.'],
    sells: ['doubledip2', 'detector2', 'fryer4'],
    feed: 'any',
  },
  {
    id: 'hermit', name: 'blue cheese hermit', layer: 5,
    lines: ["everyone wants me when it burns. NOW who's 'gone off,' eh? still crisp. still CRISP."],
    armLines: ['WHO SENT YOU. fine. FINE. one chip. slide it under the celery. NO SUDDEN CRUNCHING.'],
    munchLines: ['GOOD CHIP. ACCEPTABLE CHIP. take your jar and forget my roof exists. GO.'],
    sells: ['season5'],
    feed: 'any',
  },
  {
    id: 'wing', name: 'the wing with no bird', layer: 5,
    lines: ['have you seen the bird? there was never a bird. there was NEVER a bird!'],
    armLines: [],
    munchLines: [],
    sells: [],
    feed: 'any',
  },
  {
    id: 'oracle', name: 'the fondue oracle', layer: 6,
    lines: [
      'the strings do not lie. you will lose a chip in me tonight.',
      'do not mourn it. it goes ahead of you.',
    ],
    armLines: ['bring it to me undipped. the dip would only confuse the strings. this chip was always going to end here.'],
    munchLines: ['it is done. the strings accept. take what you came for. i watched you take it before you arrived.'],
    sells: ['bowl3', 'season6'],
    feed: 'any',
  },
  {
    id: 'firstchip', name: 'the first chip', layer: 7,
    lines: [
      'you dug through seven dips to find a chip. i waited through seven dips to find a friend.',
      'nobody is watching. it is just us now. dip.',
    ],
    armLines: [],
    munchLines: [],
    sells: [],
    feed: 'any',
  },
];

/** Everyone on the crew at this depth — durable derivation, nothing live. */
export function crewFor(dipIndex: number): CrewMember[] {
  return CREW.filter((m) => m.layer <= dipIndex);
}

/** Who joins AT this breakthrough (the ceremony's guest list). */
export function recruitsAt(dipIndex: number): CrewMember[] {
  return CREW.filter((m) => m.layer === dipIndex && m.layer > 0);
}

/** The critter whose stall sells this jar — null only for a key no critter
 *  carries, which the completeness test forbids for real catalog keys. */
export function vendorOf(upgradeKey: string): CrewMember | null {
  return CREW.find((m) => m.sells.includes(upgradeKey)) ?? null;
}

/** A jar can be bought once its vendor is on the crew — "assign them at
 *  expected levels of layer availability" (operator). CLIENT POLICY ONLY:
 *  the fold accepts any affordable in-order buy regardless, so a table
 *  written by an older client still folds identically. */
export function jarAvailable(upgradeKey: string, dipIndex: number): boolean {
  const v = vendorOf(upgradeKey);
  return v !== null && v.layer <= dipIndex;
}

/**
 * What this critter can sell you RIGHT NOW: their jars, minus owned, minus
 * chain rungs that aren't next (the fold would reject those as
 * rejected-order anyway), minus anything not yet available. The tap-a-
 * critter stall sheet and the shelf column both read through this, so the
 * two can never disagree about what is on sale.
 */
export function openJarsOf(vendorId: string, owned: Set<string>, dipIndex: number): Upgrade[] {
  const v = CREW.find((m) => m.id === vendorId);
  if (!v) return [];
  const out: Upgrade[] = [];
  for (const key of v.sells) {
    if (owned.has(key)) continue;
    if (!jarAvailable(key, dipIndex)) continue;
    const chain = UPGRADE_CHAINS.find((c) => c.includes(key));
    if (chain && chain.find((k) => !owned.has(k)) !== key) continue; // not the next rung
    out.push(UPGRADES[key]);
  }
  return out;
}

/* ── the daily drift of the dip: news ticker ─────────────────────────────── */

export interface TickerLine {
  layer: number;
  text: string;
}

/** Keyed to depth: a line joins the rotation once you reach its layer, so the
 *  feed gets weirder as you descend — the narrative spine of the descent. */
export const TICKER: TickerLine[] = [
  { layer: 0, text: 'shaker demands second stool at bar; management "reviewing the situation."' },
  { layer: 0, text: 'local man dips same chip twice; witnesses confirm nobody was watching.' },
  { layer: 0, text: 'lid that actually seals wins regional lid award. it lasted.' },
  { layer: 0, text: 'salsa layer declared "fine." further comment declined.' },
  { layer: 0, text: 'small dog reports chip stolen from him in advance. scoop declines to name suspects beyond everyone.' },
  { layer: 0, text: 'scoop announces retirement from begging, effective after one more chip. sources confirm this is the ninth retirement.' },
  { layer: 1, text: 'avocado announces it will be ripe thursday between 2:00 and 2:04.' },
  { layer: 1, text: 'guacamole layer petitions to have thursday moved. thursday declines.' },
  { layer: 2, text: 'french onion layer holds moment of silence for the caramelized. does not say for whom.' },
  { layer: 3, text: 'cheese rat spotted filing taxes. queso layer now technically a residence.' },
  { layer: 3, text: 'queso census returns a population of one rat. finding disputed by rat.' },
  { layer: 3, text: 'queso angel appears to fry cook; fry cook now "at peace" and refuses to leave the walk-in.' },
  { layer: 4, text: 'seven-layer committee votes 4-3 to remain seven layers. olives abstain.' },
  { layer: 5, text: 'buffalo layer temperature reclassified from "hot" to "a warning."' },
  { layer: 5, text: 'noise complaint filed against buffalo layer. complaint filed by buffalo layer.' },
  { layer: 6, text: 'fondue oracle predicts your next chip will break off in the dip. sources confirm it already has.' },
  { layer: 7, text: 'the dip has always been here. the shop was built around it. dig responsibly. dig anyway.' },
  { layer: 7, text: 'abyssal dip remains at the bottom of the dip. experts confirm it has always been there. experts decline to go check.' },
];

/** Every line whose layer you have reached — deeper lines join, none leave. */
export function tickerPoolFor(dipIndex: number): TickerLine[] {
  return TICKER.filter((t) => t.layer <= dipIndex);
}
