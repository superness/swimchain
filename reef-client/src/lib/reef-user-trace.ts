/** Trace one author's recent reef moves: fold outcome + the body's #<seq>~ field
 *  (ms = new client, small int = old client) + block height. Read-only.
 *  RPC_URL=… RPC_COOKIE=… REGION=… USER=<pubkeyhexprefix> npx tsx src/lib/reef-user-trace.ts */
import { foldReef, type ReefHeader, type ReplyLike } from './reefEngine';

const RPC = process.env.RPC_URL || 'http://127.0.0.1:19746';
const COOKIE = process.env.RPC_COOKIE || '';
const REGION = process.env.REGION || 'sha256:362a7acd266d33342f00037b4de277f69e5c08e34b8c88518dd95fb2067e92a7';
const USER = (process.env.USER_PREFIX || 'f9caefe91a').toLowerCase();
const AUTH = 'Basic ' + Buffer.from(`__cookie__:${COOKIE}`).toString('base64');

let id = 0;
async function rpc(m: string, p: unknown) {
  const r = await fetch(RPC, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: AUTH }, body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method: m, params: p }) });
  const j = await r.json();
  if (j.error) throw new Error(`${m}: ${j.error.message}`);
  return j.result;
}
const seqField = (body: string) => { const x = /#(\d+)~/.exec(body || ''); return x ? x[1] : '(none)'; };

const main = async () => {
  const post = await rpc('get_content', { content_id: REGION });
  const hb = (post.body ?? '') as string; const brace = hb.indexOf('{');
  let header: ReefHeader = { v: 1, kind: 'reef', founder: '', w: 12, h: 12, created: 0 };
  try { if (brace >= 0) header = JSON.parse(hb.slice(brace)); } catch { /* default */ }
  const { replies } = await rpc('get_replies', { content_id: REGION });
  const info = await rpc('get_info', {}).catch(() => ({} as any));
  const tip = typeof info.block_height === 'number' ? info.block_height : undefined;
  const byId = new Map<string, ReplyLike>();
  for (const r of replies as ReplyLike[]) byId.set(r.content_id, r);

  const state = foldReef(header, replies as ReplyLike[], tip);
  const mine = state.moves.filter((m) => m.author.toLowerCase().startsWith(USER));
  console.log(`tip=${tip} epoch=${state.epoch} · ${USER}… made ${mine.length} moves; LIVING now=${[...state.cells.values()].filter((c) => c.owner.toLowerCase().startsWith(USER)).length}`);
  console.log('last 24 of their moves (chronological by height):');
  const withH = mine.map((m) => { const r = byId.get(m.contentId); return { m, h: (r && typeof r.block_height === 'number') ? r.block_height : Infinity, seq: seqField(r?.body ?? '') }; })
    .sort((a, b) => a.h - b.h);
  for (const { m, h, seq } of withH.slice(-24)) {
    const hs = h === Infinity ? 'PEND' : `h${h}`;
    const alive = state.cells.get(`${m.x},${m.y}`)?.owner?.toLowerCase().startsWith(USER) ? 'ALIVE' : 'gone';
    console.log(`  ${hs.padEnd(6)} ${m.op} (${m.x},${m.y})  ${m.outcome.padEnd(20)} cell:${alive}  #${seq}`);
  }
  const hist: Record<string, number> = {};
  for (const m of mine) hist[m.outcome] = (hist[m.outcome] ?? 0) + 1;
  console.log('their outcome histogram:', hist);
  // Are their cells being captured by the bot / others? Count captures ON tiles they held.
  const capturesOnUser = state.moves.filter((m) => m.outcome === 'captured' && !m.author.toLowerCase().startsWith(USER));
  console.log(`captures by others (any tile): ${capturesOnUser.length}`);
};
main().catch((e) => { console.error(e); process.exit(1); });
