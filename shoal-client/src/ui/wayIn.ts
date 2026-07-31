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
 * Being let in happens by whatever means members of this network are vouched
 * for — outside the game, and possibly while this window is open (spec §2.16's
 * RESOLVED block). The vouch lands, the very next presence is accepted, and the
 * water takes them. The only evidence this client has of that is a write that
 * went through, so a write that goes through is what lifts the edge. Nothing is
 * polled, nothing is asked for, and there is no second channel to keep in step
 * with the first.
 *
 * THE TRIGGER IS AN ACCEPTED WRITE AND NOT "A WRITE THAT WAS NOT REFUSED", and
 * the difference is the whole safety of it. `classifySendFailure` returns a
 * `SendFailure` for a dropped wifi (`'unreachable'`) and for a mistimed PoW
 * (`'unknown'`) exactly as it does for the refusal, so a rule that lifted on
 * anything other than `'not-sponsored'` would let a flaky node fake a welcome:
 * one lost packet and the boundary would be gone, the player dropped into water
 * that still will not carry them, with nothing left on screen to say so. Only
 * `failure === null` moves anything.
 *
 * AND `null` MEANS THE WRITE LANDED, not merely that the node did not send an
 * `error`. Those came apart once: a JSON-RPC 200 whose `result` carried no
 * `content_id` resolved the write path with `undefined`, arrived here as a
 * `null` failure, and lifted the boundary for a player whose write never
 * reached a peer (plan 4c task 2 review, M-1). `submitToRoom` now rejects that
 * answer, which classifies as `'unknown'` and therefore changes nothing here.
 * This module still folds one input and has no idea any of that happened —
 * which is the point: "accepted" is decided once, at the wire, by the layer
 * that can see it. Mutation-verified both ways (plan 4c task 2).
 *
 * ## There is no deadline, and there must not be one
 *
 * Plan 4b measured a real sponsorship at 200 seconds end to end, against a
 * client that had given up at 180: the answer arrived and nobody was listening.
 * Nothing here counts, times out or expires. The edge lifts whenever it lifts —
 * a minute, an hour, or in a session after the one that raised it — because the
 * only thing that ends the wait is a write going through, and this client keeps
 * making writes for as long as it is open (`seaChoice.knockOn`).
 *
 * ACROSS SESSIONS IT SURVIVES BY BEING FORGOTTEN, WHICH IS NOT A PUN. Nothing
 * in this module is persisted. A window opens in `OPEN_WATER`, claiming
 * nothing, and its first write decides: refused, and the boundary goes up;
 * accepted, and the player is simply in the water with no ceremony, because
 * nothing on this machine ever knew they had been waiting. A standing written
 * to disk would be a cache of somebody else's decision, and the one thing it
 * could do that this cannot is be WRONG — showing the boundary to a player who
 * was let in an hour ago, until a write happened to correct it.
 */
import type { SendFailure } from '../lib/shoalSend';

/**
 * Where this client stands with the water. Two flags, and they are never both
 * raised: `atTheEdge` is the wait, `crossing` is the one moment it ends.
 *
 * IT DECIDES WHICH SEA THE PLAYER IS IN, not only whether a boundary is drawn
 * over one. `seaChoice.chooseWater` reads `atTheEdge`: raised, the player swims
 * the shallows — a sea with a cast, a tide and a sweep in it — instead of
 * standing in water that will not carry a single thing they do. Read that
 * function's header before changing what raises or lowers this, because the
 * other half of it is the thing that must not change: while that flag is up,
 * `seaChoice.knockOn` keeps publishing the player's own vectors into the real
 * water. A client that stops writing can never learn that it has been let in,
 * and the flag would be up forever.
 */
export interface Standing {
  /** True once a write was refused because nobody has let this swimmer in. */
  readonly atTheEdge: boolean;
  /**
   * True for the one stretch of a session in which the water has JUST taken
   * this swimmer in — the payoff of the whole newcomer arc, and the reason
   * this is a third state rather than a boolean going false.
   *
   * The player is already in the real water while it is raised (`atTheEdge` is
   * false, so `chooseWater` answers `'chain'`): nothing is being held back and
   * no write is delayed. All it says is that the boundary is still on screen,
   * lifting, and `TheEdge` should draw it going rather than snap it out of
   * existence mid-swim. `settled` lowers it once `CROSSING_MS` has passed.
   *
   * IT CANNOT BE RAISED TWICE FOR ONE WAIT. Only a standing with `atTheEdge`
   * up can enter it, and entering lowers that flag; a second accepted write a
   * moment later finds neither flag and returns the same object untouched.
   */
  readonly crossing: boolean;
}

/** The standing a client starts in: nothing has been refused, so nothing is
 *  claimed. A player whose first write is accepted never sees the edge at all,
 *  which is the whole point of not asserting it up front — and is also why a
 *  player accepted between two sessions comes back straight into the water
 *  (see the module header on surviving a restart by being forgotten). */
export const OPEN_WATER: Standing = { atTheEdge: false, crossing: false };

/** Refused for want of a voucher, and still refused until someone acts. */
export const AT_THE_EDGE: Standing = { atTheEdge: true, crossing: false };

/** In the water, and the boundary is still lifting off them. */
export const CROSSING: Standing = { atTheEdge: false, crossing: true };

/**
 * HOW LONG THE BOUNDARY GOES ON BEING DRAWN AFTER IT HAS STOPPED BEING TRUE.
 *
 * Long enough for the lift to play out and no longer: it is the ceiling on
 * `theEdge.css`'s own `--shoal-edge-lift-ms`, which is what actually times the
 * animation, and `shippedStyles.test.ts` holds the two in that order against
 * the EMITTED stylesheet. The margin is deliberate — a lift that outlived this
 * number would be cut off mid-air, and cutting off the one moment this whole
 * arc exists for is exactly the failure that would never show up in a unit
 * test.
 *
 * Nothing waits on it. The player is in real water from the instant the write
 * was accepted; this only decides when a `pointer-events: none` overlay stops
 * being in the tree.
 */
export const CROSSING_MS = 2_600;

/**
 * Fold the outcome of one attempted write into the standing.
 *
 * `failure` is `null` when the node accepted the write, and otherwise the
 * typed classification from `classifySendFailure` — never an error, never a
 * message. See the module header for why only one of the three kinds raises
 * the edge and why only `null` — never merely "not a refusal" — lowers it.
 *
 * Returns the SAME object when nothing changed, so a React caller holding this
 * in state can pass it straight to `setState` without re-rendering the tree on
 * every accepted vector (which is one every 3-8 seconds, forever).
 */
export function afterWrite(prev: Standing, failure: SendFailure | null): Standing {
  if (failure === null) return prev.atTheEdge ? CROSSING : prev;
  if (failure.kind === 'not-sponsored') return prev.atTheEdge ? prev : AT_THE_EDGE;
  // EVERY OTHER KIND LEAVES THE STANDING EXACTLY WHERE IT WAS, and `'no-water'`
  // is deliberately among them.
  //
  // -32014 means the SPACE is not on this node's chain — nobody has minted the
  // water on this network yet. It was reproduced as a silent dead end (the
  // report's I4): every write fails, nothing moves here, and the player sees an
  // empty sea with no explanation. Classifying it (`shoalSend.ts`) makes the
  // fact available and is where that work stops on purpose: WHAT A PLAYER IS
  // TOLD IS A DESIGN DECISION, this file's copy is spec §1.1 diegetic text, and
  // inventing a fourth standing here would be deciding it alone. The edge of
  // the water is specifically about being refused ENTRY by other players
  // (§2.16); "there is no water" is not that, and reusing it would say
  // something false.
  return prev;
}

/**
 * The moment is over: drop the boundary from the tree.
 *
 * A separate function from `afterWrite` because it is answering a different
 * question — the clock's, not the node's — and because a caller that folded
 * both through one entry point would have to invent an event for "time passed"
 * and hand it a `SendFailure | null` that means neither thing.
 *
 * Total and idempotent: a standing that is not crossing comes back unchanged
 * (the same object, so a stray timer re-renders nothing), and a player who was
 * refused AGAIN while the lift was playing is already back at `AT_THE_EDGE` and
 * is left exactly there — the timer must not put a player back in water that
 * has just said no to them a second time.
 */
export function settled(prev: Standing): Standing {
  return prev.crossing ? OPEN_WATER : prev;
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
