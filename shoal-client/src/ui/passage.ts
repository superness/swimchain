/**
 * The granting half of the way in — plan 4b, Task 3b.
 *
 * `wayIn.ts` RECOGNISES a swimmer nobody has vouched for. This module tries to
 * do something about it, and it is a thin wrapper over machinery that already
 * exists rather than machinery of its own:
 *
 *   reef    reef-client/src/lib/reefEngine.ts:950
 *   chess   chess-client/src/lib/chessGame.ts:97
 *   trench  trench-client/ui/src/lib/trenchNet.ts:254
 *   chips   chips-client/src/lib/host.ts:301
 *
 * All four are the same five lines around `@swimchain/react`'s `ensureSponsored`,
 * and so is this. NOTHING ABOUT THE WIRE FORMAT OR THE FOLD IS TOUCHED: a vouch
 * is not a Shoal message, it is not in `shoalWire.ts`, no client folds it, and
 * `splitRoomReplies` never sees it. This module could be deleted and every
 * client in the water would still agree about the world.
 *
 * ## WHY THE SHOAL COULD NOT JUST CALL IT, AND WHAT WAS DONE INSTEAD
 *
 * `ensureSponsored(rpc, id, options)` wants a `SwimchainRpc` — a class, with
 * private fields, so a structurally-similar object is NOT assignable to it and
 * a two-line duck-typed adapter does not compile. This client deliberately does
 * not use that class: `shoalRpc.ts`'s header says why at length (it accepts
 * `{username, password}` or its own signature scheme, never the ready-built
 * `Authorization` header the Tauri shell hands us).
 *
 * The reference shell is in exactly this position and solves it by building a
 * real `SwimchainRpc` out of the decoded header — `legacyRpc`, trenchNet.ts:230
 * — and that is what `nodeRpcFor` below does too, for three reasons:
 *
 *   - the alternative that keeps the header intact is widening the shared
 *     helper's parameter, which edits a module four shipping clients call and
 *     a `dist/` that is committed to the repo, to buy nothing this shell needs;
 *   - PORTING the helper into `src/ui/` would be its SIXTH copy of the claim
 *     PoW and the claim signature preimage. `docs/THE_SHOAL_OPEN_ITEMS.md:386`
 *     already tracks that duplication as a problem; adding to it to save one
 *     base64 round trip would be a poor trade;
 *   - the round trip is lossless for the ONLY header this shell ever produces.
 *     `get_rpc_config` returns `Basic base64("__cookie__:<cookie>")`
 *     (src-tauri/src/main.rs:196-199) and `SwimchainRpc` re-encodes exactly
 *     that. `passage.test.ts` section 5 asserts the header that reaches the
 *     node is byte-identical to the one the shell handed over, so this claim is
 *     checked rather than asserted.
 *
 * IT IS ALSO STRICTER THAN THE REFERENCE IN ONE PLACE. `legacyRpc` responds to
 * a header it cannot decode by proceeding UNAUTHENTICATED, on the reasoning
 * that the node will refuse it clearly. That is true of `claim_sponsorship_offer`
 * and false of the call before it: a node answers READ methods without auth
 * (shoalRpc.ts's "why there is no bare-localhost fallback" — the same trap, an
 * hour lost to it once already), so `get_sponsorship_status` would answer
 * cheerfully and the failure would surface as an unrelated one much later.
 * `nodeRpcFor` throws instead.
 *
 * ## No player-facing text lives here
 *
 * Spec §1.1. `onPhase` forwards `ensureSponsored`'s OWN progress strings, which
 * say "sponsor" twice and must never be drawn — `wayIn.passageFor` is what turns
 * one into a beat, and `wayIn.PASSAGE_BODY` holds the words. The console lines
 * below are developer output on a path no player sees rendered, like
 * `shellConfig`'s.
 */
import { ensureSponsored, SwimchainRpc } from '@swimchain/react';

import { assertWireSpaceId, type RpcAuth } from '../lib/shoalRpc';
import type { SignFn } from '../lib/shoalSend';

/**
 * The always-online identity that runs the standing offer newcomers claim.
 *
 * DEFAULTED TO THE MAINNET GAME SPONSOR RATHER THAN LEFT EMPTY, and unlike
 * reef/chess it is not defaulted to the testnet genesis root either. The
 * difference is what this client ships as: reef and chess are web bundles
 * deployed by `scripts/deploy-web-clients.sh`, which sets `VITE_GAME_SPONSOR`
 * on every deploy and is guarded by the standing bundle rule. The Shoal ships
 * as a desktop binary whose shell only ever starts a MAINNET node
 * (`src-tauri/src/node_manager.rs:19`), built by `tauri build` from whatever
 * env happens to be present — so an unset variable is a real possibility, and
 * on mainnet the wrong value is not a degraded experience but a permanent one:
 * `strictPreferred` refuses to claim any other sponsor's offer, so every
 * newcomer would fail forever with nothing on screen to say why.
 *
 * This key is the only entry in the node's own mainnet game-sponsor allowlist
 * (`src/sponsorship/genesis_list.rs:121-124`) — on mainnet nobody else may run
 * an auto-approve offer at all (`src/rpc/methods.rs:17176-17194`) — so it is
 * not a preference, it is the only value that can work. `passage.test.ts`
 * section 1 reads that Rust file and fails if the two ever disagree.
 *
 * `import.meta.env` does not exist under plain `tsx`, hence the `?.`: this
 * module is imported by a test that runs there.
 */
export const GAME_SPONSOR: string =
  (import.meta.env?.VITE_GAME_SPONSOR as string | undefined)?.trim()
  || '0530df507ad26a2ee6d0c61ef1e37e4e08abae087c1755467d98e3435ecd2984';

/** Who is being brought through. The shape `shellConfig`'s `signer` already
 *  resolves to — the node's own public key, and a signer that signs THROUGH
 *  the node (`sign_message`). Nothing in this window holds a private key, and
 *  the claim signature below is produced the same way every other write is. */
export interface Newcomer {
  readonly publicKeyHex: string;
  readonly sign: SignFn;
}

/**
 * A `SwimchainRpc` pointed at the same node, with the same credential.
 *
 * Exported for the test, which drives it directly to prove the credential
 * survives the round trip described in the module header.
 *
 * @throws if `authHeader` is present and is not a scheme this can carry over.
 *   Never silently unauthenticated — see the module header.
 */
export function nodeRpcFor(auth: RpcAuth): SwimchainRpc {
  let basicAuth: { username: string; password: string } | undefined;
  if (auth.authHeader !== null && auth.authHeader !== '') {
    if (!auth.authHeader.startsWith('Basic ')) {
      throw new Error(
        'the shell handed over an Authorization header this path cannot carry '
        + `(${JSON.stringify(auth.authHeader.split(' ')[0])}); it must be Basic, because `
        + 'SwimchainRpc rebuilds the header from a username and a password rather than '
        + 'forwarding one. Proceeding without it would look healthy on every read and '
        + 'fail much later on the first write.',
      );
    }
    const decoded = atob(auth.authHeader.slice('Basic '.length));
    const colon = decoded.indexOf(':');
    if (colon < 0) {
      throw new Error('the shell\'s Basic credential has no ":" in it once decoded');
    }
    basicAuth = { username: decoded.slice(0, colon), password: decoded.slice(colon + 1) };
  }
  return new SwimchainRpc({ endpoint: auth.endpoint, auth: basicAuth, timeout: 30_000 });
}

/**
 * Try to have this swimmer vouched for, once, before anything is written.
 *
 * Returns whether the water now holds a vouch. **NEVER THROWS** — a failure
 * here must not stop the window reaching the water. A player whose grant fails
 * still gets a sea, still swims, still sees everyone else; their writes are
 * refused and `wayIn.ts` says so, which is exactly the state this client
 * shipped in before this module existed. Throwing would trade a partial game
 * for none.
 *
 * `onPhase` receives `ensureSponsored`'s own progress strings — raw, foreign,
 * and never drawn. `wayIn.passageFor` is the only thing that reads one.
 *
 * ## THE SPACE ID IS ASSERTED, NOT TRUSTED
 *
 * The offer this claims is SPACE-SCOPED, and `ensureSponsored` decides whether
 * an offer's scope matches by comparing `space_scope` to `spaceId` as lowercased
 * strings. The node always reports `space_scope` in bech32m
 * (`encode_space_id`, src/rpc/methods.rs:17031), so a hex space id would match
 * nothing, `strictPreferred` would find no offer, and the error a developer
 * would then read is "the game sponsor has no open slots" — a sentence about
 * the sponsor, describing a bug in the caller. `assertWireSpaceId` already
 * exists for exactly this class of mistake (shoalRpc.ts) and is reused rather
 * than re-argued.
 */
export async function openTheWay(
  auth: RpcAuth,
  id: Newcomer,
  spaceId: string,
  onPhase?: (phase: string) => void,
): Promise<boolean> {
  try {
    assertWireSpaceId(spaceId, 'openTheWay');
    await ensureSponsored(nodeRpcFor(auth), { publicKeyHex: id.publicKeyHex, sign: id.sign }, {
      preferredSponsorHex: GAME_SPONSOR,
      strictPreferred: true,
      requiredSpaceId: spaceId,
      onProgress: onPhase,
    });
    return true;
  } catch (e) {
    console.error('[shoal] could not bring this swimmer through:', e);
    return false;
  }
}
