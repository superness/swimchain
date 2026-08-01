/**
 * Fleet agreement monitor — does every node think it is on the same chain?
 *
 * WHY THIS EXISTS. On 2026-07-28 two nodes minted height 1081 within 140
 * seconds of each other. Each kept its own, and the fleet ran TWO mainnet
 * chains for three and a half days with no symptom whatsoever: every
 * user-visible read goes through content and mempool, which gossip across all
 * chains, so games kept working, browse kept serving, and nothing looked
 * wrong. It surfaced only when an unrelated deploy restarted the nodes and
 * forced each to declare a side — and cost eleven hours of one Saturday.
 *
 * Nineteen fixes later a fork like that heals itself. This exists for the
 * failure we have NOT thought of: each node now reports honestly on ITSELF
 * (get_sync_status carries fork_branches / fork_gaps / adoptable_fork_height),
 * but nothing compares nodes to EACH OTHER. Two nodes can each be perfectly
 * happy and still disagree, which is exactly what happened.
 *
 * The check is deliberately dumb, because a clever check is one more thing
 * that can be quietly wrong:
 *   1. ask every node for its height and its block hash at a shared height
 *   2. if the hashes differ, the fleet is split — say so, loudly
 *   3. if a node reports "forked", or an adoptable chain it has not taken,
 *      say that too: it knows it is wrong and cannot fix itself
 *
 * Comparing BELOW the tip on purpose: nodes are legitimately a block or two
 * apart at the tip at any moment, and a check that cries wolf on ordinary lag
 * is a check people learn to ignore. A hash mismatch at tip-50 is not lag.
 *
 * Env:
 *   NODES          comma-separated http://host:port RPC endpoints (required)
 *   COOKIES        comma-separated cookies, aligned with NODES (optional; a
 *                  loopback node with cookie auth needs one, a public proxy
 *                  does not)
 *   DEPTH          how far below the lowest tip to compare (default 50)
 *   INTERVAL_MS    poll period (default 300000 = 5 min)
 *   ONCE           set to "1" to run a single check and exit with a status
 *                  code — for cron, or a shell one-liner
 *   ALERT_EMAIL    address to notify when the fleet DISAGREES, via ntfy.sh's
 *                  email forwarding (no account, no credentials). Note this
 *                  hands the address to a third-party relay; set ALERT_URL to
 *                  your own endpoint instead if that matters.
 *   ALERT_URL      POST the alert as JSON here instead of / as well as email —
 *                  a Discord or Slack webhook, your own service, anything.
 *
 * Alerts fire ONLY on disagreement, and only on the TRANSITION into it: a
 * check that mails every ten minutes for as long as a fork lasts is a check
 * whose mail gets filtered.
 *
 * Exit codes in ONCE mode: 0 agreed, 1 DISAGREEMENT, 2 could not determine.
 */

const NODES = (process.env.NODES || '').split(',').map((s) => s.trim()).filter(Boolean);
const COOKIES = (process.env.COOKIES || '').split(',').map((s) => s.trim());
const DEPTH = Number(process.env.INTERVAL_DEPTH || process.env.DEPTH || 50);
const INTERVAL_MS = Number(process.env.INTERVAL_MS || 300000);
const ONCE = process.env.ONCE === '1';
const ALERT_EMAIL = (process.env.ALERT_EMAIL || '').trim();
const ALERT_URL = (process.env.ALERT_URL || '').trim();
const TAG = 'fleet';

/** Where the last verdict is remembered, so we alert on the TRANSITION into
 *  disagreement rather than every ten minutes for as long as it lasts. */
const STATE_FILE = process.env.STATE_FILE || '/var/tmp/fleet-agreement.state';

import { readFileSync, writeFileSync } from 'node:fs';

function lastVerdict() {
  try {
    return readFileSync(STATE_FILE, 'utf8').trim();
  } catch {
    return '';
  }
}
function rememberVerdict(v) {
  try {
    writeFileSync(STATE_FILE, v);
  } catch {
    /* a monitor that cannot write its state still monitors */
  }
}

/** HTTP headers are ByteStrings: a single non-ASCII character (an em dash in
 *  a subject, say) makes fetch THROW rather than send. Found the hard way —
 *  the first version of this alert died on its own title. */
const asciiHeader = (v) => String(v).replace(/[^ -~]/g, '-');

/** Shout, once, through whatever channels are configured.
 *
 * ntfy.sh is the default because it needs no account to PUSH. It refuses
 * anonymous EMAIL though ("anonymous email sending is not allowed"), so a
 * mail alert needs a token — supply it yourself in ALERT_TOKEN; this script
 * never sees or stores a credential of its own. Without a token you still get
 * push: subscribe to the topic in the ntfy app or at ntfy.sh/<topic>. */
async function alert(subject, body) {
  const topic = process.env.ALERT_TOPIC || 'swimchain-fleet-agreement';
  const token = (process.env.ALERT_TOKEN || '').trim();
  if (ALERT_EMAIL || token || process.env.ALERT_TOPIC) {
    const headers = {
      Title: asciiHeader(subject),
      Priority: 'high',
      Tags: 'rotating_light',
      ...(ALERT_EMAIL && token ? { Email: asciiHeader(ALERT_EMAIL) } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
    if (ALERT_EMAIL && !token) {
      console.log(`[${TAG}] ALERT_EMAIL is set but ALERT_TOKEN is not — ntfy refuses anonymous email; sending push only`);
    }
    try {
      const res = await fetch('https://ntfy.sh/' + encodeURIComponent(topic), {
        method: 'POST',
        headers,
        body,
      });
      if (!res.ok) {
        console.log(`[${TAG}] alert rejected (${res.status}): ${(await res.text()).slice(0, 200)}`);
      } else {
        console.log(`[${TAG}] alerted via ntfy topic ${topic}`);
      }
    } catch (e) {
      console.log(`[${TAG}] could not send alert: ${e.message}`);
    }
  }
  if (ALERT_URL) {
    try {
      await fetch(ALERT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject, body, at: new Date().toISOString() }),
      });
      console.log(`[${TAG}] posted alert to ${ALERT_URL}`);
    } catch (e) {
      console.log(`[${TAG}] could not POST alert: ${e.message}`);
    }
  }
}

if (NODES.length < 2) {
  console.error(`[${TAG}] NODES must list at least two RPC endpoints — a fleet of one cannot disagree`);
  process.exit(2);
}

const authFor = (i) => (COOKIES[i] ? 'Basic ' + Buffer.from(`__cookie__:${COOKIES[i]}`).toString('base64') : null);

let rpcId = 0;
async function rpc(url, auth, method, params = {}, timeoutMs = 15000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: auth } : {}) },
      body: JSON.stringify({ jsonrpc: '2.0', id: ++rpcId, method, params }),
      signal: ctrl.signal,
    });
    const j = await res.json();
    if (j.error) throw new Error(j.error.message || JSON.stringify(j.error));
    return j.result;
  } finally {
    clearTimeout(timer);
  }
}

/** Everything one node can tell us about where it thinks it is. */
async function survey(url, auth) {
  const info = await rpc(url, auth, 'get_info');
  let status = {};
  try {
    status = await rpc(url, auth, 'get_sync_status');
  } catch {
    // Older binary, or a proxy that does not expose it. The hash comparison
    // below still works, so this is a downgrade rather than a failure.
  }
  return {
    url,
    height: info.block_height,
    nodeId: (info.node_id || '').slice(0, 8),
    state: status.state,
    forkBranches: status.fork_branches,
    forkGaps: status.fork_gaps,
    adoptable: status.adoptable_fork_height,
    tipHash: status.tip_hash,
  };
}

async function hashAt(url, auth, height) {
  const block = await rpc(url, auth, 'get_block', { height });
  return block?.hash || null;
}

/**
 * Fallback for endpoints that do not expose `get_block` — the public proxy
 * allowlists a small set of methods and that is not one of them.
 *
 * `get_sync_status` carries the tip height AND a tip hash, so two nodes that
 * report the SAME height and DIFFERENT hashes are provably on different
 * chains. Weaker than comparing at depth (it can only speak when the heights
 * happen to coincide) but it needs no privileged access, and a fleet monitor
 * that demands credentials is one that does not get run.
 */
function tipDisagreement(surveys) {
  const byHeight = new Map();
  for (const s of surveys) {
    if (!s.tipHash) continue;
    const seen = byHeight.get(s.height);
    if (seen && seen.tipHash !== s.tipHash) return { height: s.height, a: seen, b: s };
    if (!seen) byHeight.set(s.height, s);
  }
  return null;
}

/** One pass. Returns 'agreed' | 'disagreed' | 'unknown'. */
async function check() {
  const surveys = [];
  for (const [i, url] of NODES.entries()) {
    try {
      surveys.push(await survey(url, authFor(i)));
    } catch (e) {
      console.log(`[${TAG}] UNREACHABLE ${url}: ${e.message}`);
    }
  }
  if (surveys.length < 2) {
    console.log(`[${TAG}] cannot compare: only ${surveys.length} node(s) answered`);
    return 'unknown';
  }

  // A node that knows it is wrong is worth reporting even if the hashes agree.
  for (const s of surveys) {
    if (s.adoptable != null) {
      console.log(`[${TAG}] *** ${s.url} is FORKED: holding an unadopted heavier chain (tip ${s.adoptable})`);
    } else if (s.state && s.state !== 'synced') {
      console.log(`[${TAG}] ${s.url} state=${s.state} branches=${s.forkBranches} gaps=${s.forkGaps}`);
    }
  }

  // Compare well below the tip: nodes are legitimately a block or two apart at
  // any moment, and a check that cries wolf on ordinary lag gets ignored.
  const lowestTip = Math.min(...surveys.map((s) => s.height));
  const compareAt = Math.max(1, lowestTip - DEPTH);

  const hashes = [];
  for (const [i, url] of NODES.entries()) {
    const s = surveys.find((x) => x.url === url);
    if (!s) continue;
    try {
      hashes.push({ url, hash: await hashAt(url, authFor(i), compareAt) });
    } catch (e) {
      console.log(`[${TAG}] ${url}: could not read height ${compareAt}: ${e.message}`);
    }
  }
  if (hashes.length < 2) {
    // No privileged read available — fall back to same-height tip hashes.
    const clash = tipDisagreement(surveys);
    if (clash) {
      console.log(`[${TAG}] *** FLEET DISAGREEMENT at tip height ${clash.height} — different chains`);
      console.log(`[${TAG}]     ${clash.a.url} -> ${clash.a.tipHash}`);
      console.log(`[${TAG}]     ${clash.b.url} -> ${clash.b.tipHash}`);
      return 'disagreed';
    }
    console.log(
      `[${TAG}] cannot compare at height ${compareAt} (no get_block); tips ${surveys
        .map((s) => `${s.height}:${s.tipHash || '?'}`)
        .join(' ')}`
    );
    return 'unknown';
  }

  const distinct = [...new Set(hashes.map((h) => h.hash))];
  if (distinct.length === 1) {
    console.log(
      `[${TAG}] agreed at height ${compareAt} (${distinct[0].slice(0, 16)}…) — tips ${surveys
        .map((s) => s.height)
        .join('/')}`
    );
    return 'agreed';
  }

  console.log(`[${TAG}] *** FLEET DISAGREEMENT at height ${compareAt} — the network is running more than one chain`);
  for (const h of hashes) console.log(`[${TAG}]     ${h.url} -> ${String(h.hash).slice(0, 16)}…`);
  console.log(`[${TAG}]     This is the 2026-07-28 condition. It hid for 3.5 days because every`);
  console.log(`[${TAG}]     user-visible read gossips across chains and looks fine.`);
  return 'disagreed';
}

/** Run a check and alert on the TRANSITION into (or out of) disagreement. */
async function checkAndAlert() {
  const verdict = await check();
  const previous = lastVerdict();

  if (verdict === 'disagreed' && previous !== 'disagreed') {
    await alert(
      'Swimchain fleet DISAGREEMENT',
      [
        'The fleet is running more than one chain.',
        'This is the 2026-07-28 condition, which is invisible to every',
        'user-facing read because content and mempool gossip across chains.',
        '',
        'Check: journalctl -u fleet-agreement -n 50',
      ].join(String.fromCharCode(10))
    );
  } else if (verdict === 'agreed' && previous === 'disagreed') {
    await alert('Swimchain fleet agrees again', 'The fleet is back on one chain.');
  }

  // Only remember conclusive verdicts: an unreachable node must not be able to
  // clear the alarm, or a fork plus a network blip reads as "resolved".
  if (verdict !== 'unknown') rememberVerdict(verdict);
  return verdict;
}

if (ONCE) {
  const verdict = await checkAndAlert();
  process.exit(verdict === 'agreed' ? 0 : verdict === 'disagreed' ? 1 : 2);
} else {
  console.log(`[${TAG}] watching ${NODES.length} nodes every ${INTERVAL_MS / 1000}s (compare depth ${DEPTH})`);
  for (;;) {
    try {
      await checkAndAlert();
    } catch (e) {
      console.log(`[${TAG}] check failed: ${e.message}`);
    }
    await new Promise((r) => setTimeout(r, INTERVAL_MS));
  }
}
