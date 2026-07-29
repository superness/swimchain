/**
 * The way in — what a swimmer the water has not taken yet is told, and how the
 * shell decides to tell them (spec §2.16, "Newcomers").
 *
 * DISPLAY SIDE. This module holds the one piece of state the game has that is
 * about the PLAYER rather than about the world, plus the exact words the edge
 * of the water is described with. `TheEdge.tsx` draws it; `chainSea.ts`
 * produces the events that drive it; nothing in `src/lib/` knows it exists.
 *
 * ## What the node actually says, and why this file never reads a message
 *
 * On testnet and mainnet a write from an identity nobody has vouched for is
 * refused at ingestion — `check_identity_sponsored` (src/rpc/methods.rs:753),
 * called first thing in `submit_reply` (:2916), answering
 * `RpcErrorCode::IdentityNotSponsored` (-32015, src/rpc/error.rs:31). Task 3
 * turned that into a TYPE: `classifySendFailure` (shoalSend.ts) reads the
 * numeric `code` off a `JsonRpcCallError` and returns `kind: 'not-sponsored'`.
 *
 * This module consumes that `kind` and nothing else. It never sees, matches or
 * forwards the node's own prose — which matters twice over: a message string
 * is not a contract and would drift, and the node's message says the words
 * "sponsored" and "post", neither of which may ever reach a player (spec §1.1).
 * The copy below is written from scratch in sea language for that reason, not
 * translated from the error.
 *
 * ## Why only `'not-sponsored'` raises the edge
 *
 * A refusal for want of a voucher is a STANDING condition: it will be true on
 * every write until a person in the water changes it, and the player needs to
 * understand it as a place they are in rather than a thing that went wrong
 * once. Every other failure is a passing accident of the moment — a node that
 * is still opening its store answers `InternalError`, a laptop that lost its
 * wifi answers nothing at all, a bad signature answers something else again —
 * and a client that showed "someone has to let you in" for any of those would
 * be lying about what is wrong and would send the player looking for a
 * stranger to fix a router.
 *
 * So `'unreachable'` and `'unknown'` leave the standing EXACTLY as it was.
 * That is deliberately not the same as "clear it": a player at the edge whose
 * connection then drops is still at the edge, and flickering the surface off
 * on an unrelated failure would be its own kind of dishonesty.
 *
 * ## What a player at the edge is actually doing while they wait
 *
 * Swimming. `seaChoice.chooseWater` puts them in the shallows (shallows.ts) —
 * the tutorial water, with its cast, its tide and its sweep — for as long as
 * this flag is up. That is §2.16's "never let a downloader dead-end" applied to
 * the one player it never used to reach: before this, a refused newcomer got
 * these two lines drawn over a real sea in which nothing they did had any
 * effect at all.
 *
 * §2.16 also says unvouched newcomers are "visible to everyone", circling at
 * the edge of the real water. THAT HALF IS NOT DELIVERED AND CANNOT BE FROM
 * HERE: every write they make is refused at ingestion, so no peer ever receives
 * one and there is nobody to be visible to. It would take the network carrying
 * an unvouched swimmer's presence, which is a node decision. Nothing in this
 * client fakes it.
 *
 * ## Why a write that succeeds clears it
 *
 * Being let in is an in-game act by another player (spec §2.16), and it can
 * happen while this window is open — the vouch lands, the very next presence
 * is accepted, and the water takes them. The only evidence this client has of
 * that is a write that went through, so a write that goes through is what
 * lifts the edge. Nothing has to be polled, and there is no second channel to
 * keep in step with the first.
 */
import type { SendFailure } from '../lib/shoalSend';

/**
 * Where this client stands with the water. One flag today; an interface rather
 * than a bare boolean because §2.16's other half (who vouched for you, and
 * whether they are still swimming) belongs here when it is built.
 *
 * IT DECIDES WHICH SEA THE PLAYER IS IN, not only whether a boundary is drawn
 * over one. `seaChoice.chooseWater` reads this flag: raised, the player swims
 * the shallows — a sea with a cast, a tide and a sweep in it — instead of
 * standing in water that will not carry a single thing they do. Read that
 * function's header before changing what raises or lowers this, because the
 * other half of it is the thing that must not change: while this flag is up,
 * `seaChoice.knockOn` keeps publishing the player's own vectors into the real
 * water. A client that stops writing can never learn that it has been let in,
 * and this flag would be up forever.
 */
export interface Standing {
  /** True once a write was refused because nobody has let this swimmer in. */
  readonly atTheEdge: boolean;
}

/** The standing a client starts in: nothing has been refused, so nothing is
 *  claimed. A player whose first write is accepted never sees the edge at all,
 *  which is the whole point of not asserting it up front. */
export const OPEN_WATER: Standing = { atTheEdge: false };

/** Refused for want of a voucher, and still refused until someone acts. */
export const AT_THE_EDGE: Standing = { atTheEdge: true };

/**
 * Fold the outcome of one attempted write into the standing.
 *
 * `failure` is `null` when the node accepted the write, and otherwise the
 * typed classification from `classifySendFailure` — never an error, never a
 * message. See the module header for why only one of the three kinds moves
 * anything.
 *
 * Returns the SAME object when nothing changed, so a React caller holding this
 * in state can pass it straight to `setState` without re-rendering the tree on
 * every accepted vector (which is one every 3-8 seconds, forever).
 */
export function afterWrite(prev: Standing, failure: SendFailure | null): Standing {
  if (failure === null) return prev.atTheEdge ? OPEN_WATER : prev;
  if (failure.kind === 'not-sponsored') return prev.atTheEdge ? prev : AT_THE_EDGE;
  return prev;
}

// ---------------------------------------------------------------------------
// The copy. The only player-facing words in this client apart from a player's
// own speech.
// ---------------------------------------------------------------------------

/**
 * THE DIEGETIC RULE (spec §1.1) IS THE WHOLE CONSTRAINT ON THESE TWO LINES.
 * No player-facing text may refer to nodes, chains, spaces, posts, replies,
 * sponsors or Swimchain, and none of them may be paraphrased into view either
 * — "your identity has not been vouched for" would keep the letter and lose
 * the point. What the player is told is where they are and what has to happen,
 * in the language of the sea and nothing else.
 *
 * Spec §2.16's closing line is the bar: *"Never let a downloader dead-end. A
 * player who cannot reach the shoal sees a place, not an error."* So the first
 * line names a PLACE, and the second names the act — done by a person, in the
 * water, not by the player and not by a form.
 *
 * They are pinned as constants rather than written inline in the view so that
 * `wayIn.test.ts` can hold them to that rule by name; a string typed straight
 * into JSX is a string nothing checks.
 */
export const EDGE_TITLE = 'You are at the edge of the water.';

/** The second line: what is true, and what would change it. "Someone already
 *  swimming" is the whole mechanism stated in five words — a person who is in
 *  the water, acting inside the game. No link, no code, no chore (§2.16). */
export const EDGE_BODY =
  'The shoal has not taken you in yet. Stay close and keep circling — '
  + 'someone already swimming has to bring you through.';
