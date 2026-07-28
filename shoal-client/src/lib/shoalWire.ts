/**
 * Wire format for a swim vector, an eat claim, or a checkpoint, written into
 * a reply body on chain (spec §3.3, §3.7, §3.9, §4). CONSENSUS — permanent, per
 * project_fold_rules_are_permanent: changing anything below (the delimiter,
 * the field order, a domain bound, MAX_SAY) re-scores every session already
 * played and splits clients running different versions. Get it right once.
 *
 * ## The grammar
 *
 * One line, `|`-delimited, integers only, no JSON — a body is small and hot
 * (spec 3.6: ~1 write every 3-8 s per player, and every peer parses every
 * one), and JSON's key order is a canonicality hazard this format does not
 * need to take on.
 *
 *   presence:   v1|presence|x|y|heading|speed|ms|salt|say
 *   eat:        v1|eat|cell|ms|salt
 *   checkpoint: v1|checkpoint|salt|<canonical checkpoint JSON>
 *
 * `v1` is a version tag, always the first field, so a future format is a
 * `null` (a version this decoder doesn't recognise) rather than silently
 * misparsed against the wrong grammar. `presence`/`eat`/`checkpoint` is a
 * second, kind tag right after it, since `decodeBody` returns the `LogEntry`
 * union and has to know which grammar the rest of the body follows.
 *
 * The checkpoint kind is the one place JSON appears, and only because
 * `serialiseCheckpoint` (checkpoint.ts) already defines the canonical text of
 * a checkpoint and that definition is not this module's to re-make — see
 * "A checkpoint is a third kind" below.
 *
 * `say` is last specifically so it cannot contain a field boundary by
 * construction — but the decoder does not trust position alone. It is
 * extracted as "everything after the 8th `|`" and then explicitly checked
 * for an embedded delimiter, rather than relying on the split to fail on
 * its own. Removing that check is exactly the third mandatory mutation in
 * this module's test file, and it is a distinct line from the length check
 * and from the generic field-count check on the head fields — see
 * `decodePresenceTail` below.
 *
 * ## `salt`: a uniqueness field THE FOLD NEVER READS
 *
 * THE DEFECT IT EXISTS TO CLOSE. The node derives a reply's identity as
 * `content_id = sha256(body)` and nothing else (src/rpc/methods.rs:2921-2923).
 * Before this field existed, an eat claim's entire body was `v1|eat|cell|ms`,
 * so **two swimmers biting the same bloom cell in the same millisecond
 * produced the same `content_id`**. The node accepts both actions, silently
 * drops the second content-store write while still returning success
 * (methods.rs:3373-3375, :3482), and lets whichever author is indexed later
 * overwrite the earlier one's metadata (src/storage/chain.rs:482-483). One
 * player's bite disappears and the other is credited to the wrong fish —
 * and, worse, the pending path reports the true actor while the finalized
 * path reports the surviving metadata author (methods.rs:9548-9551 vs
 * :9446), so the two clients disagree for the length of that window.
 *
 * WHAT IT IS. The first `SALT_HEX_CHARS` (16) characters of the author's own
 * 32-byte ed25519 public key, in lowercase hex — 64 bits of the author's
 * identity, carried verbatim. `saltFor` is the single derivation; both
 * encoders call it and neither takes a salt directly, so an honest client
 * cannot author a body salted with anything but its own key.
 *
 * WHY 16 HEX CHARACTERS (64 BITS), specifically:
 *
 *  - **Accidental cross-player collision is gone at any realistic scale.**
 *    Two DIFFERENT swimmers collide only if their pubkey prefixes collide.
 *    Birthday bound `n^2 / (2 * 16^16)` = `n^2 / 3.69e19`: at the design's
 *    stated 25-swimmer ceiling that is `625 / 3.69e19 ~= 1.7e-17`, and even
 *    at a million distinct identities ever to play it is `~2.7e-8`.
 *  - **Deliberate grinding is infeasible too**, which a shorter prefix would
 *    not achieve. Matching a chosen victim's prefix costs ~`2^63` keypair
 *    generations. At 8 hex characters (32 bits) it would cost ~`2^31` — a
 *    few CPU-hours — so 8 would defend against chance and not against an
 *    opponent, and "impossible in practice" is the bar this field is for.
 *  - **It costs 17 bytes a write** (the field plus its delimiter) on a body
 *    that is otherwise ~35-50 bytes. PoW and mempool eviction are priced per
 *    ACTION, not per byte (src/blocks/builder.rs:92), so this buys nothing
 *    away from anyone: a full 25-swimmer shoal at the keep-alive cadence
 *    spends `25 * 21 * 17 = 8_925` extra bytes per minute across the whole
 *    space.
 *
 * WHAT IT DOES *NOT* DO, stated plainly rather than overclaimed. It does not
 * authenticate anything. A hostile client can put ANY 16 hex characters in
 * this field, including a victim's; the decoder checks the field's SHAPE and
 * never compares it to `id`, and `decodeBody`'s `id` keeps coming from the
 * reply envelope (`author_id`) exactly as before — see "Reject, never
 * repair" and shoalRoom.ts's module header. So a determined attacker who can
 * predict a victim's exact authoring millisecond AND cell can still author a
 * byte-identical body deliberately. That was equally true before this field
 * existed; what changes is that HONEST play can no longer collide by
 * accident, which is the failure this closes. Pinned by the
 * "salt disagreeing with the envelope author" case in shoalWire.test.ts.
 *
 * The same-swimmer case needs no separate argument: one swimmer's two bodies
 * differ unless their `ms` is identical, and `ms` is the authoring instant a
 * caller reads from its own clock exactly once per write (shoalEmit's
 * `shouldEmit` now gates on `intent.t`, the very value that reaches the
 * wire — there is no longer a second clock that could stamp two writes with
 * one millisecond).
 *
 * THE FOLD NEVER READS IT. `salt` is validated and then discarded: it is not
 * on `Presence`, not on `EatClaim`, and no engine rule consults it. That is
 * deliberate — it adds no consensus surface beyond its own presence in the
 * grammar, so it can never change who eats, who is swept, or what a
 * checkpoint says. It is nonetheless CONSENSUS in the one sense that matters
 * here: a client that omitted it would author bodies every other client
 * rejects. `v1` is not bumped because `v1` has never been played.
 *
 * ## A checkpoint is a third kind — and it carries a salt
 *
 * A checkpoint (spec §3.9 points 4 and 5) is the state that crosses an epoch
 * boundary: every honest client computes the identical one, publishes it
 * unprivileged, and a cold joiner adopts the newest it can see rather than
 * replaying from genesis. `serialiseCheckpoint`/`parseCheckpoint`
 * (checkpoint.ts) already define its CANONICAL TEXT — sorted by id,
 * rejection-not-repair on parse. This module defines only how that text
 * TRAVELS, and it does not re-implement or re-decide any of it: `encodeCheckpoint`
 * calls `serialiseCheckpoint`, `decodeCheckpointBody` calls `parseCheckpoint`.
 * Two definitions of one canonical form is exactly the divergence a canonical
 * form exists to prevent.
 *
 * ### THE DECISION: a checkpoint carries a salt. Here is why, and what it costs.
 *
 * Two swimmers publishing the same epoch's checkpoint compute, BY DESIGN,
 * byte-identical payloads — that is what canonicality means and it is the
 * property the whole scheme rests on. But `content_id = sha256(body)`
 * (methods.rs:2921-2923), so identical bodies are ONE OBJECT on chain: the
 * node accepts both actions, silently drops the second content-store write
 * while returning success ("Reply already exists in content store",
 * methods.rs:3373-3375), and the later-indexed action overwrites the earlier
 * one's metadata — `content_metadata_index` is keyed by `content_hash` alone
 * (chain.rs:482-483), and that metadata carries the AUTHOR.
 *
 * The argument for NO salt is real and was weighed: two agreeing checkpoints
 * *are* the same fact, one object is arguably the honest representation of
 * that, and it is far cheaper (see the cost paragraph below, which is the
 * price actually paid for the other answer).
 *
 * It loses on three counts, in increasing order of how much they hurt:
 *
 *  1. **You cannot tell "everyone agrees" from "one client published."** With
 *     no salt the number of distinct checkpoint objects for an epoch is the
 *     number of distinct OPINIONS, never the number of publishers. Task 2 has
 *     to decide what a client does when two checkpoints for one epoch differ,
 *     and the natural evidence — how many independent swimmers computed each —
 *     is not merely hidden, it does not exist on chain. A lone griefer's
 *     fabricated checkpoint and twenty honest clients' agreed one are one
 *     object each: a 1-1 tie, breakable only by an arbitrary deterministic
 *     rule (lowest content_id, earliest block height) that the griefer can
 *     grind offline. With a salt, that same comparison is 1 against 20, and
 *     it is computed from data the chain actually holds.
 *  2. **Every honest publisher after the first burns a PoW mine for a write
 *     the node discards.** The client cannot even detect this: `submit_reply`
 *     returns success with the same `content_id` either way.
 *  3. **The decisive one: the surviving object's AUTHOR is nondeterministic
 *     across clients.** Because the metadata index is keyed by hash and
 *     overwritten by whoever indexes last, the `author_id` a peer reports for
 *     a collapsed checkpoint depends on that peer's own indexing order — and
 *     the pending path reports the true actor while the finalized path
 *     reports the surviving metadata author (methods.rs:9548-9551 vs :9446),
 *     so one client's view of "who published this checkpoint" disagrees with
 *     another's for the length of that window. `CheckpointEntry.id` comes
 *     from that envelope. Any rule Task 2 writes that so much as looks at a
 *     checkpoint's publisher would therefore fold differently on two honest
 *     clients — a divergence in the one mechanism whose entire job is to make
 *     divergence detectable. A salt makes each published checkpoint a
 *     distinct object with exactly one true author, and closes it.
 *
 * WHAT IS GIVEN UP, stated plainly rather than minimised:
 *
 *  - **Cost, and it is not the 17 bytes a move pays.** A checkpoint body is
 *    KB-scale (see "How large a checkpoint gets" below), so N publishers now
 *    store and gossip N full copies of one fact instead of one. At the
 *    design's 25-swimmer ceiling, with all 25 publishing, that is up to
 *    ~141 KB an epoch rather than ~5.6 KB (measured: 5_768 bytes a body).
 *    PoW and mempool eviction are priced per ACTION, not per byte
 *    (builder.rs:92), so this buys nothing away from anyone's writes — it is
 *    storage and bandwidth, paid once an hour. How many clients publish at
 *    all is POLICY (Task 2's), and that is where the cost is properly
 *    managed; it is not something the wire format should decide by making
 *    publication impossible for all but the first.
 *  - **Agreement is no longer a byte comparison.** Two agreeing checkpoints
 *    are no longer identical BODIES, so a reader must decode both and compare
 *    the canonical PAYLOADS (`serialiseCheckpoint(a.cp) === serialiseCheckpoint(b.cp)`,
 *    or equivalently the body's tail). That is one more step and one more
 *    place to get it wrong, and it is the honest price of point 1 above. It
 *    is mitigated structurally: the salt sits BEFORE the payload, so the
 *    payload is a literal suffix of the body, not something interleaved.
 *  - **A salt is still not authentication**, exactly as for a move: a hostile
 *    client can write any 16 hex characters there, so counting publishers
 *    means counting ENVELOPE authors (`CheckpointEntry.id`), never salts.
 *    The decoder checks the salt's shape and never its value.
 *
 * ### `epoch` is NOT duplicated as a head field
 *
 * A checkpoint's epoch is already inside its canonical payload, and it is
 * tempting to hoist it onto the wire so a reader can filter without parsing.
 * That would be a SECOND source for a value the payload already carries, free
 * to disagree with it — the same defect "One timestamp, not two" (below)
 * removes from a presence write, and the same one shoalTypes.ts's `EatClaim`
 * doc rejects a self-reported position for. The epoch lives once. A reader
 * decodes and reads `cp.epoch`.
 *
 * ### The payload is last, and is validated rather than delimiter-checked
 *
 * The JSON tail is taken as "everything after the third `|`" and is NOT
 * rejected for containing a delimiter (unlike `say`). It does not need to be:
 * `parseCheckpoint` validates the whole thing structurally, which is a far
 * stronger check than "contains no `|`", and because the tail is the rest of
 * the string there is no field boundary left to be ambiguous about. An id
 * containing a `|` is therefore a legitimate — if odd — checkpoint.
 *
 * ### The exact-canonical-form check
 *
 * `parseCheckpoint` rejects an unsorted or malformed checkpoint, but it does
 * NOT reject a differently-SPELLED one: `{"epoch": 7, ...}` with whitespace,
 * a different key order, `1E2` for `100`, `-0` for `0`, an unknown extra key,
 * or the lenient no-`recent` form it accepts for checkpoints serialised
 * before that field existed. Each of those parses to the same in-memory
 * `Checkpoint` from a different body — i.e. a second content_id for one
 * world, which is precisely what makes "these two clients disagree"
 * unanswerable. `decodeCheckpointBody` therefore requires the tail to be
 * EXACTLY `serialiseCheckpoint` of what it parsed to. Reject, never repair,
 * applied to the payload as a whole.
 *
 * On top of that, every number in a checkpoint — `epoch`, each size, each
 * `lastBiteMs`, each bite ms — must be a NON-NEGATIVE SAFE INTEGER.
 * `parseCheckpoint` only asks for `Number.isInteger`, which admits `1e+21`;
 * that spelling survives a JSON round trip verbatim, so the canonical-form
 * check cannot catch it, and a value past `2^53-1` has lost the exact-integer
 * arithmetic every other rule in this game depends on. Non-negativity is a
 * structural property of all four (a count, a magnitude, and two unix
 * instants), not a tuned constant — no POLICY value (MIN_SIZE, START_SIZE) is
 * consulted here, for the same reason `speed` is not bounded by SPEED_DART.
 *
 * ### A checkpoint is NOT a `LogEntry`
 *
 * `decodeBody` returns `null` for a checkpoint body, and `decodeCheckpointBody`
 * returns `null` for a move body — the two are disjoint on the kind tag, and
 * `CheckpointEntry` is deliberately declared here rather than joining the
 * `LogEntry` union in shoalTypes.ts. A checkpoint is what SEEDS a fold, not
 * something the fold consumes; letting one into `LogEntry` would put it in
 * `repliesToLog`'s output and hand it to `foldShoal`, where every existing
 * "if the kind is presence do this, otherwise it is an eat claim" branch
 * would silently mis-handle it as an eat claim.
 * `repliesToLog` drops what `decodeBody` rejects, so checkpoints stay out of
 * the log by construction rather than by everyone remembering to filter.
 *
 * ### How large a checkpoint gets, and what bounds it (measured, not estimated)
 *
 * `sizes` carries every swimmer the closing epoch knew (live plus `departed`,
 * which `rollEpoch` prunes at one epoch of absence), and `recent` adds a row
 * for everyone who ate within `VOID_WINDOW_MS` of the epoch end. Per swimmer:
 * a `sizes` row with a 64-hex id is 73 bytes with its separator; a `recent`
 * row with the maximum 5 bites (the prune keeps `e.ms - ms <= VOID_WINDOW_MS`,
 * so 10_000 / `EAT_COOLDOWN_MS` 2_500 plus the boundary one) and 13-digit
 * unix-ms values is 155. That is 228 bytes per swimmer. MEASURED at the
 * design's 25-swimmer ceiling, worst case — everyone live, everyone having
 * eaten five times in the last ten seconds — the whole BODY is 5_768 bytes;
 * one swimmer alone is 296.
 *
 * NOTHING BOUNDS IT. Not the population (any sponsored identity can write a
 * presence into a room; 15-25 is a design intent, not a rule anything
 * enforces), and not the node. That was checked rather than assumed:
 * `submit_reply` performs NO length validation on `body` at all;
 * `MAX_BODY_SIZE` (4096, SPEC_02 §3.1, constants.rs:38) and
 * `INLINE_CONTENT_THRESHOLD` (1024, constants.rs:35) are both DEAD — the
 * former has no reader anywhere in the node, and the latter is only read by
 * `content/lifecycle.rs`'s `create_content`, which the reply path never
 * calls. The limits that do bite are far away: 7 MB on the RPC request
 * (rpc/server.rs:88) and 4 MB per transport payload (constants.rs:160), which
 * at 228 bytes a swimmer a checkpoint would not reach until ~18_400 swimmers
 * were in one room in one hour.
 *
 * So a checkpoint fits comfortably today and is not at risk of silent
 * truncation. TWO THINGS TO CARRY FORWARD, both findings rather than
 * problems to solve here: (a) SPEC_02's declared `MAX_BODY_SIZE` of 4096 is
 * already exceeded at 18 swimmers in the worst case (56 if nobody has a
 * `recent` row), i.e. WELL INSIDE the design's own 25-swimmer ceiling — if
 * that dead constant is ever wired up, checkpoints break first and every
 * other body in this game keeps working; (b) the salt decision above
 * multiplies the on-chain cost by the number of publishers, so how many
 * clients publish is a policy question that now has real weight behind it.
 *
 * ## One timestamp, not two
 *
 * `Presence` (shoalTypes.ts) carries both `ms` (log ordering) and `vec.t`
 * (the dead-reckoning origin). Nothing in the fold validates that they
 * agree — a review of the merged engine flagged that as an unchecked
 * invariant a hostile client could exploit (author a vector whose claimed
 * origin time is far from when it actually entered the log, and dead
 * reckoning derives a position nobody watching the log would compute the
 * same way).
 *
 * The wire has exactly ONE ms token. `decodePresenceTail` parses it once,
 * into `msVal`, and that same variable feeds both `Presence.ms` and
 * `Vec.t`. There is no second field on the wire a hand-written body could
 * put a different value into — the invariant is structural (the grammar
 * has nowhere to express disagreement), not merely enforced by a check that
 * could later be forgotten or bypassed. `encodePresence`'s signature
 * enforces the same thing from the other direction: it takes a `Vec`, not a
 * `Vec` plus a separate top-level ms, so there is no way for an honest
 * client to even ATTEMPT to author two different values.
 *
 * ## Reject, never repair
 *
 * `decodeBody` returns `null` for anything that is not already a
 * well-formed, in-domain body — same discipline as `parseCheckpoint`
 * (checkpoint.ts). A malformed or hostile reply *will* land on chain: the
 * node verifies PoW and signatures, never application semantics
 * (project_fold_rules_are_permanent). Two clients that each "fixed" a bad
 * body their own way (clamped a coordinate, truncated a too-long `say`,
 * guessed a missing field) would fold two different worlds from the same
 * chain. Nothing here coerces, clamps, or guesses.
 *
 * ## Why the heading bounds check is not cosmetic
 *
 * Verified by reading fixed.ts: `COS`/`SIN` are plain arrays (`readonly
 * number[]`, length `HEADING_STEPS`), indexed directly as `COS[vec.heading]`
 * inside `reckon` with no bounds check of their own. A heading outside
 * `[0, HEADING_STEPS)` reads `undefined`; `undefined * anything` is `NaN`;
 * `Math.trunc(NaN)` is `NaN`; and `clampToWorld`'s comparisons (`x < 0`,
 * `x > WORLD_W`) are BOTH false when `x` is `NaN`, so the value falls
 * through unclamped, and `quantize(NaN)` stays `NaN`. `reckon` returns
 * `{x: NaN, y: NaN}` with no exception anywhere in that chain — nothing
 * crashes, so a bad heading rides silently into shelter, tension and the
 * sweep, where `dist2` against a NaN position makes every `<=` comparison
 * false (NaN compares false against everything), turning that swimmer into
 * something that shelters nobody, threatens nobody, and is never bloom- or
 * shelter-eligible, permanently and without any error to flag it. This
 * decoder's heading check is what keeps that value off the wire in the
 * first place, and is mutation-verified in shoalWire.test.ts.
 *
 * ## The real domain of each field
 *
 * `reckon`/`clampToWorld` quantize and clamp their OUTPUT, but the wire is
 * where a hostile value first enters, so every field here is checked
 * against its own real domain before a `Presence`/`EatClaim` is ever built:
 *
 *  - `x` in `[0, WORLD_W]`, `y` in `[0, WORLD_H]` — inclusive of the upper
 *    bound, matching `clampToWorld`'s own `x > WORLD_W ? WORLD_W : x`
 *    (`x === WORLD_W` passes through unclamped, so it is a legitimate
 *    value, not an edge case to reject).
 *  - `heading` in `[0, HEADING_STEPS)` — see above.
 *  - `speed`, `ms` non-negative, with no upper bound. Speed is deliberately
 *    NOT bounded by SPEED_DART/SPEED_CRUISE (shoalConst.ts POLICY block):
 *    those are free to change without coordination, and tying a CONSENSUS
 *    check to a POLICY value would make validity depend on which policy
 *    version a client is running — exactly the divergence this module
 *    exists to prevent. An absurdly large speed does not break `reckon`
 *    either way, and NOT because it overflows to `Infinity` — `parseIntField`
 *    already caps every field at `Number.isSafeInteger`
 *    (<= 2^53-1 ~= 9.007e15), and even at that ceiling the largest product
 *    `reckon` forms (`speed * COS[heading] * dtMs`, with `dtMs` bounded by
 *    `PRESENCE_TTL_MS` since elapsed time beyond it evicts the swimmer) is
 *    on the order of 9.007e15 * 4096 * 90_000 ~= 3.3e24 — a large but
 *    perfectly ordinary finite double, nowhere near `Number.MAX_VALUE`
 *    (~1.8e308). It is finite, deterministic IEEE-754 arithmetic all the
 *    way through, and `clampToWorld`'s comparison against a merely-huge `x`
 *    behaves exactly like its comparison against a huge `Infinity` would —
 *    `x > WORLD_W` is `true` either way — so it saturates to the world
 *    edge instead of poisoning anything with `NaN`. (Checked directly: only
 *    an out-of-range heading hits the `undefined`-lookup path; nothing else
 *    in `reckon` indexes an array or divides by a wire-controlled value.)
 *  - `cell` in `[0, BLOOM_COLS * BLOOM_ROWS)`. Unlike heading, an
 *    out-of-grid cell does not crash `bloom.ts` either (`cellCentre` is
 *    plain modulo/division arithmetic, and `Map` accepts any key) — but it
 *    would silently create a phantom cell no real fish or bloom event ever
 *    touches, off the real bloom grid: it violates the field's real
 *    meaning even though nothing throws, which is exactly why it is
 *    rejected here rather than left for `bloom.ts` to shrug off.
 *
 * ## Deviation from the literal Task 1 brief: `encodeEat` takes `ms`
 *
 * The plan brief lists `encodeEat(cell: number): string` — no timestamp.
 * That cannot be right: `EatClaim.ms` (shoalTypes.ts) is a real,
 * fold-consulted value (`canEat` judges the claim against
 * `reckon(fish.vec, claim.ms)` — it is "the instant claimed", not a log
 * artifact), and per this plan's Global Constraints, "the ms is always
 * passed in" — nothing in `src/lib/` may read a wall clock, including this
 * module. `decodeBody`'s fixed signature is `(body, id, hash)`, with no ms
 * parameter either, and Task 3's `RawReply` (the only other place an eat
 * claim's ms could come from) carries no per-reply timestamp — only
 * `content_id`, `author_id`, `body`, and an optional `block_height`. There
 * is therefore no external source for an eat claim's `ms` anywhere in this
 * plan: it has to travel on the wire, exactly like a presence vector's `t`
 * does. `encodeEat` here is `(cell: number, ms: number): string`. This
 * appears to be the one planted defect in this brief (every implementer on
 * the two prior plans found one); Task 6's `sendEat(ctx, cell)` will need
 * the same fix when that task is implemented.
 */
import type { Vec, LogEntry, Presence, EatClaim, Checkpoint } from './shoalTypes';
import {
  HEADING_STEPS, WORLD_W, WORLD_H, BLOOM_COLS, BLOOM_ROWS,
} from './shoalConst';
import { serialiseCheckpoint, parseCheckpoint } from './checkpoint';

// ---------------------------------------------------------------------------
// CONSENSUS — permanent. See module header.
// ---------------------------------------------------------------------------

/** First field on every body. A version this decoder does not recognise is a `null`, never a guess. */
const WIRE_VERSION = 'v1';

/**
 * Field delimiter. Never valid inside a numeric field (those are validated
 * digit strings) or the version/kind tags (both fixed literals), so its
 * only possible ambiguity is inside `say` — handled explicitly, see the
 * module header and `decodePresenceTail`.
 */
const DELIM = '|';

/**
 * Longest `say`, in UTF-16 code units (`string.length` — every client here
 * is JS/TS, so this is measured identically everywhere). CONSENSUS: decode
 * enforces it, so two clients checking against different limits would
 * accept/reject different sets of writes and silently fold different rooms.
 * Arbitrary-but-practical: room for a short line of chat, comfortably under
 * a size that would make a single write dominate the PoW-eviction queue
 * (spec 3.6) against everyone else's vectors.
 */
export const MAX_SAY = 240;

/** Total addressable bloom cells — the real domain of an eat claim's `cell`. */
const CELL_COUNT = BLOOM_COLS * BLOOM_ROWS; // 32 * 24 = 768

/**
 * Length of the `salt` field, in lowercase hex characters — 64 bits of the
 * author's own public key. CONSENSUS: decode enforces it exactly, so two
 * clients checking different lengths would accept different sets of writes.
 * See the module header for the full length justification (birthday bound at
 * shoal scale, grinding cost, byte cost).
 */
export const SALT_HEX_CHARS = 16;

/** A 32-byte ed25519 public key as this codebase spells it everywhere: 64
 *  lowercase hex characters (the exact form the node reports as a reply's
 *  `author_id`, src/rpc/methods.rs:9446). */
const PUBKEY_HEX_RE = /^[0-9a-f]{64}$/;

/** The `salt` field's real domain: exactly `SALT_HEX_CHARS` lowercase hex. */
const SALT_RE = new RegExp(`^[0-9a-f]{${SALT_HEX_CHARS}}$`);

/**
 * The salt an author's writes carry: the first `SALT_HEX_CHARS` characters of
 * their public key hex. The ONLY derivation — `encodePresence`/`encodeEat`
 * both call it and neither accepts a caller-supplied salt, so an honest
 * client cannot author a body salted with someone else's key.
 *
 * Throws on anything that is not a 64-character lowercase-hex public key: the
 * usual caller bug here is handing over a bech32m ADDRESS (`sw1…`) instead of
 * the pubkey, which would silently produce a salt from address characters and
 * then fail `decodeBody`'s shape check on every peer.
 */
export function saltFor(authorIdHex: string): string {
  if (!PUBKEY_HEX_RE.test(authorIdHex)) {
    throw new RangeError(
      `saltFor: ${JSON.stringify(authorIdHex)} is not a 64-character lowercase-hex ed25519 ` +
      'public key. Pass the same value the node reports as a reply\'s author_id (SendCtx.authorIdHex), ' +
      'not a bech32m address.',
    );
  }
  return authorIdHex.slice(0, SALT_HEX_CHARS);
}

// ---------------------------------------------------------------------------
// Parsing helpers
// ---------------------------------------------------------------------------

/**
 * Parse a canonical decimal integer literal: a bare `0`, or an optional
 * leading `-` followed by a nonzero digit with no leading zeros. No `+`, no
 * decimal point, no exponent, no whitespace, no leading zeros on a nonzero
 * value, and — deliberately — no `-0`: zero has exactly one spelling on this
 * wire, the same reasoning that already rules out `"007"` for `7`. Two byte
 * sequences for one logical value is exactly the kind of ambiguity a
 * CONSENSUS format should not carry, even though `-0` and `0` are
 * indistinguishable under arithmetic, `SameValueZero` and
 * `JSON.stringify` — this is about the wire having one shape per value, not
 * about any behavioural difference downstream. Returns `null` for anything
 * else, including a literal so large `Number()` cannot represent it exactly
 * (`Number.isSafeInteger`).
 *
 * Deliberately accepts NEGATIVE literals (other than `-0`) even though every
 * field on this wire is domain-checked to be non-negative: the DOMAIN check
 * (in `decodePresenceTail`/`decodeEatTail`) is what rejects `-1`, not the
 * lexer refusing to produce a negative number in the first place. That
 * split is load-bearing for the heading mutation test in
 * shoalWire.test.ts — with a non-negative-only lexer, `-1` would already be
 * rejected before the heading bounds check ever ran, and removing that
 * check would then only break the `HEADING_STEPS` (too-high) case, not the
 * `-1` (too-low) case the brief also requires. The same split now applies
 * to `x`/`y` too (see `decodePresenceTail`).
 */
function parseIntField(s: string): number | null {
  if (!/^(0|-?[1-9]\d*)$/.test(s)) return null;
  const n = Number(s);
  return Number.isSafeInteger(n) ? n : null;
}

/**
 * Every number a checkpoint carries — `epoch`, each size, each `lastBiteMs`,
 * each bite ms — must be a non-negative safe integer. `parseCheckpoint` only
 * asks for `Number.isInteger`, which admits `1e+21`; that spelling survives a
 * JSON round trip verbatim, so the canonical-form check cannot catch it, and
 * a value past `2^53-1` has lost the exact-integer arithmetic every other
 * rule in this game depends on. See the module header ("The exact-canonical-form
 * check") for why non-negativity is structural here and no POLICY constant
 * (MIN_SIZE, START_SIZE) is consulted.
 */
function checkpointNumbersInDomain(cp: Checkpoint): boolean {
  const ok = (n: number) => Number.isSafeInteger(n) && n >= 0;
  if (!ok(cp.epoch)) return false;
  for (const [, size] of cp.sizes) if (!ok(size)) return false;
  for (const [, lastBiteMs, bites] of cp.recent) {
    if (!ok(lastBiteMs)) return false;
    for (const b of bites) if (!ok(b)) return false;
  }
  return true;
}

/**
 * Take exactly `n` `DELIM`-terminated fields off the front of `s`, plus
 * whatever text remains after the nth delimiter (which may itself contain
 * further delimiters — the caller decides what that means). `null` if
 * fewer than `n` delimiters are found, i.e. too few fields.
 */
function takeFields(s: string, n: number): { fields: string[]; rest: string } | null {
  const fields: string[] = [];
  let idx = 0;
  for (let i = 0; i < n; i++) {
    const next = s.indexOf(DELIM, idx);
    if (next === -1) return null;
    fields.push(s.slice(idx, next));
    idx = next + 1;
  }
  return { fields, rest: s.slice(idx) };
}

// ---------------------------------------------------------------------------
// Encode
// ---------------------------------------------------------------------------

/**
 * Encode a presence write. Throws `RangeError` if `vec`, `authorIdHex` or
 * `say` is outside its real domain — this is a defensive check against a
 * caller bug (an honest client accidentally trying to author something the
 * format cannot carry), not the hostile-input boundary. That boundary is
 * `decodeBody`, which every peer runs against text nobody here validated;
 * see the module header's "reject, never repair".
 *
 * `authorIdHex` is the author's own 64-character public key hex. It is NOT
 * written to the wire whole — only `saltFor`'s 16-character prefix is, as the
 * `salt` field, whose entire job is to keep two different swimmers from ever
 * hashing to the same `content_id`. See the module header.
 */
export function encodePresence(vec: Vec, authorIdHex: string, say?: string): string {
  const s = say ?? '';
  const salt = saltFor(authorIdHex);
  if (!Number.isSafeInteger(vec.x) || vec.x < 0 || vec.x > WORLD_W) {
    throw new RangeError(`encodePresence: x ${vec.x} outside [0, ${WORLD_W}]`);
  }
  if (!Number.isSafeInteger(vec.y) || vec.y < 0 || vec.y > WORLD_H) {
    throw new RangeError(`encodePresence: y ${vec.y} outside [0, ${WORLD_H}]`);
  }
  if (!Number.isSafeInteger(vec.heading) || vec.heading < 0 || vec.heading >= HEADING_STEPS) {
    throw new RangeError(`encodePresence: heading ${vec.heading} outside [0, ${HEADING_STEPS})`);
  }
  if (!Number.isSafeInteger(vec.speed) || vec.speed < 0) {
    throw new RangeError(`encodePresence: speed ${vec.speed} is negative`);
  }
  if (!Number.isSafeInteger(vec.t) || vec.t < 0) {
    throw new RangeError(`encodePresence: t ${vec.t} is negative`);
  }
  if (s.includes(DELIM)) {
    throw new RangeError(`encodePresence: say contains the field delimiter ${JSON.stringify(DELIM)}`);
  }
  if (s.length > MAX_SAY) {
    throw new RangeError(`encodePresence: say is ${s.length} chars, over MAX_SAY (${MAX_SAY})`);
  }
  return [WIRE_VERSION, 'presence', vec.x, vec.y, vec.heading, vec.speed, vec.t, salt, s].join(DELIM);
}

/**
 * Encode an eat claim. See the module header ("Deviation from the literal
 * Task 1 brief") for why this takes `ms` even though the brief's listed
 * signature did not: it is the instant the fold judges the bite against
 * (`canEat`, via `reckon(fish.vec, claim.ms)`), it must travel somewhere,
 * and nothing in this plan supplies it except the wire.
 *
 * `authorIdHex` supplies the `salt` field via `saltFor`. THIS IS THE CLAIM
 * THAT MOST NEEDED IT: before the salt existed an eat body was exactly
 * `v1|eat|cell|ms`, so two swimmers biting one cell in one millisecond
 * hashed to one `content_id` and the node kept only one of them. See the
 * module header.
 */
/**
 * Encode a checkpoint write (spec §3.9). The body is
 * `v1|checkpoint|salt|<canonical checkpoint JSON>` — see the module header's
 * "A checkpoint is a third kind" for why the salt is there, what it costs,
 * why `epoch` is not hoisted out of the payload, and why the payload sits
 * last.
 *
 * Throws `RangeError` on anything `decodeCheckpointBody` would then reject,
 * which for a checkpoint is worth more than the equivalent check on a move:
 * a checkpoint published in a form its peers reject is not just a wasted PoW
 * mine, it is this client failing to register its agreement with an epoch it
 * folded correctly. The realistic caller bug is a `Checkpoint` that never
 * came from `checkpointFrom` and so was never sorted — or, worse, one whose
 * `recent` is missing entirely, since `JSON.stringify` DROPS an undefined
 * value and the resulting body would decode on a peer as the lenient
 * no-`recent` spelling: a second body for one world, authored by us.
 */
export function encodeCheckpoint(cp: Checkpoint, authorIdHex: string): string {
  const salt = saltFor(authorIdHex);
  const payload = serialiseCheckpoint(cp);
  // Round-tripped through the canonical parser rather than spot-checked, so
  // this cannot drift from what a peer's decoder will actually accept.
  const reparsed = parseCheckpoint(payload);
  if (reparsed === null) {
    throw new RangeError(
      `encodeCheckpoint: ${JSON.stringify(payload)} is not a well-formed checkpoint. ` +
      'The usual cause is a `sizes`/`recent` array that is not sorted strictly ascending by ' +
      'id, or a non-integer size — build checkpoints with checkpointFrom.',
    );
  }
  if (serialiseCheckpoint(reparsed) !== payload) {
    throw new RangeError(
      `encodeCheckpoint: ${JSON.stringify(payload)} is not the CANONICAL spelling of the ` +
      'checkpoint it parses to (an absent `recent`, or a value with a second JSON spelling). ' +
      'Every peer would reject it.',
    );
  }
  if (!checkpointNumbersInDomain(reparsed)) {
    throw new RangeError(
      'encodeCheckpoint: a checkpoint number (epoch, a size, a lastBiteMs or a bite ms) is ' +
      'negative or past Number.MAX_SAFE_INTEGER.',
    );
  }
  return [WIRE_VERSION, 'checkpoint', salt, payload].join(DELIM);
}

export function encodeEat(cell: number, ms: number, authorIdHex: string): string {
  const salt = saltFor(authorIdHex);
  if (!Number.isSafeInteger(cell) || cell < 0 || cell >= CELL_COUNT) {
    throw new RangeError(`encodeEat: cell ${cell} outside [0, ${CELL_COUNT})`);
  }
  if (!Number.isSafeInteger(ms) || ms < 0) {
    throw new RangeError(`encodeEat: ms ${ms} is negative`);
  }
  return [WIRE_VERSION, 'eat', cell, ms, salt].join(DELIM);
}

// ---------------------------------------------------------------------------
// Decode
// ---------------------------------------------------------------------------

/**
 * Decode a reply body into a `LogEntry`, or `null` for anything that is not
 * already a well-formed, in-domain body of a version this decoder
 * recognises. Never throws. `id` and `hash` are supplied by the caller from
 * the reply's own envelope (author id, content hash) — never read from
 * `body` — so a body's own claims about who authored it cannot spoof
 * either field; that anti-spoofing property belongs to the caller
 * (shoalRoom.ts, Task 3), not to this decoder, but the split of
 * responsibility starts here.
 */
export function decodeBody(body: string, id: string, hash: string): LogEntry | null {
  if (body.length === 0) return null;

  const head = takeFields(body, 2); // version, kind
  if (head === null) return null; // too few fields: not even version|kind is present
  const [version, kind] = head.fields;
  if (version !== WIRE_VERSION) return null; // unknown/unsupported version tag

  if (kind === 'presence') return decodePresenceTail(head.rest, id, hash);
  if (kind === 'eat') return decodeEatTail(head.rest, id, hash);
  // Unrecognised kind — INCLUDING `checkpoint`, which is a real kind on this
  // wire and is deliberately not one of the two above. A checkpoint seeds a
  // fold, it is never folded; `decodeCheckpointBody` is its decoder. There is
  // no explicit branch for it here because a redundant branch returning the
  // same `null` would only look like a check while being unable to fail.
  return null;
}

function decodePresenceTail(tail: string, id: string, hash: string): Presence | null {
  // x, y, heading, speed, ms, salt — say is everything left over
  const parsed = takeFields(tail, 6);
  if (parsed === null) return null; // too few fields
  const [xs, ys, hs, ss, ms, salt] = parsed.fields;
  const sayRaw = parsed.rest;

  // `salt` is checked for SHAPE and never for VALUE. It is deliberately NOT
  // compared against `id`: a body's own claims about its author are exactly
  // what this decoder must not trust (see the module header and
  // shoalRoom.ts's), and `id` already comes from the reply envelope. Its only
  // job is to perturb `sha256(body)` so two different swimmers cannot hash to
  // one content_id; a mismatching salt is a valid — if pointless — body.
  if (!SALT_RE.test(salt)) return null;

  const x = parseIntField(xs);
  const y = parseIntField(ys);
  const heading = parseIntField(hs);
  const speed = parseIntField(ss);
  const msVal = parseIntField(ms);
  if (x === null || y === null || heading === null || speed === null || msVal === null) return null;

  // Coordinate domain: [0, WORLD_W] / [0, WORLD_H], both ends checked.
  // parseIntField accepts negative literals (see its doc) precisely so this
  // check has real work to do — `x < 0` is not excluded upstream.
  if (x < 0 || x > WORLD_W) return null;
  if (y < 0 || y > WORLD_H) return null;

  // Heading bounds check (mutation target 1 — see shoalWire.test.ts and the
  // module header for exactly why this is not cosmetic). Both directions
  // matter: `heading < 0` and `heading >= HEADING_STEPS` are both reachable
  // here because parseIntField accepts a signed literal, so this check —
  // not the lexer — is what has to catch each of them.
  if (heading < 0 || heading >= HEADING_STEPS) return null;

  if (speed < 0) return null;
  if (msVal < 0) return null;

  if (sayRaw.length > MAX_SAY) return null;
  // Delimiter check on `say` (mutation target 3). `say` is last on the wire
  // specifically so it cannot contain a field boundary, but that is a
  // property of WHERE it sits, not proof of what it contains — a say
  // authored with a literal DELIM character in it would otherwise decode
  // with that character silently embedded, which this decoder must reject
  // rather than repair. Independently removable from the length check above
  // and from the field-count check in `takeFields`.
  if (sayRaw.includes(DELIM)) return null;

  // One timestamp (mutation target 2). `msVal` is parsed exactly once above
  // and feeds BOTH `ms` and `vec.t` below — there is no second field on this
  // wire that could set them differently. See the module header.
  const vec: Vec = { x, y, heading, speed, t: msVal };
  const presence: Presence = {
    kind: 'presence', id, vec, ms: msVal, hash,
    ...(sayRaw.length > 0 ? { say: sayRaw } : {}),
  };
  return presence;
}

/**
 * One published checkpoint, as it arrived: the canonical payload plus the
 * envelope facts about who published it and under what content id.
 *
 * Deliberately NOT a member of the `LogEntry` union, and deliberately declared
 * here rather than in shoalTypes.ts — a checkpoint SEEDS a fold, it is never
 * folded. See the module header's "A checkpoint is NOT a `LogEntry`".
 *
 * There is no `ms`. A checkpoint's time is its epoch, which is inside `cp`;
 * a second timestamp would be a value free to disagree with it (the same
 * reasoning as "One timestamp, not two"). `hash` is the reply's content id,
 * available as a deterministic tiebreak exactly as it is on a `LogEntry`.
 */
export interface CheckpointEntry {
  kind: 'checkpoint';
  /** Publisher, from the reply envelope (`author_id`) — never from the body. */
  id: string;
  cp: Checkpoint;
  /** Content hash from the envelope, for deterministic ordering. */
  hash: string;
}

/**
 * Decode a reply body into a published `CheckpointEntry`, or `null` for
 * anything that is not already a well-formed, in-domain, CANONICALLY SPELLED
 * checkpoint body of a version this decoder recognises. Never throws.
 *
 * Separate from `decodeBody` on purpose: the two are disjoint on the kind tag,
 * so a move can never arrive here and a checkpoint can never reach the fold's
 * log. `id` and `hash` come from the reply envelope, never from `body`, for
 * the same reason they do in `decodeBody`.
 */
export function decodeCheckpointBody(body: string, id: string, hash: string): CheckpointEntry | null {
  if (body.length === 0) return null;

  const head = takeFields(body, 3); // version, kind, salt
  if (head === null) return null; // too few fields — nothing for the payload
  const [version, kind, salt] = head.fields;
  if (version !== WIRE_VERSION) return null;
  // Kind discrimination (mutation target 4). This is the ONLY thing that stops
  // a checkpoint payload wearing a move's kind tag from decoding here; a real
  // move body is separately rejected on its salt field, so removing this check
  // is only visible against a mis-tagged body. See shoalWire.test.ts.
  if (kind !== 'checkpoint') return null;
  // Shape only, never compared against `id` — see decodePresenceTail.
  if (!SALT_RE.test(salt)) return null;

  // The payload is the whole remaining tail: it may contain DELIM (an id is
  // an arbitrary string) and is not delimiter-checked, because parseCheckpoint
  // validates it structurally instead. See the module header.
  const cp = parseCheckpoint(head.rest);
  if (cp === null) return null;
  if (!checkpointNumbersInDomain(cp)) return null;
  // Exact canonical spelling (mutation target 5). parseCheckpoint accepts
  // whitespace, a different key order, an extra key, `1E2` for 100, `-0` for
  // 0, and the lenient no-`recent` form — each of which is a SECOND body, and
  // therefore a second content_id, for one world. Reject, never repair.
  if (serialiseCheckpoint(cp) !== head.rest) return null;

  return { kind: 'checkpoint', id, cp, hash };
}

function decodeEatTail(tail: string, id: string, hash: string): EatClaim | null {
  const parts = tail.split(DELIM);
  if (parts.length !== 3) return null; // too few or too many fields (cell, ms, salt)
  const [cs, ms, salt] = parts;
  const cell = parseIntField(cs);
  const msVal = parseIntField(ms);
  if (cell === null || msVal === null) return null;
  if (cell < 0 || cell >= CELL_COUNT) return null;
  if (msVal < 0) return null;
  // Shape only, never compared against `id` — see decodePresenceTail.
  if (!SALT_RE.test(salt)) return null;
  return { kind: 'eat', id, cell, ms: msVal, hash };
}
