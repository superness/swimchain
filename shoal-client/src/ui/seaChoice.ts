/**
 * Which water this window is in, and how a configuration becomes a sea —
 * plan 4b, Task 2.
 *
 * `App.tsx` had ONE configuration path and it was switched off in every shipped
 * build. There are two now, and this module holds the parts of that which can
 * be run outside a browser: the RULE that picks between them, and the
 * CONSTRUCTION that turns whichever won into a `ChainSea`. What stays in
 * `App.tsx` is the one thing that cannot move — the static `import.meta.env.DEV`
 * gate that keeps `browserIdentity.ts` out of the bundle (see `App.tsx:167-190`,
 * and section 3 of this module's test, which holds that gate in place by name).
 *
 * ## THE RULE, AND WHY IT IS A FUNCTION RATHER THAN A `??`
 *
 * `chooseSeaSource` states, in one place a test can drive, what a build does
 * with each combination of the two paths. The static gate makes the dev path
 * unreachable in a release build and is the security property; this function is
 * the BEHAVIOUR — including the case the gate exists for, `dev=false` with
 * query parameters present and no shell, which must be the offline sea and not
 * an attempt to honour them. A test can assert that; it cannot assert anything
 * about a `??` in a component file that never loads under `tsx`.
 *
 * The two are deliberately belt AND braces, and neither is redundant: remove
 * the gate and the weak key derivation ships (unreachable, but present, in an
 * app whose release build enables devtools); remove this rule and the gate
 * still holds but nothing states what a shipped build DOES.
 *
 * ## No player-facing text lives here
 *
 * Spec §1.1. `onError` below is developer output on the same channel
 * `chainSea` has always used; nothing in this module is drawn.
 */
import { chainSea, type ChainSea } from './chainSea';
import type { RpcAuth } from '../lib/shoalRpc';
import type { SendFailure, SignFn } from '../lib/shoalSend';
import { WORLD_H, WORLD_W } from '../lib/shoalConst';

/**
 * Where a sea's configuration came from, or that there wasn't one.
 *
 *   dev      query parameters — a room a developer typed, with a browser-held
 *            key and the node's cookie in the address bar. DEV BUILDS ONLY.
 *   shell    the desktop shell and the node it started (`shellConfig.ts`) —
 *            no URL, no key in the browser. Available in a release build.
 *   offline  neither. The window shows water nobody else is in.
 */
export type SeaSource = 'dev' | 'shell' | 'offline';

/**
 * WHERE and WHO — the subset of `ChainSeaConfig` both paths produce, and the
 * whole of what they disagree about. `spawn`, `onError` and `onWrite` are the
 * same on either path and are decided by `seaFrom` below, so the two callers
 * cannot drift on them.
 */
export interface WaterConfig {
  readonly auth: RpcAuth;
  readonly spaceId: string;
  readonly roomContentId: string;
  readonly authorIdHex: string;
  readonly signer: Promise<{ publicKeyHex: string; sign: SignFn }>;
}

/**
 * Which of the two configurations a window should swim in.
 *
 * `dev` is `import.meta.env.DEV`, passed rather than read, so this rule can be
 * driven at both values from a test — under `tsx` there is no `import.meta.env`
 * at all and reading it here would make the module unloadable.
 *
 * THE PRECEDENCE IS DEV FIRST, and only one context can even raise the
 * question: `tauri dev`, which is a dev build WITH a shell. A developer who
 * typed `?rpc=&space=&room=` named a specific room on a specific node and is
 * almost certainly running `scripts/two-client-smoke.ts`, which prints those
 * URLs; silently joining the shell's own water instead would replace the sea
 * being captured with a different one that looks very much like it. In a
 * release build the question cannot arise, because `chainParams` is behind the
 * same static gate and reports no parameters however many are in the URL.
 *
 * THE CASE THE GATE EXISTS FOR IS `dev=false, devParams=true, shell=false`.
 * `devtools` is enabled in release (`src-tauri/Cargo.toml`) and `location`
 * is settable from an inspector, so a release build being handed query
 * parameters is a thing that can happen — and the answer is `offline`, not an
 * attempt to honour them.
 */
export function chooseSeaSource(dev: boolean, devParams: boolean, shell: boolean): SeaSource {
  if (dev && devParams) return 'dev';
  if (shell) return 'shell';
  return 'offline';
}

/**
 * Mid-world, so a fresh window is somewhere another window's camera can
 * plausibly reach.
 *
 * It only decides where the pointer starts steering from before the first
 * publish — the fold overrides it the moment a real vector for this swimmer
 * arrives. Shared by both paths deliberately: a dev capture and a shipped build
 * that opened in different places would make every screenshot of one a lie
 * about the other.
 */
export const SEA_SPAWN = { x: Math.round(WORLD_W / 2), y: Math.round(WORLD_H / 2) } as const;

/**
 * Turn a configuration — from either path — into the sea the frame loop folds.
 *
 * The caller passes `onWrite` because only it knows what to do with a refusal
 * (spec §2.16: `wayIn.afterWrite` raises the edge of the water for exactly one
 * of the three kinds). Everything else is fixed here so the two paths cannot
 * end up with different spawns, different error channels, or — the one that
 * would actually be silent — one of them missing `onWrite` and never showing a
 * newcomer why nothing they do reaches the water.
 */
export function seaFrom(cfg: WaterConfig, onWrite: (failure: SendFailure | null) => void): ChainSea {
  return chainSea({
    auth: cfg.auth,
    spaceId: cfg.spaceId,
    roomContentId: cfg.roomContentId,
    authorIdHex: cfg.authorIdHex,
    signer: cfg.signer,
    spawn: SEA_SPAWN,
    onError: (where, err) => { console.error(`[shoal] chain sea (${where}):`, err); },
    onWrite,
  });
}
