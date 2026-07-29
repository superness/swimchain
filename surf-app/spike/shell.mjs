// shell.mjs — the set: power, flip, mount/evict, OSD, SIGNAL LOST.
import { Deck } from './deck.mjs';
import { buildConfigMessage, watchReadiness } from './handover.mjs';
import { createStatic } from './static-shader.mjs';
import { createFlipTimer, attachFrameProbes, createHud, exportResults } from './measure.mjs';

const cfg = await (await fetch('/spike-config.json')).json();
const byId = new Map(cfg.channels.map((c) => [c.id, c]));
const deck = new Deck(cfg.channels.map((c) => c.id), cfg.warmSize);

const deckEl = document.getElementById('deck');
const staticCtl = createStatic(document.getElementById('static'));
const timer = createFlipTimer();
const hud = createHud(document.getElementById('hud'), timer);

const frames = new Map();  // id -> iframe
const painted = new Set(); // ids whose first paint actually landed (gate READY)
let z = 1;                 // monotonic; the current channel is raised on lock
let gate = null;           // readiness gate of the in-flight tune
let powered = false;
let lastFlipAt = 0;        // input throttle

const rpcConfig = buildConfigMessage({
  rpcEndpoint: `${location.origin}/rpc`,
  rpcAuth: cfg.rpcAuth,
  nodeAddress: cfg.nodeAddress,
});

function mount(id) {
  const f = document.createElement('iframe');
  f.className = 'channel';
  f.setAttribute('allow', ''); // no camera/mic/geo (spec §2.2)
  f.src = `/channels/${id}/`;
  // Clients register their message listener in module scripts, which run
  // before `load` fires — so posting on load is never too early.
  f.addEventListener('load', () => {
    f.contentWindow.postMessage(rpcConfig, location.origin); // exact origin, never '*'
    attachFrameProbes(id, f, hud.sink);
    // Shell keys must survive focus moving into a channel: key events go to
    // the focused document, so register on each frame's window too
    // (same-origin makes this legal — attachFrameProbes already relies on it).
    try { f.contentWindow.addEventListener('keydown', onKey); } catch { /* frame gone */ }
  });
  deckEl.appendChild(f);
  frames.set(id, f);
  return f;
}

function unmount(id) { // plain DOM removal — works even if the frame is wedged (spec §6)
  frames.get(id)?.remove();
  frames.delete(id);
  painted.delete(id);
  hud.sink.dropChannel(id);
}

function advisory(id, type) {
  frames.get(id)?.contentWindow?.postMessage({ type }, location.origin);
}

// Tune `target` (already applied to the deck): static up, mount if cold,
// settle via the readiness gate. Every path out of here hides the static
// only at READY, or lands on SIGNAL LOST — never a blank frame.
// Flip kind is PAINT state, not deck state: a mount whose gate was cancelled
// by flip-away is still cold on the return flip (deck says warm, but #root
// may be unpainted — classifying it warm would poison G3's warm median).
// kindOverride='power' keeps power-on reveals out of the warm/cold buckets.
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
      frame.style.zIndex = ++z;      // occlude the others; do NOT hide them
      staticCtl.hide();              // seam rule: static persists exactly until READY
      if (from && from !== target) advisory(from, 'SWIMCHAIN_CHANNEL_HIDDEN');
      advisory(target, 'SWIMCHAIN_CHANNEL_VISIBLE');
      showOsd(byId.get(target), rec);
    },
    onTimeout: () => {
      timer.abort();
      staticCtl.hide();
      showSignalLost(byId.get(target));
    },
  });
}

function flip(dir) {
  if (!powered) return;
  const now = performance.now();
  if (now - lastFlipAt < 250) return; // input throttle, not a seam timer
  lastFlipAt = now;
  const from = deck.current;
  gate?.cancel(); // flip-away during a cold mount
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

document.getElementById('retune').addEventListener('click', () => {
  gate?.cancel(); // a second RETUNE tap must not leave the first gate's peek/timeout live
  const id = deck.current;
  unmount(id); // fresh mount on retune
  settle(id, { mounted: [id], evicted: [] }, null);
});

// --- power (spec §3.1 / §3.7) ---
function powerOn() {
  powered = true;
  document.getElementById('off-screen').hidden = true;
  const bloom = document.getElementById('bloom');
  bloom.hidden = false;
  bloom.classList.remove('blooming'); void bloom.offsetWidth; bloom.classList.add('blooming');
  setTimeout(() => { bloom.hidden = true; }, 750);
  staticCtl.start();
  const target = deck.current ?? cfg.channels[0].id;
  const r = deck.tune(target);
  settle(target, r, null, 'power'); // power-on reveal: excluded from G3's warm/cold stats
}

function powerOff() {
  powered = false;
  gate?.cancel();
  staticCtl.stop();
  const off = document.getElementById('off-screen');
  off.hidden = false;
  off.classList.remove('collapsing'); void off.offsetWidth; off.classList.add('collapsing');
  // Frames stay mounted: the node keeps running. "Still broadcasting." is true.
}

// --- input ---
// One named handler, registered on the shell window AND (in mount()) on every
// frame's window — key events dispatch to the focused document, and the shell
// is fully covered by iframes, so window-only registration goes dead after
// the first click inside a channel.
function onKey(e) {
  const t = e.target;
  if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return; // don't steal typing
  if (e.key === 'ArrowDown') flip(+1);
  else if (e.key === 'ArrowUp') flip(-1);
  else if (e.key === 'p') (powered ? powerOff : powerOn)();
  else if (e.key === 'm') hud.toggle();
  else if (e.key === 'r') hud.drift.reset();
  else if (e.key === 'e') exportResults(timer, hud);
}
window.addEventListener('keydown', onKey);
document.getElementById('export-btn').addEventListener('click', () => exportResults(timer, hud));

const strip = document.getElementById('flip-strip');
let touchY = null;
strip.addEventListener('touchstart', (e) => { touchY = e.touches[0].clientY; }, { passive: true });
strip.addEventListener('touchend', (e) => {
  if (touchY == null) return;
  const dy = e.changedTouches[0].clientY - touchY;
  touchY = null;
  if (Math.abs(dy) > 60) flip(dy < 0 ? +1 : -1); // swipe up = next (descend the dial)
});
strip.addEventListener('wheel', (e) => { e.preventDefault(); flip(e.deltaY > 0 ? +1 : -1); }, { passive: false });

document.getElementById('off-screen').addEventListener('click', () => { if (!powered) powerOn(); });
document.getElementById('hud-toggle').addEventListener('click', () => hud.toggle());

powerOn();
