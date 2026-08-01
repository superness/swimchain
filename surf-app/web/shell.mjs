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
import { createDwell, ledgerMark } from './dwell.mjs';
import { mineSignSubmit } from './engage.mjs';
import { classifyChannelDeadAir, classifyAfterFlare, classifyDeadAir, freshestTs, isMetered, pickFlareTarget, flareTargetReady } from './deadair.mjs';
import { chartRows, toggleMoor, loadMoored } from './chart.mjs';
import { pickBootstrap, loadFeedSpaces, FEED_SPACES_KEY } from './bootstrap.mjs';
import { isSponsored, requestSponsorship } from './sponsorship.mjs';

if (!window.__TAURI__) {
  document.body.innerHTML = '<pre style="color:#f66;padding:2em">not inside the set (no Tauri runtime)</pre>';
  throw new Error('surf shell requires the Tauri runtime');
}
const invoke = window.__TAURI__.core.invoke;
const cfg = await (await fetch('/channels.json')).json();
const byId = new Map(cfg.channels.map((c) => [c.id, c]));
const deck = new Deck(cfg.channels.map((c) => c.id), cfg.warmSize);

// --- Task 6 (B5): health-driven bootstrap replaces A1's hardcoded-space debt.
// FEED_ID is channels.json's first channel (today: "feed") -- the only
// channel with any declared spaces at all. FALLBACK_FEED_SPACES is a VALUE
// COPY of its original channels.json spaces array, captured now, before
// anything below can mutate it -- byId.get(FEED_ID) and cfg.channels[0] are
// the SAME object (byId is built directly from cfg.channels), so
// `byId.get(FEED_ID).spaces = picked` a few lines down would silently mutate
// cfg.channels[0].spaces too were this not a snapshot; pickBootstrap's own
// empty-pick fallback must always mean "channels.json's original trio", not
// whatever the live set happened to drift to.
const FEED_ID = cfg.channels[0].id;
// `?? []` guards a malformed channels.json (feed entry missing `spaces`
// entirely) the same way every other spaces-read in this file does
// (tuneDriver, checkDeadAir's isMetered, etc.) -- a spread over `undefined`
// would throw here, at MODULE TOP LEVEL, bricking the whole shell import
// before power-on even exists (the same class of bug loadMoored/
// loadFeedSpaces are hardened against for localStorage; channels.json is
// static config, but the failure mode is identical).
const FALLBACK_FEED_SPACES = [...(cfg.channels[0].spaces ?? [])];

// Boot-time re-apply: the persisted live-picked bootstrap set (if any prior
// boot's acquisitionBoot successfully picked one) becomes the feed channel's
// spaces the INSTANT byId exists -- before ANY other code in this module
// reads byId.get(FEED_ID).spaces. This single mutation is what routes the
// live set to EVERY consumer for this session AND all later ones: tuneDriver
// (drives follow_space/list_space_content/request_content over
// byId.get(id).spaces), the acquisition lock's localItemCount
// (byId.get(feed).spaces), dwell (settle's onReady reads
// byId.get(target)?.spaces), dead-air (checkDeadAir/isMetered via `ch` =
// byId.get(target)), and the Chart (renderChart's `cfg.channels` filter --
// note cfg.channels[0] IS byId.get(FEED_ID), same object, so this mutation
// is visible there too). None of those call sites need to know
// surf.feedSpaces exists. channels.json's trio stays live here whenever
// loadFeedSpaces returns null: the key was never written (no successful pick
// yet), or the stored value degraded (corrupt/wrong-shape/empty -- see
// bootstrap.mjs's own guards, following chart.mjs's loadMoored precedent so
// a bad localStorage value can never brick this module's own load, matching
// the review fix already applied there).
const storedFeedSpaces = loadFeedSpaces(localStorage);
if (storedFeedSpaces) byId.get(FEED_ID).spaces = storedFeedSpaces;

// --- RPC plumbing (D1: no proxy; direct loopback fetch with cookie auth) ---
const rpcEndpoint = await invoke('get_rpc_endpoint');
let rpcAuth = null;
let myPk = null; // node identity pubkey hex; follow_space requires it as `user`
let myAddress = null; // bech32 node address; the D1 gate shows it to hand to a sponsor
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

// Task 3: dwell-engage's signature helper — wraps sign_message. Callers pass
// an already hex-encoded message (engage.mjs owns the UTF-8 -> hex step so
// the exact preimage it signs is visible in one place).
async function sign(messageHex) {
  const res = await rpc('sign_message', { message: messageHex });
  return res.signature;
}

const deckEl = document.getElementById('deck');
const staticCtl = createStatic(document.getElementById('static'), { rpc: (m, p) => rpc(m, p) });
const timer = createFlipTimer();
const hud = createHud(document.getElementById('hud'), timer);

// --- dwell-engage (Task 3): "watching is feeding" — B2 (policy.mjs dials) ---
// engageOne closes over the mutable `myPk`/`sign`/`rpc` bindings above by
// reference (not by value) — each call reads whatever `myPk` currently is,
// which matters because myPk isn't populated until rpcReady resolves below;
// by the time dwell ever actually fires (45s after a settle()'s onReady,
// which itself only happens post-acquisition, post-rpcReady) it's long set.
const engageOne = (contentId) => mineSignSubmit({ rpc, sign, myPk, contentId });
const dwell = createDwell({
  rpc,
  engageOne,
  store: localStorage,
  onEngaged: (contentId) => hud.note(`dwell engaged ${contentId}`),
});

// --- dead air + the flare (Task 4, B6): decayed channels are not hidden —
// you flip through them and hit a bleached SMPTE test card over the
// still-playing channel; a FLARE revives it by fetching + engaging its
// newest surviving item. deadAirState tracks the card currently on screen
// (or null). The flare shares dwell's SAME receive-only latch (Set, keyed by
// channelId, private inside createDwell) via dwell.markReceiveOnly() — a
// review fix (M-7): an earlier version kept a second, flare-local Set here,
// which left a real gap — a flare-first sponsorship rejection latched only
// the flare, so the SAME channel's dwell timer (already running underneath
// the card, since the channel keeps playing) could still fire 45s later and
// re-mine a doomed PoW, violating §2.5 "one try then silent" across the
// flare<->dwell boundary. One Set, written and read from both call sites,
// closes that gap in both directions.
let deadAirState = null; // { channelId, lastEngagementTs } while a card is up

function hideDeadAirCard() {
  document.getElementById('dead-air').hidden = true;
  deadAirState = null;
}

function showDeadAirCard(ch, classification, lastEngagementTs, beyondFlares = false) {
  deadAirState = { channelId: ch.id, lastEngagementTs };
  const el = document.getElementById('dead-air');
  el.querySelector('.da-name').textContent = `CH ${ch.number} ${ch.name}`;
  const signalLine = el.querySelector('.da-last-signal');
  const dyingLine = el.querySelector('.da-dying');
  if (beyondFlares) {
    // spec §3.3's defined fallback when the flare has nothing to fetch.
    signalLine.textContent = 'THIS CHANNEL IS BEYOND FLARES';
    dyingLine.hidden = true;
  } else if (Number.isFinite(classification.days)) {
    const n = Math.floor(classification.days);
    signalLine.textContent = `LAST SIGNAL: ${n} DAY${n === 1 ? '' : 'S'} AGO`;
    dyingLine.hidden = classification.state !== 'dying';
  } else {
    // null last_engagement_ts (days: Infinity) — known-but-never-engaged;
    // honest, not "no data" (deadair.mjs's own framing).
    signalLine.textContent = 'NO SIGNAL ON RECORD';
    dyingLine.hidden = classification.state !== 'dying';
  }
  el.hidden = false;
}

// Called from settle()'s onReady, after the channel is revealed. Best-effort
// and race-safe: if the viewer flips away while get_space_health is still in
// flight, the result is discarded (deck.current !== target) rather than
// popping a card over whatever channel is now showing.
async function checkDeadAir(target) {
  const ch = byId.get(target);
  // Unmetered guard (THE review-caught blocker): a channel with no declared
  // spaces (wiki, reef today — undriven live clients, not decayed spaces)
  // never calls get_space_health at all, and never shows a card. Passing an
  // empty space_ids array would mean "all known spaces" per Task 1's RPC
  // contract, crediting an unrelated busy space's recency to this channel.
  if (!isMetered(ch)) return;
  // Dead air is computed from what THIS node holds. A set that is still
  // syncing has the chain but not the recent post bodies, so a thriving
  // channel classifies as DYING. Caught live on a 4-minute-old set: the card
  // read "CH 2 FEED / LAST SIGNAL: 8 DAYS AGO / THIS CHANNEL IS DYING" while
  // mainnet's own social spaces had activity that same day (Bot talk 0.0d,
  // Daily Drift 1.0d). Worse, that is the FIRST thing a newly vouched-in
  // stranger sees. Never accuse a channel of dying on evidence this node has
  // not finished collecting. If the status call itself fails we fall through
  // to the old behaviour rather than silently killing dead air entirely.
  try {
    const s = await rpc('get_sync_status');
    if (s?.state && s.state !== 'synced') return;
  } catch { /* cannot tell — behave as before */ }
  let entries;
  try {
    entries = (await rpc('get_space_health', { space_ids: ch.spaces }))?.spaces ?? [];
  } catch {
    return; // best-effort; a transient RPC failure just means no card this reveal
  }
  if (deck.current !== target) return; // flipped away while this was in flight
  const classification = classifyChannelDeadAir(ch, entries, Date.now());
  if (classification) showDeadAirCard(ch, classification, freshestTs(entries));
}

// Final-review fix (IMPORTANT 1): the SEARCHING state painted on the
// dead-air card while the flare waits for a requested body to arrive.
// Deliberately does NOT touch deadAirState (channelId/lastEngagementTs stay
// exactly what checkDeadAir last set) — this only repaints the card's text;
// every later branch (poll success, poll timeout, engage failure) still
// reads deadAirState.lastEngagementTs to decide what to show next.
function showFlareSearching(ch) {
  const el = document.getElementById('dead-air');
  el.querySelector('.da-name').textContent = `CH ${ch.number} ${ch.name}`;
  el.querySelector('.da-last-signal').textContent = 'SEARCHING…';
  el.querySelector('.da-dying').hidden = true;
  el.hidden = false;
}

// Final-review fix (IMPORTANT 1): arrival-poll loop for a flare's
// request_content. Node truth (submit_engagement, verified in review):
// engaging before the body lands is silently dropped (engaged:false), so
// the flare must WAIT for the body before ever calling engageOne (spec
// §3.3, "engage it on arrival") instead of mining PoW that gets thrown
// away. Not pure — real RPC calls + a real timer; the pure "is it here now?"
// half of this is flareTargetReady (deadair.mjs), unit-tested there. Polls
// every FLARE_POLL_INTERVAL_MS up to FLARE_POLL_TIMEOUT_MS total, re-using
// the exact same list_space_content call the flare's own initial listing
// (and tuneDriver/localItemCount) already use — NOT get_content, which
// THROWS ContentNotFound on an absent body rather than returning body:null,
// which would make "still fetching" indistinguishable from "genuine RPC
// error" if used to drive a poll (see deadair.mjs's flareTargetReady doc
// comment for the full node-truth trace). Race-safe like checkDeadAir:
// bails (returns false) the instant the viewer flips away from this channel
// or a fresher card supersedes this one, same guard shape used everywhere
// else in this handler.
const FLARE_POLL_INTERVAL_MS = 1000;
const FLARE_POLL_TIMEOUT_MS = 10000;
async function pollFlareArrival(ch, targetId, channelId) {
  const deadline = Date.now() + FLARE_POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (deck.current !== channelId || !deadAirState || deadAirState.channelId !== channelId) return false; // flipped away
    let items = [];
    for (const space of ch.spaces) {
      try {
        const listed = await rpc('list_space_content', { space_id: space, limit: 5 });
        items = items.concat(listed?.items ?? []);
      } catch { /* keep going with whichever spaces answered */ }
    }
    if (flareTargetReady(items, targetId)) return true;
    await new Promise((resolve) => setTimeout(resolve, FLARE_POLL_INTERVAL_MS));
  }
  return false;
}

document.getElementById('flare-btn').addEventListener('click', async () => {
  if (!deadAirState) return;
  const { channelId } = deadAirState;
  // Guard the flare behind the same licensed/receive-only check as dwell —
  // an unsponsored identity must not re-mine a doomed PoW on every FLARE
  // press. One try then silent (§2.5): no error surface, the button just
  // does nothing on a latched channel. Same Set dwell's own fire() checks
  // (dwell.mjs's markReceiveOnly/isReceiveOnly pair) — see the comment above
  // deadAirState for why this must NOT be a separate flare-local latch.
  if (dwell.isReceiveOnly(channelId)) return;
  const btn = document.getElementById('flare-btn');
  btn.disabled = true;
  try {
    const ch = byId.get(channelId);
    let items = [];
    for (const space of ch.spaces) {
      try {
        const listed = await rpc('list_space_content', { space_id: space, limit: 5 });
        items = items.concat(listed?.items ?? []);
      } catch { /* keep going with whichever spaces answered */ }
    }
    const target = pickFlareTarget(items);
    if (deck.current !== channelId || !deadAirState || deadAirState.channelId !== channelId) return; // flipped away
    if (!target) {
      // spec §3.3's defined fallback: nothing retrievable across any of this
      // channel's spaces — the card says the channel is beyond flares.
      showDeadAirCard(ch, { state: 'dying', days: Infinity }, deadAirState.lastEngagementTs, true);
      return;
    }
    let { contentId: targetId, present } = target;
    let searched = false;
    // Final-review fix (IMPORTANT 1): only engage immediately when the
    // target is already body-present. Otherwise request_content it and WAIT
    // for the body (pollFlareArrival) before ever mining/submitting an
    // engage — see pickFlareTarget's and pollFlareArrival's doc comments for
    // the node-truth trace this closes.
    if (!present) {
      rpc('request_content', { content_id: targetId }).catch(() => {});
      showFlareSearching(ch);
      searched = true;
      present = await pollFlareArrival(ch, targetId, channelId);
      if (deck.current !== channelId || !deadAirState || deadAirState.channelId !== channelId) return; // flipped away mid-poll
      if (!present) {
        // Poll window elapsed with no body — spec §3.3's "beyond flares"
        // fallback again, and critically: do NOT mine/submit against a body
        // that still isn't here.
        showDeadAirCard(ch, { state: 'dying', days: Infinity }, deadAirState.lastEngagementTs, true);
        return;
      }
    }
    // Flare = (request_content, already fired above when it was needed) +
    // one engage via the same signing path dwell uses (engageOne, closed
    // over rpc/sign/myPk) — reached now only once the body is confirmed
    // present, either from the initial listing or from the arrival poll.
    const r = await engageOne(targetId);
    if (deck.current !== channelId || !deadAirState || deadAirState.channelId !== channelId) return; // flipped away
    if (r.ok) {
      // Not brief-required, but cheap and correct: mark dwell's own 24h
      // ledger for the just-flared item (dwell.mjs already exports
      // ledgerMark, unmodified) so dwell's next 45s cycle on this channel
      // doesn't immediately re-mine + re-submit the same content the flare
      // just landed.
      ledgerMark(localStorage, targetId, Date.now());
      // Clear OPTIMISTICALLY: the flare's own engage counts as the freshest
      // engagement the moment it's submitted (chain+mempool law) — classify
      // with lastEngagementTs = now, WITHOUT re-calling get_space_health
      // (that RPC only reflects it after block inclusion, ~1-6 min).
      const reclass = classifyAfterFlare(deadAirState.lastEngagementTs, Date.now(), true);
      hud.note(`flare revived ${channelId}`);
      if (reclass.state === 'alive') hideDeadAirCard();
      else showDeadAirCard(ch, reclass, deadAirState.lastEngagementTs); // defensive; unreachable given classifyAfterFlare(..., true)'s contract
    } else if (r.receiveOnly) {
      // Latch dwell's OWN Set (not a flare-local one) — a dwell cycle on
      // this same channel, already running underneath the still-visible
      // card, must also stop after this single rejection. Card stays up,
      // unchanged; no error surface (§2.5).
      dwell.markReceiveOnly(channelId);
    } else if (searched) {
      // non-latching failure (mining/RPC error) reached after a SEARCHING
      // repaint — restore the card to the pre-flare classification instead
      // of leaving "SEARCHING…" frozen on screen; a later FLARE press may
      // retry.
      showDeadAirCard(ch, classifyDeadAir(deadAirState.lastEngagementTs, Date.now()), deadAirState.lastEngagementTs);
    }
    // else: non-latching failure with the target already present — leave
    // the card up as-is, unchanged (original behavior); a later FLARE press
    // may retry.
  } finally {
    btn.disabled = false;
  }
});

// --- the Chart (Task 5, B3, spec §3.4): pull down from the top -> a
// vertical water column, channels at fixed band depths, glow = engagement
// recency ("brightness is truth"). Moored set persists in localStorage,
// toggled via a horizontal flick on a chart row (chart.mjs's toggleMoor, cap
// MOOR_CAP — the shell never imports MOOR_CAP itself; toggleMoor's own
// default supplies it). "Numbers persist" (brief wording) falls out for
// free: only channel ids are stored, and channels.json's number/name for
// each id never changes underneath a stored id.
//
// Review fix: loadMoored (chart.mjs) — not a raw inline JSON.parse — reads
// the persisted set. A raw `new Set(JSON.parse(localStorage.getItem(...)))`
// here would throw at MODULE TOP LEVEL on any corrupted/malformed stored
// value and brick the entire shell import (no channels mount, no power-on).
// loadMoored degrades any parse failure or wrong-shape value to an empty
// Set instead.
const MOORED_KEY = 'surf.moored';
let moored = loadMoored(localStorage, MOORED_KEY);
function persistMoored() { localStorage.setItem(MOORED_KEY, JSON.stringify([...moored])); }
let chartOpen = false;
let mooredCycleIndex = 0; // which moored buoy is highlighted in the SET strip

// Review fix 4: while a seam is up (acquisition, a cold/warm mount gate, or
// node-dead), the static must intercept input — its canvas is
// pointer-events:none by default so flips/taps pass through to whatever's
// mounted-but-unrevealed beneath it, which during acquisition is a live,
// fully-interactive feed frame the user can't see (and a link tap in it can
// clear the D8 relay's origin check and open an external browser from what
// looks like static). Toggle a class on <body> in lockstep with every
// staticCtl.show()/hide() call so index.html's `body.seam #static` rule
// applies uniformly; static-shader.mjs stays the sanctioned single-change
// module and is not touched again for this.
function seamOn() { document.body.classList.add('seam'); staticCtl.show(); }
function seamOff() { document.body.classList.remove('seam'); staticCtl.hide(); }

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
// Review fix 2: acquisitionBoot is not re-entrant — power-cycling mid-boot
// must not start a second run (orphaned frame, uncancellable stray gate).
let acquiring = false;
// Review fix 8: hoisted so showNodeDead (called from three different sites)
// can stop the acquisition poll instead of letting it keep ticking against a
// node that just proved it can't be reached.
let acquisitionPollHandle = null;

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
  // Review fix (Critical 1): drive ALL of ch.spaces, not just spaces[0] — a
  // single-space fetch left the other bootstrap spaces followed but never
  // requested, so their rows stayed body-less indefinitely.
  for (const space of ch.spaces) {
    try {
      const recent = await rpc('list_space_content', { space_id: space, limit: 5 });
      for (const item of recent?.items ?? []) {
        rpc('request_content', { content_id: item.content_id }).catch(() => {});
      }
    } catch { /* nothing listable yet for this space — acquisition poll keeps watching */ }
  }
}

// Same listing verb as tuneDriver; returns how many items are locally
// retrievable for the bootstrap spaces right now (result shape: { items, total }).
// Review fix (Critical 1): list_space_content emits a row for every
// chain-indexed content hash the instant sync reaches it, with `body: null`
// until request_content actually lands the bytes (src/rpc/methods.rs:6712-
// 6769). Counting raw rows let N=3 satisfy on metadata-only chain-sync
// output within seconds, revealing the empty feed the design law forbids.
// Only a fetched body counts as "locally retrievable".
async function localItemCount(spaces) {
  let n = 0;
  for (const space of spaces) {
    try {
      const items = (await rpc('list_space_content', { space_id: space, limit: 5 }))?.items ?? [];
      n += items.filter((i) => i.body).length;
    } catch { /* keep counting others */ }
  }
  return n;
}

function settle(target, tuneResult, from, kindOverride = null) {
  const cold = tuneResult.mounted.includes(target) || !painted.has(target);
  timer.start(target, kindOverride ?? (cold ? 'cold' : 'warm'));
  seamOn();
  document.getElementById('signal-lost').hidden = true;
  hideDeadAirCard(); // Task 4: dismissed on next flip, mirrored from signal-lost's own hide-on-settle line
  for (const id of tuneResult.evicted) unmount(id);
  const frame = frames.get(target) ?? mount(target);
  gate = watchReadiness(frame, {
    timeoutMs: 2000,
    onReady: (via) => {
      const rec = timer.end(via);
      painted.add(target);
      frame.style.zIndex = ++z;
      seamOff();
      document.getElementById('acquire').hidden = true;
      if (from && from !== target) advisory(from, 'SWIMCHAIN_CHANNEL_HIDDEN');
      advisory(target, 'SWIMCHAIN_CHANNEL_VISIBLE');
      showOsd(byId.get(target), rec);
      localStorage.setItem(LAST_CHANNEL_KEY, target);
      tuneDriver(target);
      // Task 3 (B2): dwell is re-armed ONLY here — settle's onReady is the
      // single integration point every settle() call site (power-on,
      // acquisition's own final settle, flip, retune) shares. Guard: never
      // dwell during acquisition (this callback only fires post-acquisition
      // since acquisitionBoot's own probe-mount bypasses settle() entirely),
      // never on a channel with no declared spaces (wiki/reef today — see
      // channels.json), and never once this channel has latched receive-only
      // for the session.
      const dwellSpaces = byId.get(target)?.spaces ?? [];
      if (acquired && dwellSpaces.length && !dwell.isReceiveOnly(target)) {
        dwell.tuned(target, dwellSpaces);
      }
      // Task 4 (B6): dead-air classification on every reveal — checkDeadAir
      // owns its own unmetered guard (skips the RPC entirely for wiki/reef),
      // so no extra condition needed here.
      checkDeadAir(target);
    },
    onTimeout: () => {
      timer.abort();
      hud.signalLost(target);
      seamOff();
      document.getElementById('acquire').hidden = true; // review fix 7
      showSignalLost(byId.get(target));
    },
  });
}

function flip(dir) {
  if (!powered || !acquired || !vouched) return; // the dial exists once there is signal AND someone vouched
  // Task 5 (live-discovered hardening): the vertical dial must not silently
  // change the channel underneath an open #chart drawer — keyboard/wheel
  // flip isn't a gesture the drawer's z-index occlusion protects against
  // (that only blocks #flip-strip's own touch/pointer surface), so without
  // this guard ArrowDown/wheel while the chart is open would flip the
  // hidden deck and the viewer would land somewhere unexpected on close.
  if (chartOpen) return;
  const now = performance.now();
  if (now - lastFlipAt < 250) return;
  lastFlipAt = now;
  // Task 3: dwell.untuned() must run only on flips that pass BOTH guards
  // above — deliberately placed AFTER them, not at the top of flip(). Dwell
  // is re-armed only by settle()'s onReady (see settle() above), so a
  // debounced/guarded no-op flip that still called untuned() would
  // permanently disarm dwell on the channel the viewer stays tuned to, with
  // no following settle() to re-arm it.
  dwell.untuned();
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

// Called from three sites (acquisitionBoot's catch, statusPoll, rpcReady's
// own rejection handler) — review fixes 5/6/7/8 all live here so every
// caller gets them for free instead of needing to duplicate the guards:
//   5. single guard on the card itself: only the first report writes it —
//      later calls (e.g. statusPoll firing right after rpcReady.catch)
//      don't re-stomp text or restart animations that already settled.
//   6. never (re)start the static shader while powered off — powerOff()
//      already stopped it, and a node dying in the background must not
//      silently resume the RPC-polling animation loop behind #off-screen.
//   7. the acquisition line is meaningless once the card that supersedes it
//      is up; hide it unconditionally, even on a duplicate call.
//   8. a dead node makes continued acquisition polling pointless; stop it
//      rather than keep nudging request_content at an unreachable node.
//      Chosen behavior (documented, not "auto-resume"): this does NOT
//      restart on recovery — RETUNE / a fresh power cycle is the recovery
//      path, matching the rest of the shell's stance that recovery is a
//      fresh gate, not a background retry loop.
function showNodeDead(msg) {
  if (acquisitionPollHandle) { clearInterval(acquisitionPollHandle); acquisitionPollHandle = null; }
  document.getElementById('acquire').hidden = true;
  if (powered) seamOn();
  const el = document.getElementById('node-dead');
  if (!el.hidden) return;
  el.hidden = false;
  document.getElementById('node-error').textContent = msg;
}
document.getElementById('node-details').addEventListener('click', () => {
  const pre = document.getElementById('node-error');
  pre.hidden = !pre.hidden;
});

// --- D1: the set does not transmit until a person vouches for you ----------
// Runs on EVERY power-on, before any channel work, and is deliberately NOT
// cached the way `acquired` is: a sponsorship can lapse, and a set that kept
// transmitting on a revoked one would be lying about its own standing.
//
// Surf claims ONLY unscoped offers (see sponsorship.mjs). The games claim
// space-scoped ones; that funnel gave this identity a reef-only grant and a
// chess-only grant and never an actual sponsorship.
let sponsorPoll = null;
let offerRetry = null; // declared here, not beside submitRequest: hideSponsorGate() reads it
// `vouched` gates the DIAL itself, not just the screen. An install that was
// already `acquired` under a pre-D1 build has powered && acquired both true,
// so without this the flip strip and the Chart would happily keep tuning
// channels underneath the gate overlay. "Whole set gated" has to mean the
// dial is dead, not merely covered.
let vouched = false;

function sponsorStatus(text) {
  document.getElementById('sponsor-status').textContent = text;
}

// D1: approval is INSTANT, but a set whose node has not yet synced the
// sponsor's own ancestry cannot VALIDATE the grant — the node logs
// "Sponsor <x> not found in sponsorship store" and retries until the sponsor
// chain lands (router.rs, "Stage 2: sponsorship — idempotent, retried").
// Observed live on a 10-minute-old node: approved at 19:08, still gated at
// 19:13. Saying only "waiting for a person" through that window is a lie —
// the person may already have said yes. Name the real reason.
const WAITING = 'Request sent. A person has to approve it — this set tunes itself in the moment they do.';
let claimSent = false;

async function syncTail() {
  try {
    const s = await rpc('get_sync_status');
    if (s?.state && s.state !== 'synced') {
      return ` This set is still catching up (${s.chain_percent ?? 0}%) — even once someone approves, it cannot confirm the grant until it has.`;
    }
  } catch { /* a nicety; never let it block or break the gate */ }
  return '';
}

function showSponsorGate() {
  document.getElementById('acquire').hidden = true;
  staticCtl.stop();
  document.getElementById('sponsor-addr').textContent = myAddress ?? myPk ?? '(node identity unavailable)';
  document.getElementById('sponsor-gate').hidden = false;
}

function hideSponsorGate() {
  document.getElementById('sponsor-gate').hidden = true;
  if (sponsorPoll) { clearInterval(sponsorPoll); sponsorPoll = null; }
  if (offerRetry) { clearTimeout(offerRetry); offerRetry = null; }
}

// Poll until a person approves. 8s, not 1s: the claim has to gossip to the
// sponsor's node, be approved by hand, and then the Sponsor action still has
// to be mined into a block. This is minutes-scale; a tight poll would just
// hammer the node to watch the same `false` go by.
function startSponsorPoll() {
  if (sponsorPoll) return;
  sponsorPoll = setInterval(async () => {
    if (await isSponsored(rpc, myPk)) {
      hideSponsorGate();
      sponsorStatus('');
      powerOn(); // re-enters, passes the gate, and tunes for real
      return;
    }
    // Keep the reason current: a set that was behind may have caught up, and
    // one that just claimed may now be waiting on sync rather than on a human.
    if (claimSent) sponsorStatus(WAITING + (await syncTail()));
  }, 8000);
}

// A sponsor is a person deciding whether to vouch for a stranger; nobody
// approves a blind claim. The button stays dead until they've written
// something, and sponsorship.mjs refuses an empty application anyway.
document.getElementById('sponsor-note').addEventListener('input', (e) => {
  document.getElementById('sponsor-btn').disabled = !e.target.value.trim();
});

// A fresh set has not met the network yet, so its offer store is empty for the
// first sweep or two. That is worth WAITING through, not reporting as "nothing
// open" — so the request retries itself instead of making the newcomer keep
// tapping. Bounded, and every attempt is visible.
const OFFER_RETRY_MS = 10_000;
const OFFER_RETRY_MAX = 30; // ~5 minutes of a set introducing itself

async function submitRequest(attempt = 0) {
  const btn = document.getElementById('sponsor-btn');
  const note = document.getElementById('sponsor-note');
  btn.disabled = true;
  sponsorStatus(attempt ? 'Looking for an open sponsorship…' : 'Proving this set is real…');
  try {
    await requestSponsorship({ rpc, sign, pubkeyHex: myPk, applicationText: note.value });
    note.disabled = true;
    btn.hidden = true;
    claimSent = true;
    sponsorStatus(WAITING + (await syncTail()));
    startSponsorPoll();
  } catch (e) {
    const msg = String(e?.message);
    if (msg === 'no-offers-yet' && attempt < OFFER_RETRY_MAX) {
      sponsorStatus('This set has not met the network yet — still finding the open sponsorships. Keeping the request going.');
      offerRetry = setTimeout(() => submitRequest(attempt + 1), OFFER_RETRY_MS);
      return;
    }
    btn.disabled = !note.value.trim();
    sponsorStatus(
      msg === 'no-offers-yet'
        ? 'Still cannot see any sponsorships from this set. Ask someone already on the network to sponsor the address above.'
        : msg === 'no-unscoped-offer'
          ? 'No open sponsorship to request right now — the only offers visible are tied to single games. Ask someone already on the network to sponsor the address above.'
          : msg === 'application-required'
            ? 'Say something first — a person reads this before they vouch for you.'
            : `Request failed: ${e?.message ?? e}`
    );
  }
}

document.getElementById('sponsor-btn').addEventListener('click', () => submitRequest(0));

document.getElementById('sponsor-copy').addEventListener('click', async () => {
  const text = document.getElementById('sponsor-addr').textContent ?? '';
  try {
    await navigator.clipboard.writeText(text);
    sponsorStatus('Address copied.');
  } catch {
    // WebView clipboard can be denied; selecting it is still a usable handoff.
    const r = document.createRange();
    r.selectNodeContents(document.getElementById('sponsor-addr'));
    const sel = getSelection();
    sel.removeAllRanges(); sel.addRange(r);
    sponsorStatus('Copy unavailable — the address is selected, copy it by hand.');
  }
});

/** @returns true when the set may tune; false when the gate now owns the screen. */
async function sponsorGate() {
  if (await isSponsored(rpc, myPk)) { vouched = true; hideSponsorGate(); return true; }
  vouched = false;
  showSponsorGate();
  startSponsorPoll(); // a sponsor may act without them ever pressing the button
  return false;
}

document.getElementById('retune').addEventListener('click', () => {
  gate?.cancel();
  const id = deck.current;
  unmount(id);
  document.getElementById('signal-lost').hidden = true;
  settle(id, { mounted: [id], evicted: [] }, null);
});

// --- the Chart: open/close/render + gestures --------------------------------
// Guard: the chart is available only once acquired (mirrors flip()'s own
// "the dial exists once there is signal" guard).
async function openChart() {
  if (!powered || !acquired || !vouched || chartOpen) return;
  chartOpen = true;
  document.getElementById('chart').hidden = false;
  await renderChart();
}
function closeChart() {
  chartOpen = false;
  document.getElementById('chart').hidden = true;
}

async function renderChart() {
  const metered = cfg.channels.filter((c) => (c.spaces ?? []).length);
  // Never pass an empty space_ids array to get_space_health — per Task 1,
  // empty means ALL known spaces, which would credit an unrelated busy
  // space's recency to a channel that declared none at all (the `metered`
  // filter above already excludes any channel with no declared spaces).
  //
  // One RPC call PER metered channel, not one combined call across every
  // metered channel's spaces re-split by id afterward — LIVE-DISCOVERED bug
  // (task-5-report.md): get_space_health's response `space_id` comes back
  // BECH32-encoded ("sp1qqq...") regardless of the HEX ids channels.json
  // declares ("01000f88..."), confirmed against the real running node. A
  // combined call followed by `ch.spaces.map(s => bySpace.get(s))` looks up
  // a hex key in a bech32-keyed map and silently matches nothing — every
  // metered channel's health would collapse to [], and every glowValue would
  // read as measured-dead (0) regardless of real freshness. Scoping each
  // request to one channel's own spaces sidesteps the format mismatch
  // entirely: the response's `.spaces` array already IS that channel's
  // entries, in whatever id format the node chose to echo — no re-matching
  // needed. Today there is exactly one metered channel (feed), so this is
  // the same one RPC call either way; the node's own 3s-TTL cache (Task 1)
  // still keeps a second open moments later cheap.
  const healthByChannel = {};
  // Final-review fix (MINOR 3): channels whose get_space_health call THREW
  // this render, kept distinct from a successful-but-empty response. The
  // old catch left healthByChannel[ch.id] unassigned on a throw, which
  // chartRows' `healthByChannel?.[ch.id] ?? []` then collapsed onto the
  // exact same [] a genuinely empty success returns -> freshestTs([]) ->
  // glow(null) -> glowValue 0 -> a live channel painting measured-dead over
  // a transient RPC blip. Dead-air's own checkDeadAir is conservative on
  // RPC failure (shows no card at all rather than fabricating "dead"); the
  // Chart gets the same stance now. A success that simply lacks the space
  // is unaffected — it still legitimately glows 0 (honest, measured; see
  // chart.mjs's own module comment).
  const unknown = new Set();
  for (const ch of metered) {
    try {
      const res = await rpc('get_space_health', { space_ids: ch.spaces });
      healthByChannel[ch.id] = res?.spaces ?? [];
    } catch {
      unknown.add(ch.id); // best-effort: a transient RPC failure reads as "unknown", not "dead"
    }
  }
  if (!chartOpen) return; // closed while the fetch was in flight
  const rows = chartRows(cfg.channels, healthByChannel, new Set(deck.warm), moored, Date.now());
  // Repaint any THROW-marked row with the same "NO TELEMETRY" / glowValue
  // null treatment chartRows already gives a channel with no declared spaces
  // — visually the honest read for "we don't know right now", distinct from
  // "measured, confirmed dark". Scoped to shell.mjs only: chartRows itself
  // still decides `unmetered` purely from `ch.spaces`, unchanged.
  for (const row of rows) {
    if (unknown.has(row.id)) { row.unmetered = true; row.glowValue = null; }
  }
  paintChart(rows);
}

const CHART_BAND_ORDER = ['surface', 'mid', 'reef', 'trench'];
const CHART_BAND_LABELS = { surface: 'SURFACE', mid: 'MID-WATER', reef: 'REEF', trench: 'TRENCH' };
const ROW_FLICK_PX = 48;

function paintChart(rows) {
  const rowsEl = document.getElementById('chart-rows');
  rowsEl.innerHTML = '';
  for (const band of CHART_BAND_ORDER) {
    const label = document.createElement('div');
    label.className = 'chart-band-label';
    label.textContent = CHART_BAND_LABELS[band];
    rowsEl.appendChild(label);
    for (const row of rows.filter((r) => r.band === band)) rowsEl.appendChild(buildChartRow(row));
  }
  paintMooredStrip(rows);
}

function buildChartRow(row) {
  const el = document.createElement('div');
  el.className = 'chart-row'
    + (row.unmetered ? ' unmetered' : '')
    + (row.afterglow ? ' afterglow' : '')
    + (row.moored ? ' moored' : '');
  el.dataset.channelId = row.id;
  el.style.setProperty('--glow', String(row.unmetered ? 0 : (row.glowValue ?? 0)));
  const num = document.createElement('span'); num.className = 'cr-num'; num.textContent = `CH ${row.number}`;
  const name = document.createElement('span'); name.className = 'cr-name'; name.textContent = row.name;
  const tag = document.createElement('span'); tag.className = 'cr-tag';
  tag.textContent = row.unmetered ? 'NO TELEMETRY' : (row.moored ? 'MOORED' : '');
  el.append(num, name, tag);
  attachChartRowGestures(el, row.id);
  return el;
}

// Tap = tune (close + flip to it); horizontal flick = toggleMoor. Pointer
// events (not touch-only) so a real finger, a mouse drag, or a synthetic
// pointer sequence all drive the exact same code path. A flick that crosses
// ROW_FLICK_PX horizontally AND is more horizontal than vertical (so a
// vertical scroll over #chart-rows is never misread as a flick) suppresses
// the click that would otherwise follow pointerup, so a flick never also
// fires a tune.
function attachChartRowGestures(el, channelId) {
  let suppressClick = false;
  el.addEventListener('pointerdown', (e) => {
    const sx = e.clientX, sy = e.clientY;
    const onUp = (e2) => {
      document.removeEventListener('pointerup', onUp);
      const dx = e2.clientX - sx, dy = e2.clientY - sy;
      if (Math.abs(dx) > ROW_FLICK_PX && Math.abs(dx) > Math.abs(dy)) {
        suppressClick = true;
        toggleRowMoor(channelId);
      }
    };
    document.addEventListener('pointerup', onUp, { once: true });
  });
  el.addEventListener('click', () => {
    if (suppressClick) { suppressClick = false; return; }
    tuneFromChart(channelId);
  });
}

function toggleRowMoor(channelId) {
  const next = toggleMoor(moored, channelId); // caps at policy.mjs's MOOR_CAP by default
  if (next === moored) { showDeckFullNote(); return; } // unchanged reference = toggleMoor's own cap signal
  moored = next;
  persistMoored();
  mooredCycleIndex = 0;
  if (chartOpen) renderChart();
}

let deckFullTimer = null;
function showDeckFullNote() {
  const note = document.getElementById('chart-note');
  note.textContent = 'DECK FULL';
  note.classList.add('show');
  clearTimeout(deckFullTimer);
  deckFullTimer = setTimeout(() => note.classList.remove('show'), 1400);
}

// The moored buoys STRIP (#chart-moored) is a DISTINCT DOM zone from
// individual chart rows, showing only the (<=MOOR_CAP) currently-moored
// channels. A horizontal flick HERE cycles which buoy is highlighted (tap
// any buoy to tune to it directly); a horizontal flick on a ROW toggles that
// row's OWN moored membership instead. Both use the same physical gesture
// (a horizontal pointer flick) but on two different DOM elements, so there
// is no ambiguity between "toggle this one" and "cycle the set" — this is
// the documented gesture choice (see the module-top comment and
// task-5-report.md's gesture-collision analysis): distinct zones rather than
// a distinct edge or a two-finger gesture, because the row list and the
// moored strip are already visually and physically separate regions of the
// open drawer. It also cannot collide with A1's right-edge #flip-strip:
// #flip-strip is a separate DOM element pinned to the right edge, and the
// full-screen #chart drawer (z-index 6600, above #flip-strip's 6500) is
// opaque and covers it completely while open, so #flip-strip receives zero
// pointer events for the duration.
function paintMooredStrip(rows) {
  const el = document.getElementById('chart-moored');
  el.innerHTML = '';
  const mooredRows = rows.filter((r) => r.moored);
  if (!mooredRows.length) {
    const empty = document.createElement('span');
    empty.className = 'chart-moored-empty';
    empty.textContent = 'no buoys moored';
    el.appendChild(empty);
    return;
  }
  if (mooredCycleIndex >= mooredRows.length) mooredCycleIndex = 0;
  mooredRows.forEach((row, i) => {
    const b = document.createElement('span');
    b.className = 'buoy' + (i === mooredCycleIndex ? ' cycled' : '');
    b.dataset.channelId = row.id;
    b.textContent = `CH ${row.number}`;
    b.addEventListener('click', () => tuneFromChart(row.id));
    el.appendChild(b);
  });
}

document.getElementById('chart-moored').addEventListener('pointerdown', (e) => {
  const sx = e.clientX;
  const onUp = (e2) => {
    document.removeEventListener('pointerup', onUp);
    const dx = e2.clientX - sx;
    if (Math.abs(dx) <= ROW_FLICK_PX) return;
    const mooredIds = [...moored];
    if (!mooredIds.length) return;
    mooredCycleIndex = (mooredCycleIndex + (dx > 0 ? 1 : -1) + mooredIds.length) % mooredIds.length;
    if (chartOpen) renderChart();
  };
  document.addEventListener('pointerup', onUp, { once: true });
});

// Tap-a-row tuning: mirrors flip()'s own guarded tune sequence (dwell
// untuned, gate cancelled, deck.tune, settle) but jumps directly to `id`
// instead of stepping a neighbor.
function tuneFromChart(id) {
  closeChart();
  if (!powered || !acquired || !vouched) return;
  if (deck.current === id) return; // already tuned; nothing to settle
  dwell.untuned();
  const from = deck.current;
  gate?.cancel();
  const r = deck.tune(id);
  settle(r.current, r, from);
}

// Top pull strip (mirror of #flip-strip, top edge instead of right edge): a
// downward drag opens the chart.
document.getElementById('chart-strip').addEventListener('pointerdown', (e) => {
  const sy = e.clientY;
  const onUp = (e2) => {
    document.removeEventListener('pointerup', onUp);
    if (e2.clientY - sy > 50) openChart();
  };
  document.addEventListener('pointerup', onUp, { once: true });
});
// Tap-scrim: the header bar (not a row, not the close button) closes, same
// as Escape (wired in onKey below).
document.getElementById('chart-header').addEventListener('click', () => closeChart());
document.getElementById('chart-close').addEventListener('click', (e) => { e.stopPropagation(); closeChart(); });

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
  // D1: nothing tunes until someone has vouched for this set. The gate needs
  // rpcReady (myPk/rpcAuth), so the whole tail is async now; acquisitionBoot
  // awaits rpcReady itself, so its own contract is unchanged. The gate is
  // checked on BOTH paths below — an install already `acquired` under an
  // older build must still face it.
  (async () => {
    try {
      await rpcReady;
    } catch (e) {
      showNodeDead(String(e));
      return;
    }
    if (!powered) return; // powered off while rpcReady was still resolving
    if (!(await sponsorGate())) return; // gate owns the screen now
    // Review fix 2: acquisitionBoot is not re-entrant. Without this guard,
    // power-cycling mid-boot starts a second run: the frames map gets
    // overwritten (run A's mounted iframe orphaned, unmount() only ever
    // removes the currently-mapped one), run A's watchReadiness gate becomes
    // uncancellable from here, and its 2s timeout can fire SIGNAL LOST over
    // run B's successful reveal.
    if (!acquired) { if (!acquiring) { acquiring = true; acquisitionBoot(); } return; }
    const stored = localStorage.getItem(LAST_CHANNEL_KEY);
    const target = deck.current ?? (byId.has(stored) ? stored : FEED_ID);
    const r = deck.tune(target);
    settle(target, r, null, 'power');
  })();
}

function powerOff() {
  powered = false;
  // Final-review fix 4: advisory-only — the node/foreground-service keeps
  // broadcasting regardless (that's the whole point of "Still broadcasting."),
  // this just lets the current channel know it's no longer visible so it can
  // do battery-courtesy things (pause polling/animation) behind the off screen.
  if (deck.current) advisory(deck.current, 'SWIMCHAIN_CHANNEL_HIDDEN');
  dwell.untuned(); // Task 3: no dwell mining behind the off screen
  gate?.cancel();
  hideSponsorGate(); // D1: no sponsorship polling behind the off screen either
  staticCtl.stop();
  const off = document.getElementById('off-screen');
  off.hidden = false;
  off.classList.remove('collapsing'); void off.offsetWidth; off.classList.add('collapsing');
}

// --- section 3.1: first-signal acquisition (runs once, then persisted) ---
async function acquisitionBoot() {
  seamOn();
  document.getElementById('acquire').hidden = false;
  try {
    await rpcReady; // rpcAuth + myPk + rpcConfig (boot section below)
    const feed = FEED_ID;
    // Task 6 (B5): rank the node's OWN live spaces BEFORE following the
    // hardcoded set (deck.tune/mount/tuneDriver below -- tuneDriver is what
    // actually calls follow_space). On a successful pick (list_spaces has
    // >=1 'social' space), adopt it as the feed channel's single source of
    // truth AND persist it in the same step -- both writes happen together
    // so a later boot's re-apply (module top, above) reflects exactly what
    // THIS pick decided, never a half-applied state. pickBootstrap signals
    // "nothing to adopt" (list_spaces empty, or no social space in it) by
    // returning the exact FALLBACK_FEED_SPACES reference back unchanged --
    // the `!==` check below is that signal (matches chart.mjs's toggleMoor
    // cap-signal idiom: reference equality as the "no-op happened" tell). On
    // that path neither write happens, and byId.get(feed).spaces is already
    // channels.json's own trio (this module's load-time default -- since
    // acquisitionBoot only ever runs pre-acquisition, see its call site's
    // `!acquired` guard, no prior successful pick could have overwritten it
    // yet by the time this runs).
    let listed = null;
    try {
      listed = await rpc('list_spaces', { limit: 20 });
    } catch { /* best-effort: a transient RPC failure just leaves byId.get(feed).spaces as whatever it already was (channels.json's trio) */ }
    if (listed) {
      const picked = pickBootstrap(listed, FALLBACK_FEED_SPACES);
      if (picked !== FALLBACK_FEED_SPACES) {
        byId.get(feed).spaces = picked;
        localStorage.setItem(FEED_SPACES_KEY, JSON.stringify(picked));
      }
    }
    deck.tune(feed);
    mount(feed); // paints its own loading UI behind the static; NOT revealed
    await tuneDriver(feed); // driver FIRST: follows + request_content
    const N = 3;
    await new Promise((resolve) => {
      acquisitionPollHandle = setInterval(async () => {
        try {
          if ((await localItemCount(byId.get(feed).spaces)) >= N) {
            clearInterval(acquisitionPollHandle);
            acquisitionPollHandle = null;
            resolve();
          } else {
            tuneDriver(feed); // keep nudging request_content as sync progresses
          }
        } catch { /* node still syncing */ }
      }, 2000);
    });
    acquired = true;
    localStorage.setItem(ACQUIRED_KEY, '1');
    acquiring = false; // review fix 2: boot is done; a future power-off/on is a normal cycle
    // The feed's prefs sync and first load ran before the follows existed —
    // unmount so whichever powerOn() actually reveals it (this one, or a
    // deferred one below) does a fresh mount that sees them.
    unmount(feed);
    // Review fix 3: power-off doesn't stop this poll (deliberately — see the
    // brief's "simplest" option), so the lock can land while `powered` is
    // false. Revealing anyway would post SWIMCHAIN_CHANNEL_VISIBLE, burn the
    // OSD, and write lastChannel all behind #off-screen, then double-settle
    // on the next power-on. Persist the lock either way, but only reveal
    // now if the set is actually on; otherwise the next powerOn() sees
    // `acquired === true` and takes the normal already-acquired branch,
    // which mounts+settles fresh (frames no longer has `feed`, so settle()
    // mounts rather than reusing anything).
    if (!powered) return;
    settle(feed, { mounted: [feed], evicted: [] }, null, 'power');
  } catch (e) {
    acquiring = false;
    if (acquisitionPollHandle) { clearInterval(acquisitionPollHandle); acquisitionPollHandle = null; }
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
  else if (e.key === 'c') (chartOpen ? closeChart : openChart)(); // Task 5: keyboard/desktop equivalent of the pull-down
  else if (e.key === 'Escape' && chartOpen) closeChart();
}
window.addEventListener('keydown', onKey);
// The HUD and the results export live behind INVISIBLE 44px corner buttons.
// A single tap was enough, and the flip strip runs down the right edge to the
// bottom-right corner — so reaching for a flip could summon a perf readout
// over a shipping build (observed on the Pixel). Require three deliberate taps
// inside 800ms; the `m`/`e` keys are unchanged for desktop/dev.
function onTripleTap(el, fn) {
  let n = 0;
  let resetTimer = null; // NOT `timer` — that's the module-level flip timer
  el.addEventListener('click', () => {
    n += 1;
    clearTimeout(resetTimer);
    if (n >= 3) { n = 0; fn(); return; }
    resetTimer = setTimeout(() => { n = 0; }, 800);
  });
}
onTripleTap(document.getElementById('export-btn'), () => exportResults(timer, hud));
onTripleTap(document.getElementById('hud-toggle'), () => hud.toggle());
document.getElementById('off-screen').addEventListener('click', () => { if (!powered) powerOn(); });

const strip = document.getElementById('flip-strip');
let touchX = null;
let touchY = null;
let pressTimer = null;
// Final-review fix 1: a raw finger held for 800ms drifts a few px — the old
// touchmove handler cleared the power timer on ANY movement, making touch
// power-off practically impossible. Only cancel once the finger has moved
// past a small slop radius from the touchstart point (Euclidean, since
// jitter isn't purely vertical); below that it's still a hold. This is
// independent of the 60px flip-swipe threshold in touchend below, which
// always measures from the original touchstart Y regardless of what
// touchmove does — unchanged.
const LONG_PRESS_SLOP_PX = 10;
strip.addEventListener('touchstart', (e) => {
  touchX = e.touches[0].clientX;
  touchY = e.touches[0].clientY;
  pressTimer = setTimeout(() => { pressTimer = null; (powered ? powerOff : powerOn)(); touchY = null; }, 800);
}, { passive: true });
strip.addEventListener('touchmove', (e) => {
  if (touchX == null || touchY == null || pressTimer == null) return;
  const dx = e.touches[0].clientX - touchX;
  const dy = e.touches[0].clientY - touchY;
  if (Math.hypot(dx, dy) > LONG_PRESS_SLOP_PX) { clearTimeout(pressTimer); pressTimer = null; }
}, { passive: true });
strip.addEventListener('touchend', (e) => {
  clearTimeout(pressTimer);
  if (pressTimer === null && touchY == null) return; // long-press already fired
  pressTimer = null;
  if (touchY == null) return;
  const dy = e.changedTouches[0].clientY - touchY;
  touchX = null;
  touchY = null;
  if (Math.abs(dy) > 60) flip(dy < 0 ? +1 : -1);
});
strip.addEventListener('wheel', (e) => { e.preventDefault(); flip(e.deltaY > 0 ? +1 : -1); }, { passive: false });

// --- boot: static immediately; node plumbing resolves behind it ---
const rpcReady = (async () => {
  rpcAuth = await invoke('get_rpc_auth'); // blocks until THIS run's node is up, or errors
  myPk = (await rpc('get_identity_info')).public_key; // confirmed: src/rpc/methods.rs:8487
  myAddress = (await invoke('get_node_address')) ?? null; // D1 gate shows this
  rpcConfig = buildConfigMessage({
    rpcEndpoint,
    rpcAuth,
    nodeAddress: myAddress ?? undefined,
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
