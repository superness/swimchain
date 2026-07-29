/**
 * THE SHALLOWS — the water anyone may swim in immediately, and the one lesson
 * that makes the game click (spec §2.16 and §2.18).
 *
 * DISPLAY SIDE. Nothing here folds anything: this module writes swim vectors
 * into a log and hands that log to `advance` (shoalLoop.ts), exactly as
 * `demoSea.ts` and the node bridge do. Every position, size, shelter score,
 * tension value and verdict on screen is computed by `foldTick`.
 *
 * =============================================================================
 * WHAT THIS IS FOR
 * =============================================================================
 *
 * > Anyone may install and swim in **the shallows** immediately: a smaller body
 * > of water with the real mechanics, no vouch required. This is the tutorial,
 * > and it costs no text. (§2.16)
 *
 * > One lesson makes the game click: **the predator is not the danger —
 * > distance is the danger.** A newcomer spawns slightly *outside* the school,
 * > tether already stretched, with a sweep inbound. The other fish begin
 * > converging. They move in, the tether goes short and warm, the sweep passes,
 * > and someone further out is scattered in front of them. If they don't
 * > follow, they are scattered — which is fine, because scatter is cheap, and
 * > the frozen replay delivers the same lesson geometrically. (§2.18)
 *
 * It costs no text and there is none: everything below is arithmetic and
 * arrangement. The whole lesson is delivered by where nine bodies are.
 *
 * =============================================================================
 * WHAT `livelySea` GAVE, AND THE ONE THING IT COULD NOT
 * =============================================================================
 *
 * `demoSea.ts`'s `livelySea` is a real sea folded by the real engine, and this
 * module reuses its shape wholesale rather than inventing a second one:
 *
 *  - the `Sea` seam itself (`selfId`/`spawn`/`step`/`seaMs`/`publish`), so
 *    `App.tsx` cannot tell the difference between this and a real room;
 *  - `createLoop(epoch, checkpoint)` seeded with a size table — the same path a
 *    client joining an hour-old sea takes, and the reason there is a believable
 *    spread of sizes here rather than eight identical fish;
 *  - authoring every vector FROM the fold's own `reckon`ed position, so a new
 *    vector never teleports anyone;
 *  - `speechFrom` for words over heads, and the log-pruning rule.
 *
 * WHAT IT COULD NOT GIVE IS THE MOMENT, and the reason is worth stating because
 * it is the whole design constraint here. `livelySea`'s writers are driven by
 * the FRAME CLOCK: `emitDue(wallMs)` authors from wherever the fold has got to
 * at whatever instant a frame happened, and its `rand()` sequence is consumed in
 * an order that depends on how many frames fell between two emits. Two launches
 * on two machines therefore fold two different seas. That is fine for a demo and
 * fatal for a tutorial: a lesson that only lands when the frame timing
 * cooperates is a lesson that does not land.
 *
 * =============================================================================
 * HOW THE TEACHING MOMENT IS MADE RELIABLE RATHER THAN LUCKY
 * =============================================================================
 *
 * Four things, each of which removes one source of luck:
 *
 * **1. The scenario is a fixed table on a fixed absolute clock.** `shallowsScript`
 * takes no arguments, reads no clock and calls no PRNG; every entry in it is a
 * literal or an integer function of literals, anchored at `SHALLOWS_OPEN_MS` — a
 * constant instant inside a constant epoch, exactly as `harnessSea` anchors its
 * replay. `seaMs` maps the wall clock onto that timeline by a constant offset,
 * so the world at "four seconds after the window opened" is the same world on
 * every machine, at every frame rate, on every launch, forever. Nothing in the
 * first fifteen seconds depends on when the player pressed the icon.
 *
 * **2. THE SWEEP ALWAYS ARRIVES, AND NEVER LATE.** That, and not a constant
 * rate, is what is actually invariant here — an earlier version of this
 * paragraph claimed tension climbs at "+83 per tick ... with no exceptions to
 * reason about", and it was simply false. State the invariant exactly:
 *
 *   THE COUNT OF SWIMMERS OUTSIDE THE TENSION CORE IS NEVER BELOW THREE.
 *
 * Three scripted swimmers are outside it from the sea's first tick and never
 * come in, and the player is not one of them. `stepTension` adds
 * `spreadPerMille(bodies) - TENSION_NEUTRAL` each tick, so the count being
 * floored at three floors the rate:
 *
 *   3 of 9 outside   trunc(1000 * 3 / 9) = 333   ->  333 - 250 = +83 per tick
 *   4 of 9 outside   trunc(1000 * 4 / 9) = 444   ->  444 - 250 = +194 per tick
 *
 * The player can reach the second row, and only the second row, by swimming OUT
 * of the core — which is the one thing a rate-based claim got wrong. Measured
 * against the real fold across five behaviours (idle, into the school, away,
 * away from frame 0, and a dart away from frame 0):
 *
 *   idle, or into the school   spread 333 throughout   hush at OPEN + 5_750
 *   away from T+1.5 s          spread 333 then 444     hush at OPEN + 4_750
 *   away from frame 0          spread 333 then 444     hush at OPEN + 3_000
 *   dart away from frame 0     spread 333 then 444     hush at OPEN + 2_750
 *
 * SO THE PLAYER CAN PULL THE HUSH UP TO THREE SECONDS EARLIER AND CANNOT PUSH IT
 * BACK BY A SINGLE TICK. It fails safe in exactly the direction that matters:
 * greed calls the shark sooner, which is spec §2.11's whole thesis, and there is
 * no behaviour at all that stalls it.
 *
 * THAT THE PLAYER IS NOT ONE OF THE THREE IS THE LOAD-BEARING PART, and it was
 * found by measurement rather than by design: the first arrangement had the
 * newcomer outside the core as well as outside the crowd, which reads naturally
 * and is fatal. `spreadPerMille` is a COUNT over a fixed population, so a player
 * who did the right thing — followed the crowd inward, crossing `CORE_R` on the
 * way — dropped the count from three to TWO, `trunc(2000 / 8) = 250` cancelled
 * `TENSION_NEUTRAL` exactly, and tension FROZE 875 short of the trigger. Driven
 * against the real fold, the sweep never came at all. Doing the thing the
 * tutorial is teaching would have deleted the lesson.
 *
 * So the newcomer spawns outside the CROWD (no neighbour inside `SHELTER_R`,
 * tether fully stretched, `isExposed` true) but inside the CORE (572 cu from the
 * median against `CORE_R`'s 620). Those are two different measurements of two
 * different things — shelter is a weighted neighbour count, tension is a spread
 * statistic — and only the first one is what §2.18 means by "outside the
 * school". The player's own membership of the core is therefore the ONLY term
 * they can move, it can only move upward, and the floor of three is what makes
 * that safe. All three rows are pinned in `shallows.test.ts` §2.
 *
 * **3. The sea has been running before the window opened.** The scenario's first
 * vectors are authored `SHALLOWS_PRELUDE_MS` before the instant the window opens
 * on, so the fold has already climbed most of the way to `TENSION_TRIGGER` by
 * the time anybody is looking. That is what "with a sweep inbound" means, and it
 * is why the player's own body is glowing with `premonition` within a second of
 * the first frame instead of after a minute of nothing.
 *
 * **4. The verdict cannot miss.** At the input lock the school has converged
 * into a ball in which every member holds four neighbours inside `SHELTER_R`, so
 * the only exposed swimmers in the sea are the three out in the open and — if
 * they stayed put — the player. `selectTaken` orders by preferred target, then
 * DESCENDING SIZE, then id, and takes `MAX_TAKE` (3). The three out in the open
 * have been outside the core since the sea's first tick, so `topContributor`'s
 * preferred target is necessarily one of them; the seeded sizes then put two
 * more of them ahead of the player. Both branches of §2.18 hold by construction
 * rather than by luck:
 *
 *    the player followed the crowd  -> all three swimmers further out are taken,
 *                                      in front of them, and they are not
 *    the player did nothing at all  -> two of them are taken ANYWAY, and so are
 *                                      the player, and the frozen replay draws
 *                                      all three tethers side by side
 *
 * The second is the one that matters, because it is what actually happens on a
 * first launch. A player who never touches the mouse is scattered — and watches
 * two fish further out than them go with them.
 *
 * THE ONE BEHAVIOUR THE SECOND HALF OF §2.18 DOES NOT COVER, stated rather than
 * left as a promise the code does not keep: a player who swims — or darts —
 * STRAIGHT AWAY from the school becomes the furthest-out body in the water
 * themselves (1005 cu from the gathering point at the lock swimming, 1465
 * darting, against 1200/1200/1137 for the three out in the open). They are still
 * taken, and two of the three still go with them, but "someone further out is
 * scattered in front of them" is false in that case for the plain reason that
 * there is nobody further out. What lands instead is §2.18's own fallback — "the
 * frozen replay delivers the same lesson geometrically" — and it lands harder:
 * the replay's camera fits every body, so what they are shown is a knot of five
 * safe fish in the middle and themselves ringed in red at the very edge of it.
 * The lesson survives; only that one sentence about it does not. Pinned in
 * `shallows.test.ts` §4.
 *
 * =============================================================================
 * AND THEN IT KEEPS GOING
 * =============================================================================
 *
 * A sea whose script runs out is a sea that empties: presence lapses after
 * `PRESENCE_TTL_MS` and the player is left alone in open water, which is the
 * dead end §2.16 forbids. So after the sweep the cast enters `LIFE` — a
 * schedule at fixed absolute instants, deterministic in sea time rather than in
 * frame time for the same reason the scenario is.
 *
 * IT IS A TIDE NOW RATHER THAN A MILL, and that is the difference between a sea
 * that keeps moving and a place somebody can wait in. The old schedule parked
 * the ball and let three loners feed; measured over seventy minutes, every
 * swimmer was pinned on `MIN_SIZE` by T+8min and the same three fish were taken
 * by every sweep for the rest of the hour. Every `SHALLOWS_TIDE_MS` the school
 * now goes out to feed and comes back, because the fold's own arithmetic will
 * not let it do both at once — the whole argument, and what it measures, is on
 * `SHALLOWS_TIDE_MS`. The lesson is not a cutscene; it is what this water does.
 *
 * =============================================================================
 * WHERE THIS SEA IS SHOWN — READ THIS FIRST
 * =============================================================================
 *
 * TWO PLACES, and the second is the one to be careful about.
 *
 * `App.tsx` selects the shallows whenever `chooseSeaSource` answers `'offline'`:
 * no shell, or a node that has not synced `@shoal:main` yet, which is the state
 * of every fresh install for its first several minutes. That is §2.16's "never
 * let a downloader dead-end", and it is what this module was built for.
 *
 * AND IT IS WHERE A NEWCOMER WHOSE WRITES ARE REFUSED SWIMS (`chooseWater`,
 * seaChoice.ts). A shipped build with a healthy node reaches real water in
 * seconds; the first write is refused for want of a voucher; `wayIn.afterWrite`
 * raises `AT_THE_EDGE`; and rather than a boundary drawn over a sea they cannot
 * affect, the player is put here, in water with a cast and a sweep and a tide
 * in it, for as long as it takes somebody to bring them through.
 *
 * THIS SEA IS SHOWN INSTEAD OF THE REAL ONE. IT IS NEVER WRITTEN INSTEAD OF THE
 * REAL ONE. A chain write is the ONLY evidence this client ever has that a
 * vouch has landed (`wayIn.ts`: "a write that goes through is what lifts the
 * edge"), so a window that swapped to this sea and stopped writing would be a
 * silent permanent lockout — the player would never find out they had been let
 * in, and nothing in the logs would look wrong. `seaChoice.knockOn` is what
 * keeps the real writes going while the player is here, and `App.test.ts` §6
 * asserts it on the wire. Do not remove either without reading both.
 *
 * §2.16's other half — "unvouched newcomers appear as small fish circling at
 * the edge of the real water, VISIBLE TO EVERYONE" — is NOT delivered, and it
 * cannot be from this side: every write those newcomers make is refused at
 * ingestion, so no peer ever receives one and nobody can see them. Making that
 * sentence true needs the network to carry an unvouched swimmer's presence,
 * which is a node decision and not a client one. What this client can honestly
 * do is what it does: keep offering, and give the player a sea in the meantime.
 */
import { advance, createLoop, type LoopState } from '../lib/shoalLoop';
import { epochStartMs } from '../lib/epoch';
import { reckon } from '../lib/fixed';
import { speechFrom, type Sea } from './demoSea';
import { cellIndex } from '../lib/bloom';
import { HEADING_STEPS, QUANT, SPEED_CRUISE, TICK_MS } from '../lib/shoalConst';
import type { Checkpoint, LogEntry, ShoalState, Vec } from '../lib/shoalTypes';

// ---------------------------------------------------------------------------
// The clock
// ---------------------------------------------------------------------------

/**
 * The epoch the shallows lives in. A CONSTANT, and that is the point.
 *
 * An offline sea anchored to the wall clock (as `livelySea` is) opens at an
 * arbitrary offset into an arbitrary epoch, which makes three things unreliable
 * that a tutorial cannot afford: the number of warm-up ticks before the fold
 * reaches the scenario, whether the scenario's own prelude falls behind
 * `admitFloorMs` and is dropped entirely, and whether an epoch boundary lands in
 * the middle of the lesson. Pinning the epoch removes all three at once, and it
 * is the pattern `harnessSea` already uses for the same reason.
 *
 * 40 is the same epoch the harness replays, chosen for the same reason: it is a
 * small round number well away from zero, and the two seas never coexist.
 */
export const SHALLOWS_EPOCH = 40;

/**
 * When the cast first writes a vector — one second into the epoch.
 *
 * NOT the epoch's own start instant, and the second matters: `createLoop` folds
 * an empty log up to and including the tick AT `epochStartMs`, so an entry
 * authored at or before that instant lands behind the cursor on the first
 * `advance` and costs a full bounded replay (shoalLoop.ts §2). One second is
 * four ticks of clearance, which is all that is needed.
 */
export const SHALLOWS_FIRST_MS = epochStartMs(SHALLOWS_EPOCH) + 1_000;

/**
 * How long the sea has already been running when the window opens.
 *
 * THE WHOLE OF THE HUSH'S TIMING IS THIS NUMBER. Hand-derived:
 *
 *   spreadPerMille = trunc(1000 * 3 outside / 9 swimmers)   = 333
 *   stepTension    = 333 - TENSION_NEUTRAL (250)            = +83 per tick
 *   ticks to TENSION_TRIGGER (30_000) at +83                = 362
 *                                    (83 * 361 = 29_963 short; 83 * 362 = 30_046)
 *
 * The tick that admits the first vectors is itself the first of those 362 (the
 * fold applies entries in step 1 and steps tension in step 4, in that order), so
 * tension reaches the trigger on the tick at
 * `SHALLOWS_FIRST_MS + 361 * TICK_MS` = `SHALLOWS_FIRST_MS + 90_250`, and
 * `shouldStartHush` fires on that same tick.
 *
 * With a prelude of 84_500 that instant is `SHALLOWS_OPEN_MS + 5_750`:
 *
 *   T+0.00 s  the window opens. Outside the school, tether at full stretch.
 *   T+1.25 s  the first of the school turns inward; the rest follow by T+3.0 s.
 *   T+5.75 s  the hush. The water goes quiet; the dart is refunded.
 *   T+7.25 s  the last of the school reaches the ball.
 *   T+9.75 s  the input lock. Positions frozen; nothing after this counts.
 *   T+13.75 s the sweep resolves, and the frozen replay holds for two seconds.
 *
 * Four and a half seconds of "the crowd is moving" before the hush, and four
 * more inside the commit window: the player has 9.75 s to cover the 262 cu that
 * separates their spawn from cover, against SPEED_CRUISE's 60 cu/s — 4.4 s of
 * swimming. Following the crowd at a walk is enough with five seconds to spare;
 * the refunded dart makes it trivial. Doing nothing is also a complete lesson —
 * see this module's header.
 */
export const SHALLOWS_PRELUDE_MS = 84_500;

/** The instant a freshly opened window is looking at. */
export const SHALLOWS_OPEN_MS = SHALLOWS_FIRST_MS + SHALLOWS_PRELUDE_MS;

/**
 * When the hush begins, when its input lock lands, and when the sweep resolves.
 *
 * Derived here from the constants above rather than measured from a run, so a
 * test can hold the fold to them instead of agreeing with whatever it does.
 */
export const SHALLOWS_HUSH_AT_MS = SHALLOWS_FIRST_MS + 361 * TICK_MS;

// ---------------------------------------------------------------------------
// The arrangement
// ---------------------------------------------------------------------------

/**
 * Where the school gathers. The middle of the sea, so a camera following the
 * player has the whole crowd in frame from the first frame (`VIEW_SPAN_W` is
 * 2400 cu and the player spawns 666 cu away from it).
 */
export const SHALLOWS_GATHER = { x: 2048, y: 1536 } as const;

/**
 * Where the newcomer starts: 602 cu from the gathering point, in the widest gap
 * in the scattered school, and 388 cu from the nearest other swimmer — 48 cu
 * beyond `SHELTER_R` (340), which is exactly "slightly outside the school".
 *
 * Its consequences, all of them arithmetic:
 *
 *   nearest neighbour 388 > SHELTER_R  -> shelter 0, `isExposed` true
 *   shelter 0                          -> `tetherLengthCu` = TETHER_MAX_CU (420),
 *                                         `tetherWarmth` = 0. Fully stretched,
 *                                         fully cold, on the first frame.
 *   572 cu from the tension core's median (620) -> INSIDE the core, which is the
 *                                         whole of point 2 in this module's
 *                                         header: the player is outside the
 *                                         crowd without being one of the three
 *                                         swimmers whose spread calls the shark.
 *   602 cu from the gathering point, against 1200, 1114 and 1232 for the three
 *                                         out in the open -> every one of them
 *                                         is further out than the player, at the
 *                                         spawn and at the lock alike.
 *
 * On the quantization grid (`QUANT` 8), like every coordinate in this file, so
 * `reckon` never moves a body off the spot it was authored on.
 */
export const SHALLOWS_SPAWN = { x: 2624, y: 1360 } as const;

/**
 * The wild shoal's seed for this water (spec §2.6, wild.ts).
 *
 * NOT arbitrary, and the constraint is the first frame: `App.tsx` reads the
 * tether against people AND wild fish together (wild cover is felt cover — see
 * `readTether`'s header), so a wild school sitting on the spawn would draw a
 * short warm tether over a swimmer the sweep considers completely exposed. The
 * teaching moment opens on a stretched tether or it opens on nothing.
 *
 * So this seed is CHOSEN: it is the smallest non-negative integer for which no
 * wild fish comes within `SHELTER_R` of `SHALLOWS_SPAWN` at any tick from the
 * window opening to the hush. `shallows.test.ts` §1 re-derives that rather than
 * trusting this sentence, and would fail if the seed, the spawn or the wild
 * shoal's own constants moved.
 */
export const SHALLOWS_WILD_SEED = 0;

/**
 * One member of the cast.
 *
 * `heading` is a brad (256 to the turn) and is a LITERAL rather than an
 * `atan2` evaluated at load: `Math.atan2` is not required by IEEE-754 to be
 * correctly rounded, so a value one ULP either side of a rounding boundary
 * would pick a different brad on a different engine, and the whole point of this
 * table is that it produces the same sea everywhere. The derivation of each is
 * on `SHALLOWS_CAST`.
 */
interface Player {
  readonly id: string;
  /** Seeded size, carried in through the checkpoint (see `shallowsSeed`). */
  readonly size: number;
  /** Where this swimmer is for the whole prelude. */
  readonly x: number;
  readonly y: number;
  /**
   * The move into the ball: when to turn, which way, and for how long. `null`
   * for the swimmers who never come in — the player, and the two further out.
   */
  readonly move: {
    readonly atMs: number;
    readonly heading: number;
    readonly travelMs: number;
  } | null;
  /** Where this swimmer mills once the scenario is over (see `lifeTarget`). */
  readonly life: { readonly radius: number; readonly angle: number; readonly rate: number };
  /** Whether this swimmer feeds once the scenario is over. True only for the
   *  ones out in the open — see `SHALLOWS_FORAGE_EVERY` for why that is the
   *  thesis rather than a convenience. */
  readonly forages: boolean;
  /**
   * The two patches this swimmer feeds on when the school goes out on the
   * tide, or `null` for the ones who never gather in the first place (the
   * three out in the open, and the player). See `SHALLOWS_TIDE_MS`.
   *
   * Both are BLOOM CELL CENTRES, hand-derived — see `SHALLOWS_CAST`.
   */
  readonly graze: readonly [{ readonly x: number; readonly y: number },
    { readonly x: number; readonly y: number }] | null;
}

/**
 * THE CAST. Nine swimmers, which is what makes the shallows "a smaller body of
 * water" (§2.16) — a shoal is fifteen to twenty-five (§2.15).
 *
 * THE FIVE OF THE SCHOOL start loosely scattered around the gathering point and
 * converge on a ring of radius 112 about it, at five angles 72 degrees apart.
 * Every pair on that ring is within 224 cu — inside `SHELTER_R` — so each of the
 * five ends up holding four strands and a shelter score above 400 against a
 * threshold of 300. Their headings, hand-derived as
 * `round(atan2(dy, dx) / 2pi * 256) mod 256` on the exact integer deltas:
 *
 *   s1 (1664,1416) -> (1952,1472)  d=( 288,  56)  dist 293  heading   8
 *   s2 (1904,1832) -> (1952,1600)  d=(  48,-232)  dist 237  heading 200
 *   s3 (2256,1232) -> (2080,1432)  d=(-176, 200)  dist 266  heading  93
 *   s4 (2376,1672) -> (2160,1536)  d=(-216,-136)  dist 255  heading 151
 *   s5 (2080,1952) -> (2080,1640)  d=(   0,-312)  dist 312  heading 192
 *
 * `travelMs` is the whole-tick duration at SPEED_CRUISE (60 cu/s) that lands
 * each of them nearest its slot; the stop vector is authored at the position the
 * fold's own `reckon` puts it at, never at the nominal slot, so nothing snaps.
 * Departures are staggered from T+1.25 s to T+3.0 s so the crowd is seen to
 * START moving rather than to blink into a formation — following a visibly
 * moving crowd is the behaviour §2.18 is counting on.
 *
 * THE THREE OUT IN THE OPEN (`o1`, `o2`, `o3`) never come in. They are 1232,
 * 1200 and 1114 cu from the gathering point against the player's 602, so "further
 * out than the player" is true of all three at the spawn and at the lock alike;
 * they are 1232, 1200 and 1114 cu from the tension core's median against
 * `CORE_R`'s 620, which is what makes them — and only them — the spread that
 * calls the shark. Each is a thousand cu from its nearest neighbour, so each is
 * alone, holds no strands and is exposed for the whole scenario.
 *
 * TWO OF THEM ARE THE BIGGEST SWIMMERS IN THE SEA AND ONE IS THE SMALLEST, and
 * the arrangement is deliberate. `selectTaken` orders by preferred, then
 * DESCENDING SIZE: with `o1` and `o2` above the player and `o3` below, a player
 * who stays put is third on the list and is taken alongside two fish further out
 * (the picture §2.18 asks for), while a player who follows the crowd is not a
 * candidate at all and all three go instead. `o3` surviving this sweep is not a
 * loose end — it is spec §2.8's other half, visible: the shark took the fat ones
 * first, and the small one out on its own only got away with it this time.
 *
 * `you` is in this table because the newcomer must be IN the water on the first
 * frame — a tether needs a body — and because the tension arithmetic counts
 * them. Their scripted vector is a standing start at the spawn; the player's own
 * first publish (a quarter second later, `shouldEmit` returns true for a null
 * last vector) replaces it with an identical one and takes the fish over.
 */
export const SHALLOWS_CAST: readonly Player[] = [
  // The school. Sizes are a believable spread; see `shallowsSeed` for why they
  // are seeded high. `graze` is the pair of patches each one feeds on when the
  // tide takes the school out — derived on `SHALLOWS_TIDE_MS`.
  { id: 's1', size: 180, x: 1664, y: 1416, move: { atMs: 1_750, heading: 8, travelMs: 5_000 }, life: { radius: 96, angle: 0, rate: 21 }, forages: false, graze: [{ x: 2496, y: 1600 }, { x: 2496, y: 1728 }] },
  { id: 's2', size: 204, x: 1904, y: 1832, move: { atMs: 2_500, heading: 200, travelMs: 3_750 }, life: { radius: 128, angle: 51, rate: -17 }, forages: false, graze: [{ x: 2240, y: 1984 }, { x: 1984, y: 1984 }] },
  { id: 's3', size: 232, x: 2256, y: 1232, move: { atMs: 1_250, heading: 93, travelMs: 4_500 }, life: { radius: 112, angle: 102, rate: 25 }, forages: false, graze: [{ x: 1728, y: 1856 }, { x: 1600, y: 1600 }] },
  { id: 's4', size: 264, x: 2376, y: 1672, move: { atMs: 3_000, heading: 151, travelMs: 4_250 }, life: { radius: 80, angle: 153, rate: -29 }, forages: false, graze: [{ x: 1728, y: 1216 }, { x: 1856, y: 1088 }] },
  { id: 's5', size: 298, x: 2080, y: 1952, move: { atMs: 2_000, heading: 192, travelMs: 5_000 }, life: { radius: 120, angle: 204, rate: 13 }, forages: false, graze: [{ x: 2240, y: 1088 }, { x: 2368, y: 1216 }] },
  // The newcomer.
  { id: 'you', size: 194, x: SHALLOWS_SPAWN.x, y: SHALLOWS_SPAWN.y, move: null, life: { radius: 0, angle: 0, rate: 0 }, forages: false, graze: null },
  // The three out in the open. Two fat and one small, all alone, all further out
  // than the player. Their milling radii are 200 cu apart at the closest, so at
  // most two of them can ever be inside SHELTER_R of each other — and a pair is
  // never enough (2 * (SHELTER_BASE + SHELTER_SIZE_CAP) = 290 < 300), so none of
  // them can accidentally shelter its way out of being a candidate.
  { id: 'o1', size: 384, x: 848, y: 1536, move: null, life: { radius: 1_200, angle: 128, rate: 5 }, forages: true, graze: null },
  { id: 'o2', size: 334, x: 2048, y: 336, move: null, life: { radius: 1_000, angle: 192, rate: -6 }, forages: true, graze: null },
  { id: 'o3', size: 168, x: 2856, y: 2336, move: null, life: { radius: 1_360, angle: 32, rate: 4 }, forages: true, graze: null },
];

/** The player's own swimmer. */
export const SHALLOWS_SELF = 'you';

// ---------------------------------------------------------------------------
// The scripted log
// ---------------------------------------------------------------------------

/**
 * The sizes the cast arrives with, carried in exactly as a checkpoint from the
 * previous epoch — the same seam `livelySea` uses and the same one a client
 * joining an hour-old sea takes (spec §3.9 point 5). Nothing is faked: these
 * sizes are adopted by `foldShoal` at the epoch origin and then decay under
 * hunger like everybody else's.
 *
 * THEY ARE SEEDED HIGH ON PURPOSE. Hunger costs `HUNGER_AMOUNT` (1) every
 * `HUNGER_TICK_INTERVAL` ticks, i.e. one size a second, and the prelude is 84.5
 * of them — so a swimmer seeded at 180 is 96 by the time the window opens, and
 * one seeded at 120 would be pinned on `MIN_SIZE` with the spread flattened out
 * of it. Size is the scoreboard (§2.8) and it has to read as one on the first
 * frame. What the window opens on is therefore
 * `s1..s5 = 96 120 148 180 214`, `you = 110`, and `o1 o2 o3 = 300 250 84`.
 *
 * Sorted by id, which is what makes a checkpoint canonical.
 */
export function shallowsSeed(): Checkpoint {
  return {
    epoch: SHALLOWS_EPOCH - 1,
    sizes: SHALLOWS_CAST.map((p) => [p.id, p.size] as [string, number])
      .sort((a, b) => (a[0] < b[0] ? -1 : 1)),
    recent: [],
  };
}

/** A standing-start vector: here, at this instant, going nowhere. */
function still(x: number, y: number, heading: number, t: number): Vec {
  return { x, y, heading, speed: 0, t };
}

/**
 * How often a swimmer who is holding still says so.
 *
 * NOT DECORATION, and the number is bounded on both sides by rules that already
 * exist. A presence vector is live for `PRESENCE_TTL_MS` (90_000) and no longer
 * — so a cast that wrote once at the sea's first tick would have EVAPORATED
 * ninety seconds later, which with an 84.5 s prelude is five and a half seconds
 * into the scenario, three quarters of a second before the hush. That is not a
 * hypothetical: it is what the first draft of this file did, and driving it
 * against the real fold showed the three out in the open and the player himself
 * blinking out of existence at `OPEN + 5_500`, the core collapsing onto the
 * five who were left, and no sweep ever arriving.
 *
 * 6_000 is inside `MAX_EMIT_GAP_MS` (8_000), which is what a real client's own
 * keep-alive cadence is, so the scripted cast writes no more often than a person
 * would — and fifteen times the margin against the TTL.
 */
export const SHALLOWS_KEEPALIVE_MS = 6_000;

/**
 * THE SCENARIO, entry for entry — the whole of the teaching moment and the
 * prelude that makes it inevitable.
 *
 * Takes no arguments, reads no clock, calls no PRNG, and contains no float: the
 * same array every time it is called, on any machine, which is the property the
 * lesson's reliability rests on.
 *
 * Three kinds of entry, and nothing else:
 *
 *  - **the wait.** Everyone takes their place and says so every
 *    `SHALLOWS_KEEPALIVE_MS` while tension climbs. A mover waits until it turns;
 *    the three out in the open wait until the milling schedule takes over; the
 *    player waits only until the window opens, because from the first frame
 *    onward that swimmer belongs to the person holding the mouse and a scripted
 *    keep-alive authored at the spawn would drag them back to it.
 *  - **the turn inward**, one per member of the school, at its own staggered
 *    instant and its own hand-derived heading.
 *  - **the arrival**, authored at the position the FOLD's own `reckon` puts that
 *    swimmer at, never at the nominal slot, so nobody snaps on the last frame of
 *    the journey.
 */
export function shallowsScript(): LogEntry[] {
  const out: LogEntry[] = [];
  let serial = 0;
  for (const p of SHALLOWS_CAST) {
    const heading = p.move === null ? 0 : p.move.heading;
    const waitUntil = p.move !== null
      ? SHALLOWS_OPEN_MS + p.move.atMs
      : p.id === SHALLOWS_SELF ? SHALLOWS_OPEN_MS : SHALLOWS_LIFE_FROM_MS;
    for (let t = SHALLOWS_FIRST_MS; t <= waitUntil; t += SHALLOWS_KEEPALIVE_MS) {
      out.push({
        kind: 'presence',
        id: p.id,
        ms: t,
        hash: `sh-${p.id}-${serial++}`,
        vec: still(p.x, p.y, heading, t),
      });
    }
    if (p.move === null) continue;
    const goMs = SHALLOWS_OPEN_MS + p.move.atMs;
    const go: Vec = { x: p.x, y: p.y, heading: p.move.heading, speed: SPEED_CRUISE, t: goMs };
    out.push({ kind: 'presence', id: p.id, ms: goMs, hash: `sh-${p.id}-${serial++}`, vec: go });
    const stopMs = goMs + p.move.travelMs;
    const at = reckon(go, stopMs);
    out.push({
      kind: 'presence',
      id: p.id,
      ms: stopMs,
      hash: `sh-${p.id}-${serial++}`,
      vec: still(at.x, at.y, p.move.heading, stopMs),
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// ...and then it keeps going
// ---------------------------------------------------------------------------

/** The first milling write, comfortably after the scatter freeze has ended. */
export const SHALLOWS_LIFE_FROM_MS = SHALLOWS_OPEN_MS + 16_000;
/** How often each swimmer writes once the scenario is over. Inside
 *  `MAX_EMIT_GAP_MS` (8_000), so nobody's presence ever lapses. */
export const SHALLOWS_LIFE_GAP_MS = 4_000;

/**
 * How many milling writes apart the three out in the open take a bite.
 *
 * WITHOUT THIS THE WHOLE SEA STARVES TO `MIN_SIZE`, and it takes four minutes:
 * hunger costs one size a second while present (§2.7) and a cast that never eats
 * has no way back. Measured on the real fold, every one of the nine was pinned
 * at 60 by `OPEN + 4 min`, with the size spread — which spec §2.8 calls the
 * scoreboard — flattened out of the water a player might sit in for an hour.
 *
 * WHY ONLY THE THREE OUT IN THE OPEN, and why that is the thesis rather than a
 * shortcut: `canEat` refuses a cell anybody OTHER than the claimant has been
 * within `BLOOM_VISIT_R` (200 cu) of in the last `BLOOM_READY_MS`. The ball is
 * five fish inside a 224 cu circle, so the ball tramples its own water
 * permanently and could not eat there if it tried. Food grows where the school
 * is not (§2.5), and the swimmers who are out where the food is are exactly the
 * ones the shark can reach. The shallows shows that without saying it.
 *
 * THE RATE WAS CHOSEN AGAINST HUNGER ALONE, AND THAT WAS NOT ENOUGH ONCE THE
 * TIDE EXISTED. `BITE_GROWTH` is 12 and hunger is 1 a second, so a bite every
 * THIRD write — every 12 s — is +1 a second against hunger's -1: break-even,
 * which was the whole argument for 3, and which quietly assumed the sweep was
 * a rounding error. It is not. These three are alone, exposed and candidates at
 * every sweep in the sea, and the tide brought the sweep back oftener (gaps of
 * 25-99 s against a flat ~70 s before it, `SHALLOWS_TIDE_MS`). At break-even
 * income and `SCATTER_COST` (30) plus every bite inside `VOID_WINDOW_MS` going
 * out every minute or so, break-even is a slow slide: measured over thirty
 * minutes at a bite every third write, all three sat between 60 and 75 — pinned
 * on `MIN_SIZE` in everything but name, in a sea whose whole point is that size
 * is the scoreboard (§2.8).
 *
 * A bite every SECOND write is +1.5 a second against hunger's -1, which pays
 * for being eaten. Measured over the same thirty minutes: 60-213, moving,
 * with a real spread between the three of them. The gap is still
 * `2 * SHALLOWS_LIFE_GAP_MS` = 8_000, comfortably past `EAT_COOLDOWN_MS`
 * (2_500), so no claim is wasted on a cooldown the fold would refuse; one bite
 * per write would be +3 against -1 and would inflate a loner into a whale
 * inside five minutes.
 *
 * These claims are the ONLY ones authored from a moving swimmer, and a moving
 * claim can miss: `canEat` wants the claimant inside `EAT_R` (90) of the cell
 * centre and a circuit does not aim for one. That is priced in rather than
 * corrected — the rate above is what the fold actually credited, not what was
 * offered. The school's own claims are the opposite case and are authored at
 * cell centres it is parked on; see `SHALLOWS_TIDE_MS`.
 *
 * Foraging begins at `SHALLOWS_LIFE_FROM_MS`, after the teaching moment has
 * resolved, so nothing in the scenario proper is touched by it.
 */
export const SHALLOWS_FORAGE_EVERY = 2;

// ---------------------------------------------------------------------------
// The tide — what the shallows are once the lesson has landed
// ---------------------------------------------------------------------------

/**
 * THE SCHOOL IS EITHER TOGETHER OR FEEDING, NEVER BOTH, AND THE TIDE IS HOW
 * LONG EACH LASTS.
 *
 * =============================================================================
 * WHY THE PARKED BALL HAD TO GO
 * =============================================================================
 *
 * The shallows was built as a first-launch teaching moment: fourteen seconds on
 * a fixed clock, and then a milling schedule so the water would not empty. That
 * is the right shape for a lesson and the wrong shape for a place to WAIT, and
 * a newcomer at the edge of the real water may now wait here for hours (spec
 * §2.16, and `chooseWater` in seaChoice.ts). Driven against the real fold for
 * seventy minutes, the milling water goes like this:
 *
 *   T+0min   o1=300 o2=250 o3=84  s1..s5 = 96 120 148 180 214   you=110
 *   T+3min   o1=136 o2=111 o3=70  s1..s5 = 60 60 60 60 60       you=60
 *   T+8min   everybody at or near MIN_SIZE, and there for the next hour
 *
 * Nine identical minnows, a ball that never moves, and a sweep every seventy
 * seconds that takes the same three fish it took last time. Spec §2.8 says size
 * IS the scoreboard; after five minutes there is nothing on it. THE SEA WAS
 * STILL RUNNING AND HAD STOPPED BEING A PLACE.
 *
 * It is not a tuning problem, and the arithmetic says why. Hunger costs 1 size
 * a second (`HUNGER_AMOUNT` per `HUNGER_TICK_INTERVAL`), a bite is worth
 * `BITE_GROWTH` (12) on an `EAT_COOLDOWN_MS` (2_500) cooldown, so a swimmer
 * must be eating a ready bloom roughly a fifth of the time simply to hold its
 * size. And a swimmer in the ball CANNOT EAT AT ALL: `canEat` refuses a cell
 * anybody other than the claimant has been within `BLOOM_VISIT_R` (200 cu) of
 * in the last `BLOOM_READY_MS`, and a ball tight enough to shelter — every
 * member holding three neighbours inside `SHELTER_R` (340) — is a ball whose
 * members are permanently inside each other's shadow. The two radii decide it:
 * a formation that shelters is a formation that starves. So the shallows can
 * have a permanent ball or a fed cast and not both, and this file used to have
 * the ball. Plan 4b's own header named the lever ("a school that DRIFTS and
 * grazes") and left it to this plan.
 *
 * =============================================================================
 * SO THE WATER HAS WEATHER
 * =============================================================================
 *
 * Every `SHALLOWS_TIDE_MS` the school goes out to feed and comes back:
 *
 *   phase 0        the ball breaks. Each of the five turns for its own patch.
 *   phase 12_000   they are on it, and feeding — one claim every
 *                  `SHALLOWS_BITE_GAP_MS` until the bloom is empty.
 *   phase 30_000   on to the second patch.
 *   phase 42_000   feeding again.
 *   phase 60_000   home. The ball is whole again by ~72_000 and holds until the
 *                  tide turns.
 *
 * That is 40% of every tide with cover in the water and 60% without, and the
 * asymmetry is the point rather than a compromise: THE CROWD IS NOT ALWAYS
 * THERE. A player waiting here learns the shape of the game — food grows where
 * the school is not (§2.5), safety is other people (§2.11), and the two are
 * never in the same place (§2.2) — by watching eight other fish be caught by it,
 * over and over, differently each time. The first sweep still lands at T+5.75 s
 * on the parked arrangement the lesson needs; the tide only starts at
 * `SHALLOWS_LIFE_FROM_MS`, after the scatter freeze has ended.
 *
 * =============================================================================
 * WHAT IT MEASURES, DRIVEN AGAINST THE REAL FOLD FOR THIRTY MINUTES
 * =============================================================================
 *
 * Three player behaviours — idle, following the crowd, and running for open
 * water — each folded at 250 ms frames for half an hour. `shallows.test.ts` §6
 * re-derives every one of these rather than trusting the paragraph:
 *
 *   swimmers outside the tension core   min 3, max 7 (6 when the player joins
 *                                       the ball). THE FLOOR IS UNTOUCHED.
 *   the ball is whole                   47-49% of frames
 *   sweeps in thirty minutes            24 (following) to 50 (running out),
 *                                       gaps 25-99 s, and 16-22 DISTINCT
 *                                       take-lists rather than one repeated
 *   size spread across the cast,        min 59, median 126, max 184
 *     sampled every 10 s from T+10min
 *   swimmers above MIN_SIZE + 30        min 3, median 5, of nine
 *
 * Against the parked sea this replaces, where from T+8min every swimmer sat on
 * MIN_SIZE — a spread of at most 11 — and the same three fish were taken by
 * every sweep for the rest of the hour.
 *
 * =============================================================================
 * WHERE THE PATCHES ARE, AND THE CLAIM ABOUT THEM THAT WAS FALSE
 * =============================================================================
 *
 * Every one of the ten cells on `SHALLOWS_CAST` is 453-487 cu from the
 * GATHERING POINT, against `CORE_R`'s 620. The first version of this paragraph
 * concluded from that that a grazing school stays inside the tension core and
 * the count outside it never moves off three. THAT IS FALSE, and the
 * measurement above is what says so: the core is anchored on the school's
 * MEDIAN position, not on the gathering point, and when the ball breaks up the
 * median is no longer where the ball was — so between three and SEVEN swimmers
 * are outside it while the school is out. `spreadPerMille` runs 333 to 777 and
 * the tension rate +83 to +527 a tick, which is why the sweep can come back
 * inside thirty seconds during a graze and takes a minute and a half over it
 * when the school is home.
 *
 * WHAT THE RADIUS ACTUALLY BUYS is the CEILING, and that is worth having: a
 * school grazing out past `CORE_R` from the median in every direction would
 * pin the spread near 888 and bring a sweep every twelve seconds, which is a
 * massacre on a timer rather than weather. And the FLOOR — the invariant this
 * sea's reliability rests on, that the count never drops below three — is
 * untouched by any of it, for the reason it always held: the three out in the
 * open are 1000-1360 cu from the gathering point and never come in, so they are
 * outside the core wherever the school happens to be. Measured at min 3 in all
 * three behaviours.
 *
 * The cells are also at least 286 cu apart from any OTHER swimmer's cells and
 * at least 272 cu from the player's own spawn, both against `BLOOM_VISIT_R`'s
 * 200: a grazer standing on its own patch must not be the reason its neighbour
 * cannot eat, and an idle newcomer must not starve the school by existing.
 */
export const SHALLOWS_TIDE_MS = 120_000;
/** When each grazer is on its first patch, and when it moves to the second. */
export const SHALLOWS_FEED_A_MS = 12_000;
export const SHALLOWS_MOVE_B_MS = 30_000;
export const SHALLOWS_FEED_B_MS = 42_000;
/** When they turn for home. The ball is whole again about twelve seconds later
 *  — the swim back is 453-487 cu at `SPEED_CRUISE`. */
export const SHALLOWS_GATHER_AT_MS = 60_000;
/**
 * How often a feeding swimmer claims a bite.
 *
 * Above `EAT_COOLDOWN_MS` (2_500), so no claim is ever wasted on a cooldown the
 * fold would refuse, and it divides `SHALLOWS_TIDE_MS` exactly — which is what
 * makes every tide identical in sea time rather than slowly drifting out of
 * phase with its own windows.
 *
 * Six claims land inside each feeding window and a bloom is worth exactly
 * `BLOOM_BITES` (6), so a patch is emptied and not farmed: the seventh claim of
 * a window would be refused, and there isn't one.
 */
export const SHALLOWS_BITE_GAP_MS = 3_000;

/**
 * How far into the current tide `atMs` falls. Pure arithmetic on sea time, so
 * every window sees the same tide at the same instant however long ago its icon
 * was pressed, exactly as the scenario does.
 *
 * Before `SHALLOWS_LIFE_FROM_MS` this is negative modulo, which JavaScript
 * gives a negative answer for; corrected here rather than at the call sites so
 * the teaching moment (which runs before the first tide) cannot accidentally be
 * read as being mid-graze.
 */
export function tidePhaseMs(atMs: number): number {
  const p = (atMs - SHALLOWS_LIFE_FROM_MS) % SHALLOWS_TIDE_MS;
  return p < 0 ? p + SHALLOWS_TIDE_MS : p;
}

/**
 * The patch this grazer should be standing on at `atMs`, or `null` when the
 * school is gathered (or when this swimmer never grazes at all).
 *
 * Both feeding windows START AFTER THE SWIM: a grazer leaves at the first
 * milling write of the tide, which can be up to `SHALLOWS_LIFE_GAP_MS` late,
 * and covers 487 cu in eight seconds. Twelve seconds of clearance is two of
 * those and change.
 */
export function grazePatchAt(p: Player, atMs: number): { x: number; y: number } | null {
  if (p.graze === null) return null;
  const t = tidePhaseMs(atMs);
  if (t >= SHALLOWS_GATHER_AT_MS) return null;
  return t < SHALLOWS_MOVE_B_MS ? p.graze[0] : p.graze[1];
}

/**
 * The patch this grazer may CLAIM A BITE on at `atMs` — `null` outside the two
 * feeding windows, including while it is still swimming to the patch it is
 * heading for.
 *
 * A claim authored on the way would not be a defect (the fold judges it against
 * the claimant's own reckoned position and refuses it), but it would be a write
 * the sea pays for and nothing gets, which is exactly the kind of noise the
 * emit floor exists to keep off a real wire.
 */
export function feedingPatchAt(p: Player, atMs: number): { x: number; y: number } | null {
  if (p.graze === null) return null;
  const t = tidePhaseMs(atMs);
  if (t >= SHALLOWS_FEED_A_MS && t < SHALLOWS_MOVE_B_MS) return p.graze[0];
  if (t >= SHALLOWS_FEED_B_MS && t < SHALLOWS_GATHER_AT_MS) return p.graze[1];
  return null;
}

/**
 * Where a swimmer is trying to get to at a given instant, once the scenario is
 * over: a slow circuit about the gathering point, at that swimmer's own radius
 * and rate.
 *
 * A FUNCTION OF SEA TIME ALONE, never of frame time — the caller passes the
 * SCHEDULED instant, not the instant a frame happened. That is what keeps the
 * milling deterministic in the same sense the scenario is, and it is the exact
 * thing `livelySea`'s emitter cannot claim.
 *
 * The radii are not decoration. Four of the school mill inside 128 cu of the
 * gathering point, so the ball stays a ball and stays sheltered; `s5` takes to
 * the open water at 880, and the two out west stay past 1200. That leaves three
 * swimmers outside the tension core with the player tucked in and four with the
 * player still out, so tension climbs either way and the sweep comes back. A sea
 * where joining the crowd switched the predator off would teach the lesson once
 * and then contradict it.
 */
export function lifeTarget(p: Player, atMs: number): { x: number; y: number } {
  // ...unless the tide has taken the school out to feed, in which case it is
  // trying to get to a patch. `grazePatchAt` answers `null` for everyone else
  // and for the whole gathered half of every tide, so the circuit below is
  // still what the three out in the open do at every instant, and what the
  // school does whenever it is home.
  const patch = grazePatchAt(p, atMs);
  if (patch !== null) return patch;
  const turns = ((atMs - SHALLOWS_LIFE_FROM_MS) * p.life.rate) / 600_000;
  const a = ((p.life.angle / 256) + turns) * Math.PI * 2;
  return {
    x: SHALLOWS_GATHER.x + Math.cos(a) * p.life.radius,
    y: SHALLOWS_GATHER.y + Math.sin(a) * p.life.radius,
  };
}

/**
 * How fast to set off, given how far there is left to go before the next
 * milling write.
 *
 * `SPEED_CRUISE` FLAT WAS WRONG THE MOMENT ANYTHING HAD TO ARRIVE SOMEWHERE
 * EXACT, and the milling schedule got away with it only because a circuit point
 * moves. A swimmer covers 240 cu between writes at cruise, so one chasing a
 * fixed patch overshoots it by up to that much and then turns round: it
 * oscillates about the spot with an amplitude far wider than `EAT_R` (90) and
 * every bite it claims there is refused for being nowhere near the middle of
 * the cell. The last leg is therefore taken at whatever pace lands on the
 * target at the next write, capped at cruise so nobody is ever seen to sprint,
 * and the write after that is a standing start (dist < QUANT, which is the
 * smallest difference the fold can even represent).
 */
export function arrivalSpeed(dist: number): number {
  if (dist < QUANT) return 0;
  return Math.min(SPEED_CRUISE, Math.round((dist * 1000) / SHALLOWS_LIFE_GAP_MS));
}

/** A direction in radians, as the engine's brads. */
function toBrads(rad: number): number {
  const b = Math.round((rad / (Math.PI * 2)) * HEADING_STEPS);
  return ((b % HEADING_STEPS) + HEADING_STEPS) % HEADING_STEPS;
}

// ---------------------------------------------------------------------------
// The sea
// ---------------------------------------------------------------------------

/**
 * The shallows, played at 1x from the instant `SHALLOWS_OPEN_MS` names.
 *
 * `wallStartMs` fixes nothing but the mapping between the two clocks. Everything
 * a player sees is a function of the SEA clock, which starts at
 * `SHALLOWS_OPEN_MS` however long ago the icon was pressed.
 *
 * ## The two clocks, and why `App.tsx` authors on this one
 *
 * `seaMs` is not the identity here, which is the one thing that distinguishes
 * this sea from `livelySea` at the seam. `App.tsx`'s frame loop therefore
 * derives its authoring instant as `sea.seaMs(wall) + TICK_MS` rather than
 * `wall + TICK_MS`: the player's own vectors, their eat claims, their dart
 * cooldown and the fold all read one clock. For `livelySea` and for a real room
 * `seaMs` IS the identity, so nothing about them changes.
 */
export function shallowsSea(wallStartMs: number): Sea {
  let loop: LoopState = createLoop(SHALLOWS_EPOCH, shallowsSeed());
  const log: LogEntry[] = shallowsScript();
  let serial = 0;
  /** The next scheduled milling write, per swimmer. Sea time, never frame time. */
  const nextLifeMs = new Map<string, number>(
    SHALLOWS_CAST.map((p, i) => [p.id, SHALLOWS_LIFE_FROM_MS + i * 500]),
  );
  /** How many milling writes each has made — the forage cadence counts these
   *  rather than a clock, so a late frame cannot skip a meal. */
  const writes = new Map<string, number>(SHALLOWS_CAST.map((p) => [p.id, 0]));
  /**
   * The next instant each grazer may claim a bite at. A SCHEDULE OF ITS OWN,
   * not a count of milling writes: a bite is worth `BITE_GROWTH` on a
   * cooldown of `EAT_COOLDOWN_MS`, and pinning it to the 4-second write
   * cadence would throw away nearly half of what the fold is willing to give
   * a swimmer that is standing on a bloom — which is the difference between a
   * school that holds its size and one that starves anyway.
   */
  const nextBiteMs = new Map<string, number>(SHALLOWS_CAST.map((p) => [p.id, SHALLOWS_LIFE_FROM_MS]));

  const seaMs = (wallMs: number) => SHALLOWS_OPEN_MS + (wallMs - wallStartMs);

  /**
   * Author every milling write that is due at or before `toMs`, in order.
   *
   * Each is authored AT ITS OWN SCHEDULED INSTANT and from the position the fold
   * reckons for that instant, so a frame that arrives late produces exactly the
   * writes an on-time one would have — the chain is a function of the schedule
   * and the previous vector, and of nothing else. `you` is skipped: the player
   * owns that swimmer from their first publish onward.
   */
  function millDue(toMs: number): void {
    for (const p of SHALLOWS_CAST) {
      if (p.id === SHALLOWS_SELF) continue;
      // THE BITES FIRST, because they are judged against where this swimmer
      // already is: a claim authored at `at` is folded against the vector
      // standing at `at`, and the presence write below is the one that will
      // move it next.
      let bite = nextBiteMs.get(p.id) as number;
      while (bite <= toMs) {
        const patch = feedingPatchAt(p, bite);
        if (patch !== null) {
          log.push({
            kind: 'eat',
            id: p.id,
            cell: cellIndex(patch.x, patch.y),
            ms: bite,
            hash: `shg-${p.id}-${serial++}`,
          });
        }
        bite += SHALLOWS_BITE_GAP_MS;
      }
      nextBiteMs.set(p.id, bite);

      let at = nextLifeMs.get(p.id) as number;
      let n = (writes.get(p.id) as number);
      while (at <= toMs) {
        const f = loop.state.fish.get(p.id);
        const from = f ? reckon(f.vec, at) : { x: p.x, y: p.y };
        const t = lifeTarget(p, at);
        const dx = t.x - from.x;
        const dy = t.y - from.y;
        const dist = Math.hypot(dx, dy);
        const heading = dist === 0 ? (f ? f.vec.heading : 0) : toBrads(Math.atan2(dy, dx));
        log.push({
          kind: 'presence',
          id: p.id,
          ms: at,
          hash: `shl-${p.id}-${serial++}`,
          vec: { x: from.x, y: from.y, heading, speed: arrivalSpeed(dist), t: at },
        });
        // ...and a bite, for the ones out where the food is. Claimed on the cell
        // this swimmer is standing in, named by the ENGINE's own `cellIndex`, and
        // judged by the fold like anybody else's: if the bloom is not ready, or
        // the cooldown has not run, nothing is credited and nothing is lost.
        if (p.forages && n % SHALLOWS_FORAGE_EVERY === 0) {
          log.push({ kind: 'eat', id: p.id, cell: cellIndex(from.x, from.y), ms: at, hash: `shf-${p.id}-${serial++}` });
        }
        n++;
        at += SHALLOWS_LIFE_GAP_MS;
      }
      nextLifeMs.set(p.id, at);
      writes.set(p.id, n);
    }
  }

  return {
    selfId: SHALLOWS_SELF,
    wildSeed: SHALLOWS_WILD_SEED,
    spawn: SHALLOWS_SPAWN,
    seaMs,
    step(wallMs: number): ShoalState {
      const t = seaMs(wallMs);
      millDue(t);
      loop = advance(loop, log, t).loop;
      // Append-only, and this water can be left open for hours. Drop what the
      // fold provably cannot see any more, on the same rule shoalLoop.ts's admit
      // floor uses — cosmetic, and only to keep memory flat.
      if (log.length > 4_000) {
        const floor = epochStartMs(loop.epoch) - 200_000;
        for (let i = log.length - 1; i >= 0; i--) if (log[i].ms < floor) log.splice(i, 1);
      }
      return loop.state;
    },
    /**
     * THE WRITE SEAM, and it is a plain append because `vec.t` already arrives
     * on the SEA's clock — see this function's header on why `App.tsx` authors
     * against `seaMs`. Translating here instead would put two clocks in the
     * frame loop, which is exactly the arrangement `shouldEmit`'s "one clock"
     * note exists to forbid.
     */
    publish(vec: Vec, say?: string): void {
      log.push({
        kind: 'presence',
        id: SHALLOWS_SELF,
        ms: vec.t,
        hash: `shy-${serial++}`,
        vec,
        ...(say !== undefined ? { say } : {}),
      });
    },
    publishEat(cell: number, ms: number): void {
      log.push({ kind: 'eat', id: SHALLOWS_SELF, cell, ms, hash: `she-${serial++}` });
    },
    speechAt: (atMs: number) => speechFrom(log, atMs),
  };
}
