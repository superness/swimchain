/**
 * Live diagnostic: fetch the real region replies + chain tip, fold them with the
 * PRODUCTION engine, and print exactly what the client sees — the outcome of
 * every move, final living cells, and the bot's fate. Read-only.
 *
 *   RPC_URL=... RPC_COOKIE=... REGION=... npx tsx src/lib/reef-live-diag.ts
 */
import { foldReef, BLOCKS_PER_EPOCH, MAX_VITALITY, type ReefHeader, type ReplyLike } from './reefEngine';

const RPC = process.env.RPC_URL || 'http://127.0.0.1:19746';
const COOKIE = process.env.RPC_COOKIE || '';
const REGION = process.env.REGION || 'sha256:362a7acd266d33342f00037b4de277f69e5c08e34b8c88518dd95fb2067e92a7';
const BOT = (process.env.BOT || '8abeefbfb8').slice(0, 10);
const AUTH = 'Basic ' + Buffer.from(`__cookie__:${COOKIE}`).toString('base64');

let id = 0;
async function rpc(method: string, params: unknown) {
  const res = await fetch(RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: AUTH },
    body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }),
  });
  const j = await res.json();
  if (j.error) throw new Error(`${method}: ${j.error.message}`);
  return j.result;
}

function parseHeader(body: string): ReefHeader {
  const brace = body.indexOf('{');
  if (brace >= 0) {
    try {
      const h = JSON.parse(body.slice(brace));
      if (h.kind === 'reef') return h;
    } catch { /* fall through */ }
  }
  return { v: 1, kind: 'reef', founder: '', w: 12, h: 12, created: 0 };
}

const main = async () => {
  const post = await rpc('get_content', { content_id: REGION });
  const header = parseHeader(post.body ?? '');
  const { replies } = await rpc('get_replies', { content_id: REGION, limit: 100000 });
  const info = await rpc('get_info', {}).catch(() => ({} as any));
  const tip = typeof info.block_height === 'number' ? info.block_height : undefined;

  const state = foldReef(header, replies as ReplyLike[], tip);

  console.log(`region ${REGION.slice(0, 22)}…  tip=${tip}  epoch=${state.epoch}  season=${state.season}`);
  console.log(`replies=${replies.length}  living cells=${state.cells.size}  owners=${state.owners.length}`);

  // Outcome histogram across ALL moves.
  const hist: Record<string, number> = {};
  for (const m of state.moves) hist[m.outcome] = (hist[m.outcome] ?? 0) + 1;
  console.log('\noutcome histogram (all players):');
  for (const [k, v] of Object.entries(hist).sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(22)} ${v}`);

  // The bot's fate specifically.
  const botMoves = state.moves.filter((m) => m.author.startsWith(BOT));
  const botHist: Record<string, number> = {};
  for (const m of botMoves) botHist[m.outcome] = (botHist[m.outcome] ?? 0) + 1;
  const botLiving = [...state.cells.values()].filter((c) => c.owner.startsWith(BOT)).length;
  console.log(`\nBOT ${BOT}…  submitted=${botMoves.length}  LIVING NOW=${botLiving}`);
  for (const [k, v] of Object.entries(botHist).sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(22)} ${v}`);

  // How much of the *rejected-invalid* ("not next to your reef") comes from moves
  // whose supporting cell had DECAYED by the time the move applied?
  const rejInvalid = state.moves.filter((m) => m.outcome === 'rejected-invalid').length;
  console.log(`\n"coral not next to your reef" (rejected-invalid): ${rejInvalid} moves`);

  // Living cells by owner + their vitality, to see how thin the surviving reef is.
  const byOwner = new Map<string, { cells: number; vit: number }>();
  for (const c of state.cells.values()) {
    const o = byOwner.get(c.owner) ?? { cells: 0, vit: 0 };
    o.cells++; o.vit += c.vitality;
    byOwner.set(c.owner, o);
  }
  console.log('\nliving reef by owner:');
  for (const [o, s] of [...byOwner.entries()].sort((a, b) => b[1].cells - a[1].cells))
    console.log(`  ${o.slice(0, 10)}…  ${s.cells} cells  vit=${s.vit}`);

  // Confirmed-height span vs epochs: how fast is the tide vs how long coral lives?
  const heights = (replies as ReplyLike[]).map((r) => r.block_height).filter((h): h is number => typeof h === 'number');
  if (heights.length) {
    const lo = Math.min(...heights), hi = Math.max(...heights);
    console.log(`\nconfirmed heights ${lo}..${hi} (${hi - lo} blocks) → ~${Math.floor((hi - lo) / BLOCKS_PER_EPOCH)} epochs of decay across the log`);
    console.log(`coral dies in ${MAX_VITALITY} epochs (${MAX_VITALITY * BLOCKS_PER_EPOCH} blocks) if untended; TEND_CAP=4/tide.`);
  }
};

main().catch((e) => { console.error(e); process.exit(1); });
