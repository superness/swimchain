// Surf A1 shell: the set, inside Tauri. Differences from the A0 spike shell:
// config comes from Tauri commands; power-on includes the section-3.1
// first-signal acquisition (driver first, items-based lock, persisted);
// external opens relay through Rust https-only (D8); power-off leaves the
// node running — the foreground service holds it, so "Still broadcasting."
// is literally true. Last channel restores across renderer death (section 6).
import { Deck } from './deck.mjs';
import { buildConfigMessage, watchReadiness } from './handover.mjs';
import { createStatic } from './static-shader.mjs';
import { createFlipTimer, attachFrameProbes, createHud, exportResults } from './measure.mjs';

if (!window.__TAURI__) {
  document.body.innerHTML = '<pre style="color:#f66;padding:2em">not inside the set (no Tauri runtime)</pre>';
  throw new Error('surf shell requires the Tauri runtime');
}
const invoke = window.__TAURI__.core.invoke;
const cfg = await (await fetch('/channels.json')).json();
const byId = new Map(cfg.channels.map((c) => [c.id, c]));
const deck = new Deck(cfg.channels.map((c) => c.id), cfg.warmSize);

// --- RPC plumbing (D1: no proxy; direct loopback fetch with cookie auth) ---
const rpcEndpoint = await invoke('get_rpc_endpoint');
let rpcAuth = null;
let myPk = null; // node identity pubkey hex; follow_space requires it as `user`
async function rpc(method, params = {}) {
  if (!rpcAuth) throw new Error('rpc not ready');
  const res = await fetch(rpcEndpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: rpcAuth },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  const json = await res.json();
  if (json.error) throw new Error(json.error.message ?? 'rpc error');
  return json.result;
}

const deckEl = document.getElementById('deck');
const staticCtl = createStatic(document.getElementById('static'), { rpc: (m, p) => rpc(m, p) });
const timer = createFlipTimer();
const hud = createHud(document.getElementById('hud'), timer);

const frames = new Map();
const painted = new Set();
let z = 1;
let gate = null;
let powered = false;
let lastFlipAt = 0;
let rpcConfig = null;

const LAST_CHANNEL_KEY = 'surf.lastChannel';
const ACQUIRED_KEY = 'surf.acquired';
let acquired = localStorage.getItem(ACQUIRED_KEY) === '1';

function mount(id) {
  const f = document.createElement('iframe');
  f.className = 'channel';
  f.setAttribute('allow', '');
  f.src = `/channels/${id}/`;
  f.addEventListener('load', () => {
    if (rpcConfig) f.contentWindow.postMessage(rpcConfig, location.origin);
    attachFrameProbes(id, f, hud.sink);
    try { f.contentWindow.addEventListener('keydown', onKey); } catch { /* gone */ }
  });
  deckEl.appendChild(f);
  frames.set(id, f);
  return f;
}

function unmount(id) {
  frames.get(id)?.remove();
  frames.delete(id);
  painted.delete(id);
  hud.sink.dropChannel(id);
}

function advisory(id, type) {
  frames.get(id)?.contentWindow?.postMessage({ type }, location.origin);
}

// Section 2.3: the tuner is the driver. Best-effort; a channel with no
// declared spaces, or a receive-only identity, just plays (section 2.5).
//
// Discovery evidence (see task-3-report.md for the full record):
//   follow_space:        { user: <32-byte hex pubkey>, space_id: <sp1... or hex> }
//                         feed-client/src/hooks/useFeedPreferences.ts:70;
//                         src/rpc/methods.rs:11519 (parse_user_pk + space_id)
//   list_space_content:  { space_id, limit, offset?, sort? } -> { items: [...], total }
//                         feed-client/src/lib/rpc.ts:521-531 (listSpaceContent);
//                         src/rpc/types.rs:552-567 (ListSpaceContentParams)
//   request_content:     { content_id: "sha256:<hex>" } (prefix optional server-side)
//                         feed-client/src/lib/rpc.ts:550-552; src/rpc/methods.rs:11433-11442
async function tuneDriver(id) {
  const ch = byId.get(id);
  if (!myPk || !(ch.spaces ?? []).length) return;
  for (const space of ch.spaces) {
    try {
      await rpc('follow_space', { user: myPk, space_id: space });
    } catch { /* policy call; receive-only is fine */ }
  }
  try {
    const recent = await rpc('list_space_content', { space_id: ch.spaces[0], limit: 5 });
    for (const item of recent?.items ?? []) {
      rpc('request_content', { content_id: item.content_id }).catch(() => {});
    }
  } catch { /* nothing listable yet — acquisition poll keeps watching */ }
}

// Same listing verb as tuneDriver; returns how many items are locally
// retrievable for the bootstrap spaces right now (result shape: { items, total }).
async function localItemCount(spaces) {
  let n = 0;
  for (const space of spaces) {
    try { n += ((await rpc('list_space_content', { space_id: space, limit: 5 }))?.items ?? []).length; }
    catch { /* keep counting others */ }
  }
  return n;
}

function settle(target, tuneResult, from, kindOverride = null) {
  const cold = tuneResult.mounted.includes(target) || !painted.has(target);
  timer.start(target, kindOverride ?? (cold ? 'cold' : 'warm'));
  staticCtl.show();
  document.getElementById('signal-lost').hidden = true;
  for (const id of tuneResult.evicted) unmount(id);
  const frame = frames.get(target) ?? mount(target);
  gate = watchReadiness(frame, {
    timeoutMs: 2000,
    onReady: (via) => {
      const rec = timer.end(via);
      painted.add(target);
      frame.style.zIndex = ++z;
      staticCtl.hide();
      document.getElementById('acquire').hidden = true;
      if (from && from !== target) advisory(from, 'SWIMCHAIN_CHANNEL_HIDDEN');
      advisory(target, 'SWIMCHAIN_CHANNEL_VISIBLE');
      showOsd(byId.get(target), rec);
      localStorage.setItem(LAST_CHANNEL_KEY, target);
      tuneDriver(target);
    },
    onTimeout: () => {
      timer.abort();
      hud.signalLost(target);
      staticCtl.hide();
      showSignalLost(byId.get(target));
    },
  });
}

function flip(dir) {
  if (!powered || !acquired) return; // the dial exists once there is signal
  const now = performance.now();
  if (now - lastFlipAt < 250) return;
  lastFlipAt = now;
  const from = deck.current;
  gate?.cancel();
  const r = dir > 0 ? deck.next() : deck.prev();
  settle(r.current, r, from);
}

function showOsd(ch, rec) {
  const osd = document.getElementById('osd');
  osd.textContent = `CH ${ch.number} ${ch.name}`;
  osd.classList.remove('burn'); void osd.offsetWidth; osd.classList.add('burn');
  if (rec) hud.note(`flip ${rec.kind} ${Math.round(rec.ms)}ms via ${rec.via}`);
}

function showSignalLost(ch) {
  const el = document.getElementById('signal-lost');
  el.querySelector('.sl-name').textContent = `CH ${ch.number} ${ch.name}`;
  el.hidden = false;
}

function showNodeDead(msg) {
  staticCtl.start();
  staticCtl.show();
  const el = document.getElementById('node-dead');
  el.hidden = false;
  document.getElementById('node-error').textContent = msg;
}
document.getElementById('node-details').addEventListener('click', () => {
  const pre = document.getElementById('node-error');
  pre.hidden = !pre.hidden;
});

document.getElementById('retune').addEventListener('click', () => {
  gate?.cancel();
  const id = deck.current;
  unmount(id);
  document.getElementById('signal-lost').hidden = true;
  settle(id, { mounted: [id], evicted: [] }, null);
});

// --- D8 shell half: external opens relayed from the CURRENT channel only ---
// Baked channels post open requests with targetOrigin '*' (feed MainLayout:
// SWIMCHAIN_OPEN_EXTERNAL; linkify: SWIMCHAIN_OPEN_URL). Accept only from the
// current channel's own frame, exact-origin, while powered; Rust re-validates
// https-only. Everything else drops silently (spec section 2.2 inbound rule).
window.addEventListener('message', (e) => {
  const t = e.data?.type;
  if (t !== 'SWIMCHAIN_OPEN_EXTERNAL' && t !== 'SWIMCHAIN_OPEN_URL') return;
  if (!powered || typeof e.data?.url !== 'string') return;
  const cur = frames.get(deck.current);
  if (!cur || e.source !== cur.contentWindow || e.origin !== location.origin) return;
  invoke('open_external', { url: e.data.url }).catch((err) => hud.note(`open refused: ${err}`));
});

// --- power (sections 3.1 / 3.7) ---
function powerOn() {
  powered = true;
  document.getElementById('off-screen').hidden = true;
  const bloom = document.getElementById('bloom');
  bloom.hidden = false;
  bloom.classList.remove('blooming'); void bloom.offsetWidth; bloom.classList.add('blooming');
  setTimeout(() => { bloom.hidden = true; }, 750);
  staticCtl.start();
  if (!acquired) { acquisitionBoot(); return; }
  const stored = localStorage.getItem(LAST_CHANNEL_KEY);
  const target = deck.current ?? (byId.has(stored) ? stored : cfg.channels[0].id);
  const r = deck.tune(target);
  settle(target, r, null, 'power');
}

function powerOff() {
  powered = false;
  gate?.cancel();
  staticCtl.stop();
  const off = document.getElementById('off-screen');
  off.hidden = false;
  off.classList.remove('collapsing'); void off.offsetWidth; off.classList.add('collapsing');
}

// --- section 3.1: first-signal acquisition (runs once, then persisted) ---
async function acquisitionBoot() {
  staticCtl.show();
  document.getElementById('acquire').hidden = false;
  try {
    await rpcReady; // rpcAuth + myPk + rpcConfig (boot section below)
    const feed = cfg.channels[0].id;
    deck.tune(feed);
    mount(feed); // paints its own loading UI behind the static; NOT revealed
    await tuneDriver(feed); // driver FIRST: follows + request_content
    const N = 3;
    await new Promise((resolve) => {
      const wait = setInterval(async () => {
        try {
          if ((await localItemCount(byId.get(feed).spaces)) >= N) { clearInterval(wait); resolve(); }
          else tuneDriver(feed); // keep nudging request_content as sync progresses
        } catch { /* node still syncing */ }
      }, 2000);
    });
    acquired = true;
    localStorage.setItem(ACQUIRED_KEY, '1');
    // The feed's prefs sync and first load ran before the follows existed —
    // reload it so this session sees them, then reveal through the normal gate.
    unmount(feed);
    settle(feed, { mounted: [feed], evicted: [] }, null, 'power');
  } catch (e) {
    const status = await invoke('node_status').catch(() => null);
    showNodeDead(String(status?.error ?? e));
  }
}

// --- input (spike model: strip + keys; D5). Long-press strip = power (touch). ---
function onKey(e) {
  const t = e.target;
  if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
  if (e.key === 'ArrowDown') flip(+1);
  else if (e.key === 'ArrowUp') flip(-1);
  else if (e.key === 'p') (powered ? powerOff : powerOn)();
  else if (e.key === 'm') hud.toggle();
  else if (e.key === 'r') hud.drift.reset();
  else if (e.key === 'e') exportResults(timer, hud);
}
window.addEventListener('keydown', onKey);
document.getElementById('export-btn').addEventListener('click', () => exportResults(timer, hud));
document.getElementById('hud-toggle').addEventListener('click', () => hud.toggle());
document.getElementById('off-screen').addEventListener('click', () => { if (!powered) powerOn(); });

const strip = document.getElementById('flip-strip');
let touchY = null;
let pressTimer = null;
strip.addEventListener('touchstart', (e) => {
  touchY = e.touches[0].clientY;
  pressTimer = setTimeout(() => { pressTimer = null; (powered ? powerOff : powerOn)(); touchY = null; }, 800);
}, { passive: true });
strip.addEventListener('touchmove', () => { clearTimeout(pressTimer); pressTimer = null; }, { passive: true });
strip.addEventListener('touchend', (e) => {
  clearTimeout(pressTimer);
  if (pressTimer === null && touchY == null) return; // long-press already fired
  pressTimer = null;
  if (touchY == null) return;
  const dy = e.changedTouches[0].clientY - touchY;
  touchY = null;
  if (Math.abs(dy) > 60) flip(dy < 0 ? +1 : -1);
});
strip.addEventListener('wheel', (e) => { e.preventDefault(); flip(e.deltaY > 0 ? +1 : -1); }, { passive: false });

// --- boot: static immediately; node plumbing resolves behind it ---
const rpcReady = (async () => {
  rpcAuth = await invoke('get_rpc_auth'); // blocks until THIS run's node is up, or errors
  myPk = (await rpc('get_identity_info')).public_key; // confirmed: src/rpc/methods.rs:8487
  rpcConfig = buildConfigMessage({
    rpcEndpoint,
    rpcAuth,
    nodeAddress: (await invoke('get_node_address')) ?? undefined,
  });
  for (const [, f] of frames) {
    try { f.contentWindow?.postMessage(rpcConfig, location.origin); } catch { /* not loaded */ }
  }
})();
// Node-dead is detected by status, not inferred from cookie timing: bind
// failures write the cookie BEFORE failing, so cookie success can mask a
// dead node. Poll until acquired; stop on first error shown.
const statusPoll = setInterval(async () => {
  const s = await invoke('node_status').catch(() => null);
  if (s?.error) { clearInterval(statusPoll); showNodeDead(s.error); }
  else if (acquired) clearInterval(statusPoll);
}, 1000);

powerOn();
rpcReady.catch(async (e) => {
  const status = await invoke('node_status').catch(() => null);
  showNodeDead(String(status?.error ?? e));
});
