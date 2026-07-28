/**
 * The Shoal — swim both players, one per node (plan 2c Task 7, the capture).
 *
 * `two-client-smoke.ts` is the proof. This is the thing you run while LOOKING
 * at it: it keeps two swimmers moving, `alice` writing only to node A and
 * `bob` writing only to node B, so two windows pointed at the two nodes have
 * something to show each other. It asserts nothing and is not a test — it is
 * the hand on the tiller for a screenshot.
 *
 * Run the smoke FIRST. It creates the space and the room, sponsors both
 * identities on both nodes, and prints the two windows' URLs; this script
 * assumes all of that already exists and refuses to create any of it, so a
 * capture can never quietly be of a different room than the one that was
 * proven.
 *
 *   # after `npm run smoke:two` has passed, and with `npm run dev` running
 *   SHOAL_RPC_A=http://127.0.0.1:29736 \
 *   SHOAL_COOKIE_A=/tmp/shoal-a-regtest/.cookie \
 *   SHOAL_RPC_B=http://127.0.0.1:29746 \
 *   SHOAL_COOKIE_B=/tmp/shoal-b-regtest/.cookie \
 *   SHOAL_DRIVE_MS=120000 \
 *   npm run drive:two
 *
 * ## Why a driver at all, rather than steering the windows by hand
 *
 * Because a swimmer that nobody steers never publishes, and a room with no
 * presences folds to an empty sea in BOTH windows — a capture that would look
 * like a bug and prove nothing. Driving both swimmers from outside also keeps
 * the two windows honestly symmetric: neither is privileged, and every vector
 * either one draws crossed the same path as the smoke's, mine → sign → submit
 * → gossip → mempool → `get_replies`.
 *
 * ## The cadence is `shouldEmit`, not a timer
 *
 * The intent is recomputed every `TICK_MS` and offered to `shouldEmit`
 * (shoalEmit.ts), which is what decides whether it reaches the wire. So this
 * script writes at exactly the rate a played client would — between
 * `MIN_EMIT_GAP_MS` and `MAX_EMIT_GAP_MS` apart — rather than at whatever rate
 * would look busiest. Anything faster would breach the node's write cap and
 * crowd the per-space mempool budget, which is the failure the whole bridge
 * exists to prevent.
 *
 * `scripts/` may read a clock and use floats (global constraint).
 */
import { readFileSync } from 'node:fs';
import { createHash, createPrivateKey, createPublicKey, sign as edSign } from 'node:crypto';

import type { RpcAuth } from '../src/lib/shoalRpc';
import { powProfileFor, sendPresence, type SendCtx, type SignFn } from '../src/lib/shoalSend';
import { shouldEmit } from '../src/lib/shoalEmit';
import { HEADING_STEPS, SPEED_CRUISE, TICK_MS, WORLD_H, WORLD_W } from '../src/lib/shoalConst';
import type { Vec } from '../src/lib/shoalTypes';

function authFrom(rpcEnv: string, cookieEnv: string): RpcAuth {
  const endpoint = (process.env[rpcEnv] ?? '').trim();
  if (!endpoint) throw new Error(`two-client-drive requires ${rpcEnv} — see this file's header`);
  const cookieFile = (process.env[cookieEnv] ?? '').trim();
  return {
    endpoint,
    authHeader: cookieFile
      ? `Basic ${Buffer.from(`__cookie__:${readFileSync(cookieFile, 'utf8').trim()}`, 'utf8').toString('base64')}`
      : null,
  };
}

/** Byte for byte the derivation `two-client-smoke.ts` and `browserIdentity.ts`
 *  use, so all three agree on who `alice` and `bob` are. */
function player(label: string): { publicKeyHex: string; sign: SignFn } {
  const seed = createHash('sha256').update(`shoal-two:${label}`).digest();
  const der = Buffer.concat([Buffer.from('302e020100300506032b657004220420', 'hex'), seed]);
  const priv = createPrivateKey({ key: der, format: 'der', type: 'pkcs8' });
  const spki = createPublicKey(priv).export({ format: 'der', type: 'spki' });
  return {
    publicKeyHex: spki.subarray(spki.length - 32).toString('hex'),
    sign: async (msg: Uint8Array): Promise<Uint8Array> => new Uint8Array(edSign(null, Buffer.from(msg), priv)),
  };
}

const SPACE_ID = (process.env.SHOAL_SPACE ?? '').trim();
const ROOM_ID = (process.env.SHOAL_ROOM ?? '').trim();

/**
 * The two swimmers circle a shared centre in opposite directions, at
 * different radii — so from either window they visibly pass each other rather
 * than sitting on two static dots.
 *
 * The radii are small (200 and 300 cu, in a 4096-cu world) for one reason: the
 * camera follows the window's OWN swimmer, so anything much further apart than
 * this leaves each window showing one fish alone in open water. A capture of
 * two windows that each show one fish proves nothing about them sharing a sea.
 * Measured at 420/620 first, which looked right in a maximised window and put
 * the other swimmer off-screen in a half-width one.
 */
interface Swimmer {
  readonly label: string;
  readonly ctx: SendCtx;
  readonly centre: { x: number; y: number };
  readonly radius: number;
  readonly rate: number;
  readonly phase: number;
  last: Vec | null;
  lastEmitMs: number;
  writes: number;
}

function intentAt(s: Swimmer, atMs: number): Vec {
  const a = s.phase + (atMs / 1000) * s.rate;
  const x = Math.round(s.centre.x + Math.cos(a) * s.radius);
  const y = Math.round(s.centre.y + Math.sin(a) * s.radius);
  // Tangent to the circle, in brads.
  const tangent = a + (s.rate > 0 ? Math.PI / 2 : -Math.PI / 2);
  const heading = ((Math.round((tangent / (Math.PI * 2)) * HEADING_STEPS) % HEADING_STEPS) + HEADING_STEPS)
    % HEADING_STEPS;
  return {
    x: Math.max(60, Math.min(WORLD_W - 60, x)),
    y: Math.max(60, Math.min(WORLD_H - 60, y)),
    heading,
    speed: SPEED_CRUISE,
    t: atMs,
  };
}

const WORDS = ['hello', 'over here', 'still swimming', 'two nodes', 'one sea'];

async function main(): Promise<void> {
  if (!SPACE_ID || !ROOM_ID) {
    throw new Error('two-client-drive requires SHOAL_SPACE and SHOAL_ROOM — take them from '
      + 'the URLs `npm run smoke:two` prints, so the capture is provably of the room the smoke proved');
  }
  const authA = authFrom('SHOAL_RPC_A', 'SHOAL_COOKIE_A');
  const authB = authFrom('SHOAL_RPC_B', 'SHOAL_COOKIE_B');
  const alice = player('alice');
  const bob = player('bob');
  const centre = { x: Math.round(WORLD_W / 2), y: Math.round(WORLD_H / 2) };

  const swimmers: Swimmer[] = [
    {
      label: 'alice@A',
      ctx: {
        auth: authA, spaceId: SPACE_ID, roomContentId: ROOM_ID,
        authorIdHex: alice.publicKeyHex, sign: alice.sign, powProfile: await powProfileFor(authA),
      },
      centre, radius: 200, rate: 0.22, phase: 0, last: null, lastEmitMs: 0, writes: 0,
    },
    {
      label: 'bob@B',
      ctx: {
        auth: authB, spaceId: SPACE_ID, roomContentId: ROOM_ID,
        authorIdHex: bob.publicKeyHex, sign: bob.sign, powProfile: await powProfileFor(authB),
      },
      centre, radius: 300, rate: -0.16, phase: Math.PI, last: null, lastEmitMs: 0, writes: 0,
    },
  ];

  const durationMs = Number(process.env.SHOAL_DRIVE_MS ?? 120_000);
  const until = Date.now() + durationMs;
  console.log(`[drive] swimming ${swimmers.map((s) => s.label).join(' and ')} for ${durationMs / 1000}s`);
  console.log(`[drive] room ${ROOM_ID} in space ${SPACE_ID}`);

  while (Date.now() < until) {
    // Authored one tick ahead of the wall clock, exactly like App.tsx's frame
    // loop: an entry at or behind the last folded tick sends every reader's
    // `advance` down its bounded-replay path.
    const authorMs = Date.now() + TICK_MS;
    for (const s of swimmers) {
      const intent = intentAt(s, authorMs);
      if (!shouldEmit(s.last, intent, s.lastEmitMs)) continue;
      const say = s.writes % 5 === 0 ? WORDS[(s.writes / 5) % WORDS.length] : undefined;
      try {
        await sendPresence(s.ctx, intent, say);
        s.last = intent;
        s.lastEmitMs = intent.t;
        s.writes++;
        console.log(`[drive] ${s.label} -> (${intent.x},${intent.y}) h=${intent.heading}`
          + `${say ? ` "${say}"` : ''}`);
      } catch (e) {
        console.error(`[drive] ${s.label} write failed:`, e instanceof Error ? e.message : e);
      }
    }
    await new Promise<void>((r) => { setTimeout(r, TICK_MS); });
  }
  console.log(`[drive] done — ${swimmers.map((s) => `${s.label}: ${s.writes} writes`).join(', ')}`);
}

main().catch((err) => {
  console.error('[drive] FATAL:', err instanceof Error ? (err.stack ?? err.message) : err);
  process.exitCode = 1;
});
