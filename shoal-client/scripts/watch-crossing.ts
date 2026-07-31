/**
 * WATCH A ROOM BOUNDARY FROM OUTSIDE THE CLIENT — plan 4d, Task 3.
 *
 * Task 3 asks whether a SHIPPED build crosses an hour without the player
 * noticing. Half of that is a screenshot; the other half is not visible on
 * screen at all, because the whole point of the rotation is that it does not
 * show. This script is that other half: it stands beside a running client,
 * reads the same node the client is writing to, and asks the chain what the
 * client actually did.
 *
 * It reads only. It mints nothing, writes nothing, and holds no identity — so
 * running it can never be what makes the crossing work.
 *
 * ## WHY IT DERIVES THE ROOMS ITSELF
 *
 * It calls `waterNamed(name)` and `roomIdIn(water, epoch)` — the SAME two
 * functions the shipped client calls, through the same `Water` binding. If the
 * shipped build derived a different room from the one this script derives, the
 * rows below would simply be empty, which is exactly the "calm, empty, entirely
 * healthy sea" failure mode Task 1's pinned literals exist to make detectable.
 * So a non-empty room here is itself evidence: two independent processes agreed
 * on a consensus value.
 *
 * ## WHAT EACH LINE MEANS
 *
 *   <hh:mm:ss>  E-1 <id8> n=<entries> cp=<checkpoints> ids=<distinct swimmers>
 *               span=<first..last authoring instant> misplaced=<n>
 *
 * `misplaced` is the check that matters: it counts entries in room *R* whose
 * authoring instant `ms` does NOT satisfy `epochOf(ms) === R`. Task 2's whole
 * union proof rests on `room(E) = { e : epochOf(e.ms) = E }`; a non-zero
 * `misplaced` falsifies it against a live node.
 *
 * ## USAGE
 *
 *   SHOAL_APPDIR="$APPDATA/the-shoal/node" \
 *   SHOAL_WATCH_WATER=main SHOAL_WATCH_S=300 \
 *     npx tsx scripts/watch-crossing.ts
 *
 * `SHOAL_APPDIR` is the node data directory the shell started (the one whose
 * `.rpc_addr`/`.cookie` handoff files `get_rpc_config` reads). Defaults to the
 * installed shell's mainnet directory.
 */
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { epochOf, epochStartMs } from '../src/lib/epoch';
import type { RpcAuth } from '../src/lib/shoalRpc';
import { fetchRoom } from '../src/lib/shoalRoom';
import { roomIdIn, waterNamed, type Water } from '../src/lib/water';

const DEFAULT_APPDIR = join(
  process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming'),
  'the-shoal',
  'node',
);

function authFromDataDir(dir: string): RpcAuth {
  const addr = readFileSync(join(dir, '.rpc_addr'), 'utf8').trim();
  const cookie = readFileSync(join(dir, '.cookie'), 'utf8').trim();
  const endpoint = addr.startsWith('http') ? addr : `http://${addr}`;
  const token = Buffer.from(`__cookie__:${cookie}`).toString('base64');
  return { endpoint, authHeader: `Basic ${token}` };
}

function hhmmss(ms: number): string {
  return new Date(ms).toISOString().slice(11, 19);
}

interface RoomRow {
  epoch: number;
  id: string;
  entries: number;
  checkpoints: number;
  ids: string[];
  where: string[];
  firstMs: number | null;
  lastMs: number | null;
  misplaced: number;
}

async function readRoom(auth: RpcAuth, water: Water, epoch: number): Promise<RoomRow> {
  const id = await roomIdIn(water, epoch);
  const { log, checkpoints } = await fetchRoom(auth, water.spaceId, id);
  const where = new Map<string, string>();
  for (const e of log) {
    if (e.kind === 'presence') where.set(e.id, `${e.id.slice(0, 6)}@${e.vec.x},${e.vec.y}`);
  }
  const ids = [...new Set(log.map((e) => e.id))].sort();
  const times = log.map((e) => e.ms).sort((a, b) => a - b);
  return {
    epoch,
    id,
    entries: log.length,
    checkpoints: checkpoints.length,
    ids,
    where: [...where.values()],
    firstMs: times.length > 0 ? times[0]! : null,
    lastMs: times.length > 0 ? times[times.length - 1]! : null,
    misplaced: log.filter((e) => epochOf(e.ms) !== epoch).length,
  };
}

async function main(): Promise<void> {
  const dir = (process.env.SHOAL_APPDIR ?? DEFAULT_APPDIR).trim();
  const name = (process.env.SHOAL_WATCH_WATER ?? 'main').trim();
  const seconds = Number(process.env.SHOAL_WATCH_S ?? 300);
  const every = Number(process.env.SHOAL_WATCH_EVERY_MS ?? 5_000);

  const auth = authFromDataDir(dir);
  const water = await waterNamed(name);
  console.log(`[watch] node ${auth.endpoint} (from ${dir})`);
  console.log(`[watch] water ${water.spaceName} -> space ${water.spaceId}`);

  for (const e of [epochOf(Date.now()) - 1, epochOf(Date.now()), epochOf(Date.now()) + 1]) {
    console.log(`[watch] room ${e} = ${await roomIdIn(water, e)}`);
  }

  const endAt = Date.now() + seconds * 1_000;
  while (Date.now() < endAt) {
    const now = Date.now();
    const here = epochOf(now);
    const rows: RoomRow[] = [];
    for (const e of [here - 1, here, here + 1]) {
      try {
        rows.push(await readRoom(auth, water, e));
      } catch (err) {
        console.log(`  E${e - here === 0 ? '' : e - here} FETCH FAILED: ${String(err)}`);
      }
    }
    const label = `${hhmmss(now)}Z e=${here} (+${Math.round((now - epochStartMs(here)) / 1000)}s)`;
    console.log(label);
    for (const r of rows) {
      const rel = r.epoch - here === 0 ? 'E  ' : r.epoch - here === -1 ? 'E-1' : 'E+1';
      const span = r.firstMs === null ? '—' : `${hhmmss(r.firstMs)}..${hhmmss(r.lastMs!)}`;
      console.log(
        `  ${rel} ${r.id.replace(/^sha256:/, '').slice(0, 12)} n=${String(r.entries).padStart(5)} cp=${r.checkpoints}`
        + ` ids=${r.ids.length} span=${span} misplaced=${r.misplaced}`
        + (r.where.length > 0 ? ` [${r.where.join(' ')}]` : ''),
      );
    }
    const wait = every - (Date.now() - now);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
