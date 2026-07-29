/**
 * Which published checkpoint a client seeds an epoch from — spec §3.9 point 5,
 * *"a cold joiner adopts the newest checkpoint it can see and verifies forward
 * from there; it does not re-derive history back to genesis."*
 *
 * Pure, order-independent, no clock, no I/O. `adoptCheckpoint(entries, epoch)`
 * is a function of the SET of `CheckpointEntry` values handed to it, exactly as
 * `advance` is a function of the set of `LogEntry` values handed to it, so two
 * clients holding the same checkpoints adopt the same seed no matter what order
 * gossip delivered them in.
 *
 * =============================================================================
 * WHAT "VERIFIED" CAN AND CANNOT MEAN HERE
 * =============================================================================
 *
 * It cannot mean re-derived. Verifying a checkpoint means folding the epoch it
 * summarises, and not folding that epoch is the entire point of adopting one.
 * Adoption is therefore TRUST ON FIRST SIGHT, and then self-verifying going
 * forward: from the moment a client adopts, every tick it folds is checked
 * against every peer's by the ordinary means (identical logs fold to identical
 * worlds), and next hour it publishes its own checkpoint into the same
 * comparison it is relying on now.
 *
 * What canonicality gives instead of verification is far more useful:
 * **every honest client computes the identical payload.** Two differing
 * payloads for one epoch is therefore a DETECTED DIVERGENCE — the one outcome
 * this whole engine exists to make impossible — and it is surfaced (`diverged`)
 * rather than silently resolved. The caller reports it; this module never
 * writes player-facing text.
 *
 * A DIFFERENCE IS NOT PROOF OF DISHONESTY, and overstating that would be worse
 * than not reporting it. shoalLoop.ts section 2 names the honest cause exactly:
 * a checkpoint is taken AT the boundary, so an eat claim authored in the last
 * seconds of an epoch and still in flight when a client rolls is simply absent
 * from that client's checkpoint and present in a slower peer's. Both folds are
 * correct; the two payloads still differ. So `diverged` means "these clients
 * did not close the hour on the same set of entries", which covers both an
 * attack and an ordinary gossip race, and the caller's copy must not claim
 * otherwise.
 *
 * =============================================================================
 * "NEWEST" IS EXACTLY `epoch - 1`, AND NOTHING ELSE IS A CANDIDATE
 * =============================================================================
 *
 * `foldShoal` refuses any seed whose `epoch` is not exactly `epoch - 1` (see
 * its own RangeError: "a seed from any other epoch is a bug or an attack"), so
 * an older checkpoint is not a stale-but-usable seed — it is unusable. Adopting
 * one would present an hours-old size table as current and then republish it as
 * this epoch's checkpoint, manufacturing a divergence out of a gap. A room that
 * nobody was playing for an hour therefore starts the next one unseeded, which
 * is also what the fold already does with absence elsewhere: `rollEpoch` prunes
 * a `departed` record after one epoch of not being touched, so sizes older than
 * one epoch are not durable by design.
 *
 * Within that one epoch there is no "newest" to speak of: a `CheckpointEntry`
 * carries no `ms` (see its doc — a checkpoint's time IS its epoch), so
 * `orderLog`'s (ms, hash) total order has nothing to sort on but the hash, and
 * arrival order is not something two clients owe each other. Selection is by
 * EVIDENCE, defined below, with the content hash as the final deterministic
 * tiebreak.
 *
 * =============================================================================
 * THE DISAGREEMENT POLICY: plurality of publishers, hash to break a tie
 * =============================================================================
 *
 * 1. Group the epoch's checkpoints by canonical payload.
 * 2. A publisher that published TWO different payloads for one epoch votes for
 *    NEITHER. A client rolls an epoch once and computes one checkpoint for it,
 *    so two payloads under one author id is provable misbehaviour rather than
 *    an opinion. This matters most in a small room: with one honest publisher,
 *    a griefer publishing both the honest payload and its own would otherwise
 *    manufacture a 1-1 tie and win it half the time for the price of one extra
 *    write. It costs an honest client nothing — a publisher can only ever
 *    cancel its OWN votes, never anyone else's — and both payloads are still
 *    listed in the report.
 * 3. Adopt the payload with the most remaining voters. Ties break on the lowest
 *    content hash of any entry carrying that payload.
 * 4. If rule 2 cancelled EVERY vote, fall back to the lowest-hash payload
 *    rather than adopting nothing. See below — this rule exists because rule 2
 *    fires on ordinary honest play, not only on a griefer.
 *
 * WHY RULE 4 EXISTS: ONE PLAYER, TWO SESSIONS. Rule 2 reads "two payloads under
 * one author id is provable misbehaviour", and against a griefer it is. But a
 * key is not a client. One player with two tabs open — or the desktop app and a
 * browser — polls independently, rolls the hour independently, and can close it
 * on different entry sets for exactly the reason the header above already
 * grants as ROUTINE: an eat claim authored in the last second of an hour and
 * still in flight is absent from one session's checkpoint and present in the
 * other's. Both are honest folds. Under rules 2 and 3 alone, that player's key
 * contradicts itself, its votes vanish, and in a room where it was the only
 * publisher for `epoch - 1` the next joiner folds UNSEEDED — everyone back at
 * START_SIZE, which is Blocker 12 returning by way of the rule meant to close
 * an attack, triggered by ordinary use.
 *
 * Falling back costs nothing rule 2 was protecting. Rule 2 protects an HONEST
 * VOTE from being drowned by a self-contradicting one; when every opinion is
 * self-contradicted there is no honest vote left in the room to protect. And
 * it hands an attacker nothing: to be the only publisher for an epoch is
 * already to win trust-on-first-sight under rule 3, so a griefer who publishes
 * two payloads instead of one has bought itself a coin flip it could have had
 * outright for half the writes. What it buys the joiner is real: a size table
 * two live sessions are both folding from, instead of a world nobody is in.
 *
 * The fallback is the LOWEST HASH rather than "most publishers" or "first
 * seen": with every voter cancelled, hash is the only total order left that all
 * joiners compute identically, and it is the same tiebreak rule 3 already uses.
 *
 * WHY PLURALITY. A joiner wants to agree with the clients that are still
 * playing, and each of those is folding from the payload IT published. Joining
 * the largest bloc maximises the number of live peers this client agrees with,
 * and it is the only rule whose cost to an attacker is the thing that is
 * actually expensive here: out-publishing the honest room needs more sponsored
 * identities than the honest room has, not more writes.
 *
 * WHY A HASH TIEBREAK RATHER THAN REFUSING TO PLAY. Refusing (folding unseeded)
 * was seriously considered and is defensible — it is the one outcome an
 * attacker cannot steer. It loses on two counts. First, in a tie both payloads
 * are already being folded by live peers, so adopting either agrees with about
 * half the room while adopting neither agrees with NOBODY — refusal is strictly
 * worse on the property adoption exists to provide. Second, honest ties are not
 * rare: the boundary race above produces them whenever anyone eats in the last
 * second of an hour, so refusal would routinely hand every joiner the
 * everyone-at-START_SIZE world that Blocker 12 is about. The tiebreak is
 * deterministic, so all joiners facing one tie still agree with each other, and
 * it is not grindable any more cheaply than the plurality is: a body's hash is
 * `sha256(payload plus the publisher's own key prefix)`, so moving it means a
 * different sponsored identity — the same cost as buying a vote.
 *
 * IT IS NEVER SILENT. `diverged` is set on any epoch with more than one payload,
 * whatever the margin, and `opinions` carries every payload with both its full
 * publisher list and the subset that counted, so the caller can report the whole
 * picture rather than the winner alone.
 */
import type { Checkpoint } from './shoalTypes';
import { serialiseCheckpoint } from './checkpoint';
import type { CheckpointEntry } from './shoalWire';

/** One distinct payload published for an epoch, and the evidence behind it. */
export interface CheckpointOpinion {
  /** The canonical text — `serialiseCheckpoint(cp)`. Two opinions are the same
   *  opinion iff these are equal; bodies differ by salt and are never compared. */
  readonly payload: string;
  readonly cp: Checkpoint;
  /** Every publisher whose envelope carried this payload, sorted, deduped. */
  readonly publishers: readonly string[];
  /** Those of `publishers` that published no OTHER payload for this epoch — the
   *  only ones that count toward the plurality. See the module header, rule 2. */
  readonly voters: readonly string[];
  /** Lowest content hash among the entries carrying this payload; the tiebreak. */
  readonly lowestHash: string;
}

export interface Adoption {
  /** The checkpoint to seed `createLoop(epoch, …)` with, or `null` to fold
   *  unseeded. `null` now means exactly ONE thing — no candidate existed for
   *  `epoch - 1` at all. A room whose only publisher contradicted itself still
   *  yields a seed (module header, rule 4). */
  readonly seed: Checkpoint | null;
  /** Every payload published for `epoch - 1`, ranked exactly as the policy
   *  ranks them (most voters first, then lowest hash). Empty when there were
   *  none. The caller reports these; this module writes no copy. */
  readonly opinions: readonly CheckpointOpinion[];
  /** More than one distinct payload exists for `epoch - 1`. See the module
   *  header on what this does and does NOT prove. */
  readonly diverged: boolean;
}

/**
 * Choose the seed for `epoch` from the checkpoints a client can see.
 *
 * `entries` is the whole room's checkpoint set, of any epochs, in any order,
 * with duplicates permitted. Only those for exactly `epoch - 1` are candidates.
 */
export function adoptCheckpoint(
  entries: readonly CheckpointEntry[],
  epoch: number,
): Adoption {
  const want = epoch - 1;

  interface Group {
    payload: string;
    cp: Checkpoint;
    publishers: Set<string>;
    lowestHash: string;
  }
  const groups = new Map<string, Group>();
  /** publisher -> the set of payloads it published for this epoch. */
  const byPublisher = new Map<string, Set<string>>();

  for (const e of entries) {
    if (e.cp.epoch !== want) continue;
    // Re-serialised rather than trusting the body's tail: `serialiseCheckpoint`
    // is the one definition of a checkpoint's canonical text and this module
    // does not keep a second one. (`decodeCheckpointBody` already required the
    // body to carry exactly this text, so the two always agree — which is the
    // point: there is nowhere for them to drift apart.)
    const payload = serialiseCheckpoint(e.cp);
    const g = groups.get(payload);
    if (g === undefined) {
      groups.set(payload, {
        payload, cp: e.cp, publishers: new Set([e.id]), lowestHash: e.hash,
      });
    } else {
      g.publishers.add(e.id);
      if (e.hash < g.lowestHash) g.lowestHash = e.hash;
    }
    let seen = byPublisher.get(e.id);
    if (seen === undefined) { seen = new Set<string>(); byPublisher.set(e.id, seen); }
    seen.add(payload);
  }

  const opinions: CheckpointOpinion[] = [];
  for (const g of groups.values()) {
    const publishers = [...g.publishers].sort();
    // Rule 2: a publisher holding two opinions about one epoch holds none.
    const voters = publishers.filter((id) => (byPublisher.get(id)?.size ?? 0) === 1);
    opinions.push({
      payload: g.payload, cp: g.cp, publishers, voters, lowestHash: g.lowestHash,
    });
  }

  // Rule 3. The hash tiebreak is applied to EVERY comparison, not only to an
  // exact tie, so the order is total and identical on every client.
  opinions.sort((a, b) => {
    if (a.voters.length !== b.voters.length) return b.voters.length - a.voters.length;
    return a.lowestHash < b.lowestHash ? -1 : a.lowestHash > b.lowestHash ? 1 : 0;
  });

  // Rules 3 and 4 together, and they collapse into one line on purpose. The
  // sort above is (voters descending, then lowest hash), so `opinions[0]` is
  // ALWAYS the rule-3 winner when any opinion still has a voter; and when rule
  // 2 cancelled every vote, every opinion ties at zero voters, the sort
  // degenerates to lowest-hash-first, and `opinions[0]` is exactly the rule-4
  // fallback. There is no third case: an empty `opinions` is the only way to
  // reach `null`, which is the "nobody published for `epoch - 1`" absence.
  const winner = opinions[0] ?? null;
  return {
    seed: winner === null ? null : winner.cp,
    opinions,
    diverged: opinions.length > 1,
  };
}
