/**
 * A WATER — a named body of water, and everything that name determines.
 *
 * This module exists because of one review finding on Task 1, and the finding
 * is worth restating in full before the code, because the defect it names has
 * no symptom:
 *
 *   > nothing binds the water name passed to `roomIdFor` to the space actually
 *   > written into. Correct for Task 1, but it's where the next symptomless
 *   > fork lives.
 *
 * Before this module there were two derivations from the same string, in two
 * modules, with nothing joining them: `shellConfig.waterSpaceId()` hashed
 * `app:shoal:v1:main` into a space id, and `roomIdFor('main', e)` hashed
 * `The Shoal\n\nroom:shoal:v1:main:<e>` into a room id. Each was individually
 * correct. Nothing anywhere said the `main` in the first was the `main` in the
 * second, and a caller that passed `smoke` to one and `main` to the other would
 * get a space that exists, a room that exists, writes the node accepts, replies
 * that come back, and a sea shared with NOBODY — because every other client
 * derived the pair together.
 *
 * ## THE BINDING, AND WHY IT IS A TYPE RATHER THAN A CONVENTION
 *
 * A `Water` is produced by exactly one function, `waterNamed(name)`, which uses
 * `name` for BOTH derivations in one place. Every downstream caller takes the
 * `Water`, never a bare string: `roomIdIn(water, epoch)` reads `water.name`,
 * and the space it is written into is `water.spaceId`. There is no call site
 * left at which two names could be handed over separately, so the two cannot
 * disagree — not because callers are careful, but because there is nothing to
 * be careful about.
 *
 * `shoalRoom.roomIdFor(water: string, epoch)` still exists and is still the
 * pinned derivation (its literals are the defence described in that module's
 * header). It is the PRIMITIVE; this module is the only thing in the app that
 * calls it. `shoalRoom.test.ts` carries a source scan that fails if any other
 * module reaches for the string form.
 *
 * ## WHAT A WATER NAME MAY BE, AND WHY THE RULE IS AN ALLOWLIST
 *
 * `assertWaterName` accepts `[a-z0-9]` groups joined by single hyphens, 1-32
 * characters, and nothing else. That is far narrower than the four waters this
 * game has ever had (`main`, `smoke`, `two`, `cp`), and deliberately so: this
 * string goes into two hash preimages that are permanent consensus, and every
 * class of near-miss it could carry produces a room that is REAL, HEALTHY,
 * REPLY-ABLE AND SHARED WITH NOBODY. Task 1 rejected `:` and `\n`. That was a
 * denylist, and a denylist over a consensus preimage is a list of the mistakes
 * somebody happened to think of:
 *
 *  - `'main '` and `'main'` are two waters, and no rendering of either shows
 *    the difference. So are `'main\r'`, `'main\t'` and `'main\0'`.
 *  - `'máin'` in NFC (U+00E1) and in NFD (`a` + U+0301) are two different byte
 *    strings that render IDENTICALLY in every font. A player told to join
 *    "máin" could land in either depending on which keyboard, editor or
 *    clipboard produced the string, and neither would ever see the other.
 *  - `'Main'` and `'main'` are two waters. Case is not a hint here; it is a
 *    different preimage.
 *  - A non-string entirely: `roomTextFor(['main:x'] as any, 1)` passed Task 1's
 *    colon guard, because `Array.prototype.includes(':')` asks whether any
 *    ELEMENT equals `':'`, not whether the text contains one — and then
 *    template interpolation spelled the body `room:shoal:v1:main:x:1`. A denylist
 *    written for strings simply does not run on a value that is not one.
 *
 * The allowlist answers all four at once and every case nobody has thought of
 * yet, which is the point of an allowlist. It NARROWS what is accepted and
 * changes no accepted value's derivation, so no room id that has ever been
 * derived moves.
 *
 * ## `WATER_APP` IS FROZEN WIRE TEXT
 *
 * `shoal` in `app:shoal:v1:<name>` is a byte string the node hashes, not a
 * reference to a constant that may be re-pointed. It is spelled here, once,
 * for the same reason `shoalRoom.ts` spells `room:shoal:v1` rather than reading
 * `WATER_APP`: if the two shared a constant, renaming it would silently move
 * every space AND every room ever derived. They are two frozen strings that
 * happen to contain the same word.
 */
import { createSHA256 } from 'hash-wasm';

import { encodeWireSpaceId } from './shoalRpc';
import { assertWaterName, roomIdFor, roomTextFor, type RoomText } from './shoalRoom';

/**
 * Re-exported from `shoalRoom.ts`, where it lives so that `roomTextFor` — the
 * OTHER preimage the name goes into — can apply the identical rule without this
 * module and that one importing each other. One grammar, one definition; see
 * the module header on why it is an allowlist.
 */
export { assertWaterName } from './shoalRoom';

/**
 * The app namespace every Shoal space lives under. `create_space` derives an
 * app-namespaced space's id from `(app, display)` alone — `app_space_id_16`,
 * `sha256("app:<app>:v1:<display>")[..16]`, App-classed
 * (src/types/space_class.rs:70-73) — so `@shoal:main` names ONE space that
 * every node computes identically and nobody can squat.
 *
 * FROZEN WIRE TEXT. See the module header.
 */
export const WATER_APP = 'shoal';

/** The App space class byte, the first of the 16 (`SpaceClass::App.byte()`,
 *  src/types/space_class.rs:15-23). */
const APP_CLASS_BYTE = 0x05;

/**
 * The phantom property that makes `Water` NOMINAL rather than structural.
 *
 * ## WHAT IT STOPS
 *
 * An OBJECT LITERAL of the right shape. Before it, `Water` was a plain
 * interface, so
 * `{ name: 'main', app: 'shoal', spaceName: '@shoal:main', spaceId: <smoke's id> }`
 * satisfied it — a water whose name and space have nothing to do with each
 * other, accepted everywhere, deriving rooms nobody else derives, with no
 * symptom. `unique symbol` makes that a compile error: the key is a
 * `declare const` with no runtime value, it is not exported, and `waterNamed`
 * is the one place that casts.
 *
 *     const w: Water = { name: 'main', … };
 *     //    ~ Property '[waterBrand]' is missing
 *
 * ## WHAT IT DOES NOT STOP, MEASURED RATHER THAN GUESSED
 *
 * The whole-branch review walked around it FOUR ways, no casts, `tsc` exit 0
 * every time, and built a water deriving `main`'s room against `smoke`'s space:
 *
 *   1. `JSON.parse(...)` — returns `any`, and `any` satisfies anything;
 *   2. any other `any` at a boundary — config, IPC, an untyped RPC result;
 *   3. `Object.assign(structuredClone(realWater), { spaceId: other })`;
 *   4. a generic helper — `patch<T>(base: T, over: Partial<T>): T`.
 *
 * A SPREAD of a genuine water (`{ ...real, name: 'smoke' }`) is a fifth: it
 * carries the brand along and type-checks.
 *
 * ## THE RULING: THE BRAND IS KEPT, AND IT IS NOT THE DEFENCE
 *
 * None of those five can be closed by any type. `any` is the language's own
 * escape hatch and a generic `T` is indistinguishable from a real one at the
 * type level; closing the spread would mean hiding `name` and `spaceId`, which
 * half a dozen legitimate callers read. **So the honest claim is: the brand
 * stops the mistake somebody makes by accident, and nothing else.** It is worth
 * keeping for exactly that — an object literal is what a hurried caller writes
 * — and it is worth NOT trusting for anything more.
 *
 * The defence that does hold is `verifyWater` below, which is a RUNTIME check
 * and therefore blind to how the value was typed. `chainSea` runs it once per
 * sea, before it will write anything. All five walk-arounds fail it, because
 * none of them can make `sha256("app:shoal:v1:" + name)` come out as some other
 * space's id.
 *
 * This paragraph replaces an earlier one claiming production was "enforced by
 * the type". It was not, the review proved it was not, and a comment that
 * claims more than the code delivers is how fourteen defects on this project
 * started.
 */
declare const waterBrand: unique symbol;

/**
 * A named body of water and everything that name determines: the space every
 * write goes into, and (through `roomIdIn`) the room for any hour.
 *
 * EVERY PRODUCER IN THIS CLIENT IS `waterNamed`, and two separate things hold
 * that: the brand above makes an accidental hand-built one a compile error, and
 * `verifyWater` below catches a deliberate one at runtime. Neither is
 * sufficient alone and the brand is the weaker of the two — see `waterBrand`
 * for exactly what it does and does not cover.
 */
export interface Water {
  /** The phantom brand. Not present at runtime; see `waterBrand`. */
  readonly [waterBrand]: true;
  /** The DISPLAY name (`main`), never the marker form (`@shoal:main`). */
  readonly name: string;
  /** The app namespace, always `WATER_APP`. Carried so a caller printing a
   *  water does not have to reach for a second constant. */
  readonly app: string;
  /** `@shoal:main` — what `create_space` is given, in the form
   *  `parse_app_space_name` accepts (src/types/space_class.rs:52). */
  readonly spaceName: string;
  /** The node's bech32m wire form (`sp1…`) of the space this water's writes go
   *  into — DERIVED from `name`, never discovered. See `waterNamed`. */
  readonly spaceId: string;
}

/**
 * The one place a water name becomes a water.
 *
 * ## WHY THE SPACE ID IS DERIVED AND NOT LOOKED UP
 *
 * It used to be a `list_spaces` match on `(app, name)`. **That cannot work on a
 * fresh install, which is the only machine that matters here**, and plan 4b's
 * Task 4 live run is what showed it. A brand-new node that had fully synced
 * mainnet reported this exact space as:
 *
 *     {"space_id":"sp1qqz4vc5lj…","class":"app",
 *      "app":null,"name":null,"name_unresolved":true,"post_count":1}
 *
 * `app` and `name` come from the on-chain space REGISTRY, written only by
 * `register_spaces_from_content_block` (src/node/router/router.rs:4947-4980),
 * which returns early unless the content block carries `space_metadata` — and
 * the block that node synced logged `space_metadata=NONE`. The name is
 * recoverable only by asking a peer (`resolve_space_name` broadcasts
 * `GET_SPACE_META`), and in that run four peers were asked and none ever
 * answered. So the match had nothing to match on, forever.
 *
 * Deriving is exact rather than a guess: an app-namespaced space is
 * NAME-ADDRESSED (`app_space_id_16`, src/types/space_class.rs:70-73), then
 * `encode_space_id` wraps it bech32m (src/rpc/methods.rs:186-194). This
 * computes the same id `scripts/mint-water.ts` computed, from the same string,
 * in the same call that computes the room.
 *
 * Async only because `hash-wasm` is. A caller should hold the `Water` for the
 * life of the window rather than re-deriving it.
 */
export async function waterNamed(name: string): Promise<Water> {
  assertWaterName(name);

  const hasher = await createSHA256();
  hasher.update(new TextEncoder().encode(`app:${WATER_APP}:v1:${name}`));
  const digest = hasher.digest('binary');

  const id16 = new Uint8Array(16);
  id16[0] = APP_CLASS_BYTE;
  id16.set(digest.subarray(0, 15), 1); // apply_class: class byte + hash[..15]

  // THE ONE TYPE ASSERTION IN THIS MODULE, and the reason the brand works:
  // `waterBrand` is a `declare const`, so the key cannot be written by anybody
  // — not even here. Every field is derived from `name` on the four lines
  // above, so this cast is asserting nothing about the VALUES, only that this
  // is the one function allowed to produce the type.
  return {
    name,
    app: WATER_APP,
    spaceName: `@${WATER_APP}:${name}`,
    spaceId: encodeWireSpaceId(id16),
  } as Water;
}

/**
 * Re-derive a water from its OWN name and refuse it if the space disagrees.
 *
 * ## WHY A RUNTIME CHECK WHEN THERE IS A BRAND
 *
 * Because the brand is a type, and a type is exactly what `any` erases. The
 * whole-branch review produced five `Water` values that no compiler objected to
 * (see `waterBrand`), one of which derived `main`'s rooms against `smoke`'s
 * space — the symptomless fork this module exists to prevent, reached without a
 * single cast.
 *
 * This is blind to all of that. It takes the `name` the water is carrying, runs
 * the one derivation over it, and compares. A forged water is one whose
 * `spaceId` did not come from its own `name`, which is precisely the thing that
 * fails here and precisely the thing that would fork the population.
 *
 * ## IT COSTS ONE SHA-256 PER SEA
 *
 * `chainSea` runs it once, in `ctxReady`, before any write or mint — so a
 * forged water writes nothing at all and says why, instead of writing
 * everything into a room nobody shares and saying nothing. Not per write:
 * a `Water` is immutable and the answer cannot change.
 *
 * IT IS NOT A SECURITY BOUNDARY and does not pretend to be — a caller
 * determined to write into the wrong space can call `submit_reply` directly.
 * What it removes is the case that has no symptom: code that believed it held a
 * genuine water and did not.
 *
 * Throws rather than repairing. A water whose two halves disagree is a caller
 * that does not know which one it meant, and picking one for it would be
 * choosing which of two seas to silently move somebody to.
 */
export async function verifyWater(water: Water): Promise<void> {
  const derived = await waterNamed(water.name);
  if (derived.spaceId !== water.spaceId) {
    throw new RangeError(
      `verifyWater: this water calls itself ${JSON.stringify(water.name)}, whose space is `
      + `${derived.spaceId} — but it is carrying ${water.spaceId}. Its name and its space did `
      + 'not come from the same string, so every room it derives belongs to a space its writes '
      + 'are not going to: a sea that is real, healthy, reply-able and shared with nobody. A '
      + '`Water` must come from `waterNamed` and nothing else (see the module header on why the '
      + 'brand alone cannot enforce that).',
    );
  }
  if (derived.app !== water.app || derived.spaceName !== water.spaceName) {
    throw new RangeError(
      `verifyWater: ${JSON.stringify(water.name)} derives app ${JSON.stringify(derived.app)} / `
      + `${JSON.stringify(derived.spaceName)}, but this water carries `
      + `${JSON.stringify(water.app)} / ${JSON.stringify(water.spaceName)}.`,
    );
  }
}

// ===================================================================================
// WHICH ROOMS — the crossing
// ===================================================================================

/**
 * The identifying text of the room this water uses for `epoch`. `roomTextFor`
 * with the name taken from the water rather than from a second argument.
 */
export function roomTextIn(water: Water, epoch: number): RoomText {
  return roomTextFor(water.name, epoch);
}

/** The content id of the room this water uses for `epoch`. */
export function roomIdIn(water: Water, epoch: number): Promise<string> {
  return roomIdFor(water.name, epoch);
}

/**
 * ## THE CROSSING: WHICH ROOMS A CLIENT FOLDING `epoch` MUST READ
 *
 * Exactly two, always, and this function is the whole rule: **the epoch being
 * folded, and the one before it.** Oldest first, so a caller that concatenates
 * fetches in order gets history in order (the fold does not care —
 * `splitRoomReplies` re-sorts — but a human reading a log does).
 *
 * ### Why two and not one
 *
 * A fold for epoch *E* does not start at `epochStartMs(E)`. It starts at
 * `epochWarmStartMs(E)` — `WARMUP_MS` (90 s) EARLIER — and replays the tail of
 * the previous epoch so bloom fallow state, live presence, tension and any
 * in-flight hush are reconstructed rather than transmitted (spec §3.9 point 3).
 * And the entries it needs for that replay reach back further still: a vector
 * authored just before the warm-up start is live for all 360 warm-up ticks, so
 * the fold's own entry cursor admits everything from
 * `epochWarmStartMs(E) - PRESENCE_TTL_MS` — `admitFloorMs(E)` in shoalLoop.ts,
 * 180 s before the hour.
 *
 * Every one of those 180 s is in epoch *E-1*, and since Task 1 that is a
 * DIFFERENT ROOM. A client reading only room *E* folds a sea missing three
 * minutes of history that every correct client has, and — this is the part that
 * matters — **it cannot tell**: the fold has no way to notice a missing prefix
 * (spec §3.9 point 3 says so in as many words), so the result is a healthy,
 * silent, permanent disagreement with everybody, renewed every hour.
 *
 * ### Why not three, and why it is the same two all hour
 *
 * `admitFloorMs(E)` is `epochStartMs(E) - 180_000`, and `EPOCH_MS` is
 * 3_600_000, so the floor lands 3 minutes into epoch *E-1* and never reaches
 * *E-2*. Nothing in room *E-2* can change epoch *E*'s fold, so reading it would
 * cost a fetch and buy nothing.
 *
 * **And the floor does not move within an epoch.** It is a function of the
 * EPOCH, not of the current instant, and `foldShoal` restarts from
 * `epochWarmStartMs(E)` on every replay — including the bounded replay
 * `advance` runs whenever a late entry lands behind the cursor, which is
 * routine. So a client at 00:45 needs room *E-1*'s tail exactly as much as a
 * client at 00:00:30 does. THE ANSWER TO "WHEN CAN IT STOP READING THE OLD
 * ROOM" IS THEREFORE: at the instant it rolls to *E+1*, and not one
 * millisecond earlier — at which point the pair becomes (*E*, *E+1*) and the
 * rule below has already said so.
 *
 * A settle-window variant was considered and rejected: "keep fetching room
 * *E-1* for 90 s after the boundary, then cache it, since nothing new can be
 * authored into it." Everything after the comma is true, and the conclusion is
 * still wrong — a client that stops fetching a room stops seeing writes that
 * were authored before the boundary and DELIVERED after it (gossip is not
 * bounded, and shoalLoop.ts's late-entry rule exists precisely because late
 * arrival is routine). It would trade a fetch for a silent divergence, which is
 * the trade this entire plan exists to refuse.
 *
 * ### The union is the same log the single-room client folded
 *
 * Writes are placed by the AUTHORING instant (`chainSea.ts`'s "which room a
 * write belongs to"), so room *E* holds exactly `{ e : epochOf(e.ms) = E }` and
 *
 *     room(E-1) ∪ room(E) = { e : epochStartMs(E-1) ≤ e.ms < epochEndMs(E) }
 *
 * The fold for *E* reads exactly `{ e : admitFloorMs(E) ≤ e.ms ≤ t }` for the
 * tick `t` it has reached, which is at most `epochFoldEndMs(E) < epochEndMs(E)`.
 * Since `epochStartMs(E-1) < admitFloorMs(E) < epochStartMs(E)`, that set is a
 * SUBSET of the union, and everything in the union outside it is below the
 * admit floor — which `advance` drops and `foldShoal`'s own cursor prefix skips,
 * exactly (shoalLoop.ts section 3, pinned on both sides against the engine).
 * So folding the union gives the same world as folding every reply that ever
 * existed, which is what a single-room client folded before rotation. Pinned in
 * chainSea.test.ts against the pre-change fold itself.
 */
export function roomEpochsFor(epoch: number): readonly [number, number] {
  if (!Number.isSafeInteger(epoch)) {
    throw new RangeError(
      `roomEpochsFor: epoch must be a safe integer, got ${JSON.stringify(epoch)}.`,
    );
  }
  return [epoch - 1, epoch];
}

/**
 * A stable identity for a water's whole ROOM FAMILY — every hour of it, past
 * and future — for the one thing that must NOT rotate.
 *
 * The wild shoal's seed used to be `wildSeedFrom(spaceId, roomContentId)`, and
 * with a room per hour that would re-roll every ambient fish in the sea on the
 * stroke of the hour, in front of the player. Spec §1.1's diegetic rule and
 * this plan's own constraint are explicit that **a room rotation must be
 * invisible**: nobody should ever learn the sea has hours, and a shoal of wild
 * fish that teleports hourly announces it.
 *
 * So the seed is taken from what does not change — the water — spelled through
 * the same frozen grammar the rooms use, minus the epoch. Two waters still get
 * two seas (which is what open item 13 asked for); one water gets one sea
 * forever. Nothing here is fold-reachable: no wild value enters `foldTick`,
 * `lockedPositions`, a checkpoint or any fingerprint (`wild.ts`'s own header),
 * so this is a shared-appearance constant, not consensus.
 *
 * The `wild:` tag is its own frozen string and deliberately not the room
 * grammar's: this names a different kind of thing, and borrowing the room's
 * tag would invite someone to "keep them in step" one day by adding the epoch.
 */
export function roomFamilyKey(water: Water): string {
  return `wild:shoal:v1:${water.name}`;
}
