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
 * ## Why a write that succeeds clears it
 *
 * Being let in is an in-game act by another player (spec §2.16), and it can
 * happen while this window is open — the vouch lands, the very next presence
 * is accepted, and the water takes them. The only evidence this client has of
 * that is a write that went through, so a write that goes through is what
 * lifts the edge. Nothing has to be polled, and there is no second channel to
 * keep in step with the first.
 *
 * ## THE OTHER HALF: a way through that this client can actually take
 *
 * Everything above is RECOGNITION — it tells a player where they stand and
 * waits. On its own that is a dead end with good manners: the shoal is small,
 * nobody is watching for newcomers, and "someone already swimming has to bring
 * you through" describes an act no one is going to perform.
 *
 * The GRANT is `passage.ts`: the same standing auto-approve claim every other
 * game in this repo makes (`ensureSponsored`, swimchain-react), run once before
 * the first write. It takes real time — a small proof of work, then a wait
 * while the vouch is recorded — and a player who is shown a boundary for a
 * minute with nothing moving has been shown a dead end anyway.
 *
 * So the standing carries a second field. `passage` is non-null exactly while
 * that attempt is in flight, and it names WHICH OF ITS THREE BEATS is running,
 * so the surface can say something true and different about each one. It is
 * NOT a second way of saying `atTheEdge` — see `showsTheEdge` for why they are
 * separate, and `afterPassage` for the one thing a failed attempt is allowed
 * to conclude.
 */
import type { SendFailure } from '../lib/shoalSend';

/**
 * The three beats of an attempt to be brought through, in the order they
 * happen. Named for what the player is shown, not for the machinery — the
 * mapping from the machinery's own phase strings is `passageFor`, and it lives
 * in exactly one place so nothing else ever has to hold one of those strings.
 *
 *   noticed   the shoal is looking for someone who will vouch
 *   swimming  the newcomer is paying the cost of being counted (proof of work)
 *   turning   the vouch has been asked for; the water has to record it
 */
export type Passage = 'noticed' | 'swimming' | 'turning';

/**
 * Where this client stands with the water. An interface rather than a bare
 * boolean because §2.16 has two halves and they are different facts: one is a
 * STANDING CONDITION the node reported, the other is an ATTEMPT this client is
 * making about it.
 */
export interface Standing {
  /** True once a write was refused because nobody has let this swimmer in. */
  readonly atTheEdge: boolean;
  /**
   * Non-null exactly while this client is trying to be brought through, and
   * which beat of that attempt is running. `null` when no attempt is in
   * flight — which is the ordinary case both before one starts and forever
   * after one ends.
   */
  readonly passage: Passage | null;
}

/** The standing a client starts in: nothing has been refused, so nothing is
 *  claimed. A player whose first write is accepted never sees the edge at all,
 *  which is the whole point of not asserting it up front. */
export const OPEN_WATER: Standing = { atTheEdge: false, passage: null };

/** Refused for want of a voucher, and still refused until someone acts. */
export const AT_THE_EDGE: Standing = { atTheEdge: true, passage: null };

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
// The attempt to be brought through
// ---------------------------------------------------------------------------

/**
 * Which beat one of `ensureSponsored`'s own progress strings is.
 *
 * THE THREE STRINGS ARE A FOREIGN LITERAL, not a contract, and this is the
 * only place in the client that holds one. They are written inline in
 * `swimchain-react/src/lib/ensureSponsored.ts` (`onProgress?.('…')`), so there
 * is no symbol to import and nothing that would break at compile time if they
 * were reworded. `wayIn.test.ts` therefore reads that file and fails if any of
 * the three is no longer in it — which is the only way this mapping can be
 * held honest at all.
 *
 * ANYTHING UNRECOGNISED IS THE FIRST BEAT, deliberately. A reworded phase
 * string must degrade to "the shoal is looking", which is true for the whole
 * attempt, rather than to `null` — because `null` means "no attempt is running"
 * and would take the surface away from a player mid-passage. The same choice
 * the trench makes (`kindleStepIndex`, trench-client/ui/src/App.tsx).
 */
export function passageFor(phase: string): Passage {
  if (phase === 'Waiting for approval') return 'turning';
  if (phase === 'Requesting sponsorship (proof-of-work)') return 'swimming';
  return 'noticed';
}

/**
 * Fold one progress report into the standing.
 *
 * Returns the SAME object when the beat has not changed, so the surface is not
 * re-rendered by a phase that was reported twice.
 *
 * `atTheEdge` is carried through untouched: an attempt says nothing about
 * whether a write has been refused, and a player who was already at the edge
 * when the attempt began is still at it until something changes that.
 */
export function enterPassage(prev: Standing, phase: string): Standing {
  const beat = passageFor(phase);
  if (prev.passage === beat) return prev;
  return { atTheEdge: prev.atTheEdge, passage: beat };
}

/**
 * Fold the END of an attempt into the standing. `letIn` is whether the water
 * now holds a vouch for this swimmer.
 *
 * ## WHY A FAILED ATTEMPT MAY RAISE THE EDGE WHEN A FAILED WRITE MAY NOT
 *
 * The module header is emphatic that only a `'not-sponsored'` refusal raises
 * the edge, because every other failed write is a passing accident — a lost
 * wifi, a node still opening its store — and saying "someone has to let you in"
 * about one of those sends a player looking for a stranger to fix a router.
 *
 * An attempt is not a write and the reasoning does not transfer. By the time
 * one runs, the local node has already answered four separate calls
 * (`shellConfig` will not produce a configuration otherwise), and the attempt
 * itself begins by ASKING THE NODE whether this swimmer is vouched for and
 * being told no — that is what `ensureSponsored` does before it reports its
 * first phase at all. So an attempt that got as far as reporting a beat and
 * then failed has established the standing condition directly, whatever the
 * proximate cause of the failure was.
 *
 * AN ATTEMPT THAT NEVER REPORTED A BEAT HAS ESTABLISHED NOTHING, and this is
 * the case the guard below exists for: it never got past its own precondition
 * checks, so it learned nothing about this swimmer and must leave the standing
 * exactly as it found it. The first write then decides, honestly, the way it
 * always did.
 */
export function afterPassage(prev: Standing, letIn: boolean): Standing {
  if (letIn) return !prev.atTheEdge && prev.passage === null ? prev : OPEN_WATER;
  if (prev.passage === null) return prev;
  return AT_THE_EDGE;
}

/**
 * Is there a boundary to draw? Either half of the standing puts one up.
 *
 * KEPT SEPARATE FROM `atTheEdge` ON PURPOSE. It would have been one line
 * shorter to let an attempt set `atTheEdge` itself, and it would have made
 * that flag mean two different things — "the node refused a write" and "this
 * client is busy" — in a module whose entire header is an argument about
 * exactly which failures are allowed to claim the first of those. The view asks
 * this; nothing else has to know there are two fields.
 */
export function showsTheEdge(s: Standing): boolean {
  return s.atTheEdge || s.passage !== null;
}

/** The second line to draw for this standing: the beat of an attempt in
 *  flight, or the standing condition when none is. */
export function bodyFor(s: Standing): string {
  return s.passage === null ? EDGE_BODY : PASSAGE_BODY[s.passage];
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

/**
 * The second line while an attempt is in flight — one per beat, replacing
 * `EDGE_BODY` for as long as it runs.
 *
 * THEY ARE HELD TO THE SAME RULE AND THEY ARE HARDER TO KEEP TO IT. What is
 * actually happening under each of these lines is: an offer is being looked up,
 * a proof of work is being mined, a sponsorship action is being waited on. Every
 * honest description of that machinery is made of the exact words spec §1.1
 * forbids, so none of these is a translation of it — each states what is TRUE
 * OF THE SWIMMER at that beat, which is a different sentence about the same
 * moment and the only kind that can be said in sea language:
 *
 *   noticed   there is now something in the shoal attending to this fish;
 *   swimming  the fish is spending effort to be counted (which is literally
 *             what the proof of work is, and is why this line is not a
 *             euphemism for a progress bar);
 *   turning   an established swimmer is bringing them in — the same act
 *             `EDGE_BODY` names as the only thing that changes anything, now
 *             actually happening, in the same words so the player can see that
 *             it is the same thing.
 *
 * The last one matters most: it is what makes the boundary read as RESOLVING
 * rather than as a second, longer wait. `bodyFor` is what picks between them.
 */
export const PASSAGE_BODY: Readonly<Record<Passage, string>> = {
  noticed: 'The shoal has caught sight of you.',
  swimming: 'You are swimming hard to be counted.',
  turning: 'An older swimmer is turning to bring you through.',
};
