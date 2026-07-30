/**
 * THE WIRING — `App.tsx` itself, rendered and driven. Run:
 * npx tsx src/ui/App.test.ts
 *
 * ## WHY THIS FILE EXISTS
 *
 * It did not, and that was the hole a Major landed in. Every other check in
 * this project tests `shellConfig`, `seaChoice`, `chainSea` or the engine —
 * never the component that CHOOSES between them. The defect was in the
 * choosing: a shipped build spends up to 120 s on the offline sea while
 * `get_rpc_config` waits for the node to bind RPC, and a keypress inside that
 * window moved the scene off `'lively'`, which was the only state the promotion
 * into real water could fire from. The player was then locked out of the game
 * PERMANENTLY, with the toggle that might have rescued them disabled by the
 * very configuration that had arrived. Found by a human pressing `2`.
 *
 * SO THE SCENARIOS BELOW ARE SLOW ON PURPOSE. A suite that only ever exercised
 * a node that answers instantly would reproduce the exact blind spot that hid
 * this: section 2 is the fast path, section 3 is the same thing with a
 * deliberately slow shell and an impatient player, and the difference between
 * the two is the whole point.
 *
 * ## THE COMPONENT IS COMPILED AS A SHIPPED BUILD COMPILES IT
 *
 * `App.tsx` reads `import.meta.env.DEV`, which under `tsx` is a `TypeError` on
 * the module's first line — Node's `import.meta` has no `env` and nothing
 * outside a module can add one. So `App.harness.tsx` is bundled here with
 * esbuild and `define: { 'import.meta.env.DEV': 'false' }`, the same
 * substitution Vite makes for production, by the same tool. What is driven
 * below is therefore the RELEASE shape of the component: `chainParams()` folded
 * to `null`, the dev path folded away, exactly as a player receives it.
 *
 * ## WHAT IS OBSERVED
 *
 * `submit_reply` on the wire, authored by the node's own key. A window in real
 * water publishes its opening vector on the first frame after the sea is built.
 * Reading React state would prove a variable was set; a reply proves a player
 * is in the water. `App.harness.tsx` documents the rest of the boundary.
 */
import { build } from 'esbuild';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import type { Observation, Scenario } from './App.harness';

let failures = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) console.log(`  ok  ${name}`);
  else { failures++; console.log(`FAIL  ${name}${extra !== undefined ? '  ' + JSON.stringify(extra) : ''}`); }
}

const HERE = dirname(fileURLToPath(import.meta.url));
/** Inside `node_modules/` so `react`, `react-dom` and `jsdom` resolve from the
 *  bundle exactly as they do from source, and so nothing lands in the tree. */
const OUT = resolve(HERE, '../../node_modules/.cache/shoal-app-harness.mjs');

/**
 * Compile the harness the way a release build compiles the component.
 *
 * `define` is the load-bearing option and it is the ONE substitution made:
 * `import.meta.env.DEV` becomes the literal `false`. React, react-dom and jsdom
 * stay external so the bundle uses the same installed copies everything else
 * does.
 */
async function buildHarness(dev: boolean): Promise<{ observe: (s: Scenario) => Promise<Observation> }> {
  mkdirSync(dirname(OUT), { recursive: true });
  await build({
    entryPoints: [resolve(HERE, 'App.harness.tsx')],
    outfile: OUT,
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node18',
    jsx: 'automatic',
    define: { 'import.meta.env.DEV': dev ? 'true' : 'false' },
    // `TheEdge` imports its stylesheet — a real file, so that a shipped build
    // links it rather than building a `<style>` element the CSP will drop
    // (`shippedStyles.test.ts`). Nothing under jsdom can apply CSS, so it is
    // dropped from this bundle rather than emitted beside it: `empty` keeps the
    // import resolvable without leaving a stray `.css` in `node_modules/.cache`
    // that nothing loads.
    loader: { '.css': 'empty' },
    external: ['react', 'react-dom', 'react-dom/client', 'jsdom'],
    logLevel: 'silent',
  });
  // Cache-busted so a second build in the same process is actually loaded.
  return import(`${pathToFileURL(OUT).href}?v=${Date.now()}`) as Promise<{
    observe: (s: Scenario) => Promise<Observation>;
  }>;
}

/** The room every window in this file joins, derived the way the node derives
 *  it — `roomContentId` is not reachable from here without importing the module
 *  under test's neighbour, so it is imported directly. */
import { roomContentId } from './shellConfig';
/** The copy, imported rather than retyped — it has exactly one home, and this
 *  file compares the rendered DOM against it. */
import { EDGE_BODY } from './wayIn';
/** The two spawns, imported rather than retyped: they are what tells the two
 *  seas apart on the wire (see `whereFrom`). */
import { KNOCK_BACKSTOP_MS, SEA_SPAWN } from './seaChoice';
import { SHALLOWS_SPAWN } from './shallows';
/** The shipping decoder, so a check reads a write the way a peer would. */
import { decodeBody } from '../lib/shoalWire';
import { MAX_EMIT_GAP_MS, MIN_EMIT_GAP_MS } from '../lib/shoalEmit';

const NODE_PUBKEY = 'c7'.repeat(32);

/** Did this window reach real water? A reply authored by the node, into the
 *  room the shell resolved, is the only evidence that counts. */
function reachedWater(o: Observation, room: string): boolean {
  return o.submitted.some((w) => w.author === NODE_PUBKEY && w.parent === room);
}

/**
 * The swim vectors a window put on the wire, decoded by the same decoder every
 * peer uses — never by re-splitting the body here.
 *
 * A presence body carries WHERE THE AUTHOR IS, so this is how a check can tell
 * which sea the player's own fish is swimming in. Nothing else in this file's
 * observations can: a count of writes says a window is alive and says nothing
 * at all about whether the person holding the mouse has anything to do.
 */
function vectorsOf(o: Observation): { x: number; y: number; t: number }[] {
  const out: { x: number; y: number; t: number }[] = [];
  for (const w of o.submitted) {
    const e = decodeBody(w.body, w.author, 'observed');
    if (e !== null && e.kind === 'presence') out.push({ x: e.vec.x, y: e.vec.y, t: e.vec.t });
  }
  return out;
}

/** Is this vector authored from the point a named sea spawns a swimmer on? */
function from(v: { x: number; y: number }, spawn: { x: number; y: number }): boolean {
  return v.x === spawn.x && v.y === spawn.y;
}

async function main(): Promise<void> {
  const room = await roomContentId();
  const { observe } = await buildHarness(false);
  /**
   * THE ONE WINDOW THAT IS REFUSED AND THEN LET IN — built once in section 6
   * and read again in section 7.
   *
   * Shared rather than re-run because it is the most expensive scenario in the
   * suite (26 s of real emit cadence and real mining) and because the two
   * sections are asking about the SAME run: section 6 asks what left the
   * window, section 7 asks what the player saw and what the window left behind.
   * Two runs would answer those about two different windows.
   */
  let crossed: Observation | null = null;

  // =======================================================================
  console.log('\n1. the release shape of the component is what is being driven');
  // =======================================================================
  //
  // A browser tab: no `window.__TAURI__` at all. It must never ask a shell that
  // is not there, never reach a node, and never write. If this passed for the
  // wrong reason — a component that silently threw on mount, say — every
  // "reached water" check below would be meaningless, so it is checked first
  // and section 2 is its positive control.
  {
    const o = await observe({ settleMs: 1_200, noShell: true });
    // NOT `!o.askedShell`, which was a tautology: `askedShell` is only settable
    // inside the block that installs a shell, so it could not fail. The fake
    // `fetch` is installed for EVERY scenario, so this one can — and the thing
    // it forbids is real, and named in `shellConfig`'s header: an endpoint
    // arriving from anywhere but the shell (`resolveAuth`'s postMessage
    // envelope, an env override) would carry this window's cookie to whatever
    // it pointed at.
    check('a browser tab never reaches a node at all', o.rpcCalls.length === 0, o.rpcCalls);
    check('...opens no live socket', o.sockets === 0, o.sockets);
    check('...and writes nothing', o.submitted.length === 0, o.submitted);
  }

  // =======================================================================
  console.log('\n2. a warm start reaches real water (the control)');
  // =======================================================================
  //
  // The node answers immediately. This is the only shape the suite exercised
  // before, and it is why the Major went unseen — it passes either way.
  {
    const o = await observe({ awaitWrite: true, settleMs: 200 });
    check('the window asks the shell', o.askedShell, o);
    check('POSITIVE CONTROL: a warm start reaches real water', reachedWater(o, room), o.submitted);
    check('...through exactly one live socket', o.sockets === 1, o.sockets);
  }

  // =======================================================================
  console.log('\n3. THE MAJOR: a cold start, and a player who presses a key');
  // =======================================================================
  //
  // `coldStart` holds `get_rpc_config` open — the real one polls the node's
  // handoff files for up to 120 s on a first launch (src-tauri/src/main.rs
  // :172-200) — and the key is pressed strictly inside that window: after the
  // component has asked, before the shell answers. The window is drawing the
  // offline sea with no configuration behind it at that instant, by
  // construction rather than by timing.
  //
  // Hand-derived expectation, stated before the run: `2` selects the lively
  // demo sea, which is a legitimate thing to be looking at while there is no
  // water — the default is now the shallows (plan 4b Task 3), so this really is
  // a scene change and not a React bail-out. When the configuration lands a
  // moment later the window must join the water ANYWAY. Before the fix it did
  // not, and never would again.
  {
    const cold = await observe({ coldStart: true, awaitWrite: true, settleMs: 200 });
    check('a cold start on its own still reaches real water', reachedWater(cold, room), cold.submitted);

    const pressed2 = await observe({
      coldStart: true, press: { key: '2', when: 'duringColdStart' }, awaitWrite: true, settleMs: 200,
    });
    check('pressing 2 during the cold start does NOT lock the player out',
      reachedWater(pressed2, room), pressed2.submitted);

    // THERE IS NO `1` CHECK HERE, AND ITS ABSENCE IS DELIBERATE.
    //
    // There was one, and it was vacuous: deleting the `'1'` key branch outright
    // left it passing. `setScene(<the default>)` from the default is a React
    // bail-out, so with no `?at=` the press changed nothing and the check was a
    // duplicate of the control two lines above. (The default is the shallows
    // now rather than `'lively'`, and `1` still names it, so the argument is
    // unchanged.)
    //
    // It cannot be repaired, only replaced or removed, and this is worth
    // writing down because the obvious repair looks like it works. Give the
    // window `?at=` so the scene really does change: under the OLD scene-gated
    // promotion, pressing `1` lands on `'lively'` — the one state the promotion
    // could still fire from — so the window reaches water and the check passes
    // anyway. A "reaches water" observable structurally cannot discriminate the
    // `'1'` branch, because after the fix nothing about the scene can stop a
    // window reaching water. `2` is the discriminating key and it is checked
    // above; `?at=` covers a scene that starts elsewhere.

    // THE SECOND DOOR into the same state, and the reason gating `?at=` would
    // have been the wrong fix: it closes one door rather than removing the room
    // behind both. `?at=` is not DEV-gated and does not need to be — see the
    // comment on `devParam`.
    const at = await observe({ coldStart: true, search: '?at=1000', awaitWrite: true, settleMs: 200 });
    check('nor does ?at=, which selects the same sea from the address bar',
      reachedWater(at, room), at.submitted);
  }

  // =======================================================================
  console.log('\n4. once in the water, a keypress cannot take it away');
  // =======================================================================
  //
  // The other half of the same rule, and the one that was already right: a
  // stray keypress must not tear down a live sea and rebuild it. Measured by
  // socket count, because a rebuilt sea opens a second one — a check on scene
  // state would pass for a component that changed the variable and re-mounted
  // anyway.
  //
  // IT HAS TO BE `2`, AND THE FIRST VERSION OF THIS CHECK USED `1` AND WAS
  // VACUOUS. With no `?at=` the scene is already the default, so pressing the
  // key that names the default is a React no-op: the effect never re-runs and
  // the socket count stays 1 whether the guard is there or not. Breaking `inRealWater` on
  // purpose left this group entirely green, which is how it was caught. `2`
  // asks for a DIFFERENT scene, so an unguarded handler really does rebuild.
  {
    const o = await observe({
      awaitWrite: true, press: { key: '2', when: 'afterFirstWrite' }, settleMs: 600,
    });
    check('pressing 2 after joining leaves the sea alone', o.sockets === 1, o.sockets);
    check('...and the window is still in the water it joined', reachedWater(o, room), o.submitted);
  }

  // =======================================================================
  console.log('\n5. a node that is not ready yet is not a node that never will be');
  // =======================================================================
  //
  // `shellConfig` answers `null` for six reasons and five of them are the
  // ordinary condition of a node that has just started. Asking once made every
  // one of them PERMANENT — the same outcome, and the same silence, as the
  // lockout in section 3, reached from a different direction.
  //
  // Both scenarios below have a node that is up and healthy the whole time.
  // Neither would ever reach water without a retry.
  {
    // The commonest case by far, and it is not a failure at all: a fresh
    // install's node holds the room's content BLOCK but not its BODY, because
    // content on this network arrives only when something asks. Task 4 watched
    // exactly this for 3 m 18 s on a real mainnet install. `shellConfig` is right
    // to return `null`; the window is wrong to stop asking, and wrong to wait
    // without asking.
    const late = await observe({ roomArrivesAfterAsks: 1, awaitWrite: true, settleMs: 200 });
    check('a node that has not got the room body yet is asked again, and the player gets in',
      reachedWater(late, room), late.submitted);
    check('...having really looked more than once',
      late.rpcCalls.filter((m) => m === 'get_content').length >= 2,
      late.rpcCalls.filter((m) => m === 'get_content').length);
    // THE DRIVER. Retrying a local-only read forever would never have produced
    // the body: `get_content` never fetches. Something has to ask the network,
    // and this is the check that says the window does.
    check('...and it ASKED THE NETWORK for it rather than only waiting',
      late.rpcCalls.includes('request_content'), late.rpcCalls);

    // And a plain transient failure, on the very first call the assembly makes
    // after the endpoint: one -32603 and the old code was done for good.
    const hiccup = await observe({ identityFailsTimes: 1, awaitWrite: true, settleMs: 200 });
    check('one failed identity read does not cost the player the game',
      reachedWater(hiccup, room), hiccup.submitted);

    // NON-DEGENERACY: the retry must not have quietly become a second, always-on
    // poll. A window that got in on the first ask looks for the room ONCE.
    const clean = await observe({ awaitWrite: true, settleMs: 200 });
    check('NON-DEGENERACY: a node that was ready is asked exactly once',
      clean.rpcCalls.filter((m) => m === 'get_content').length === 1,
      clean.rpcCalls.filter((m) => m === 'get_content').length);
    // ...and having found it locally, it must NOT have nudged the network. A
    // driver that fired unconditionally would be a broadcast on every launch.
    check('NON-DEGENERACY: a room that was already here is not asked for over the network',
      !clean.rpcCalls.includes('request_content'), clean.rpcCalls);

    // THE LISTING IS GONE. The space id is derived, so a fresh install no longer
    // depends on a name only a peer could supply — which on mainnet no peer ever
    // did. The harness still answers `list_spaces` correctly, so this is zero
    // because the window stopped asking, not because the fake stopped replying.
    check('the water is derived, not discovered — no listing is consulted at all',
      !clean.rpcCalls.includes('list_spaces'), clean.rpcCalls);
  }

  // =======================================================================
  console.log('\n6. A SWIMMER NOBODY HAS LET IN GETS A WHOLE GAME, and this client\n'
    + '   never asks anyone to change that');
  // =======================================================================
  //
  // THE RULING THIS SECTION EXISTS TO HOLD. Being let into the water is part of
  // being on the network; it is not something the game grants. A build that
  // claimed a standing offer on the player's behalf existed for two commits
  // (`passage.ts`, 725a8c06) and was removed. So there are two facts to keep
  // true at once, and they pull in opposite directions:
  //
  //   - a refused player must still get everything except being heard — real
  //     water, a real sea, a real fold, writes really attempted — because the
  //     shallows are a complete experience and not a waiting room; and
  //   - the window must not touch anyone's standing, not even to read it.
  //
  // `rpcCalls` is an ordered list of every method this window called, so the
  // second is a fact about the wire rather than about which module got deleted.
  {
    // (a) THE UNSPONSORED PLAYER, end to end. Every `submit_reply` comes back
    //     -32015 — the real code, from the real method — for the whole run.
    // THE SETTLE IS DERIVED, NOT PICKED. `shoalEmit.MAX_EMIT_GAP_MS` is 8 s and
    // is a ceiling, not an average: a sea that is still folding MUST publish
    // again within it. So a window held open past that and seen to write only
    // once has stopped, and one 9.5 s window is the cheapest interval in which
    // "it kept going" and "it gave up after the first refusal" look different.
    const started = Date.now();
    const refused = await observe({ writesRefused: true, awaitWrite: true, settleMs: 12_000 });
    const ended = Date.now();
    check('a refused swimmer still reaches real water and still writes into it',
      reachedWater(refused, room), refused.submitted);
    // NOT "it wrote once". A window that gave up after the first refusal would
    // pass the check above and would be a game that stops. The sea publishes a
    // vector every few seconds forever, refused or not.
    check('...and KEEPS swimming — it is refused again and again, not once and out',
      refused.submitted.length >= 2, refused.submitted.length);

    // =====================================================================
    // THE INVARIANT. While the edge is up, this client KEEPS ATTEMPTING REAL
    // WRITES — and it is asserted here, on the wire, because it is the only
    // thing standing between the newcomer's water and a silent permanent
    // lockout. A refusal is the only evidence this client will ever have that
    // it is outside; a write that goes through is the only evidence it will
    // ever have that it is not. Stop the writes and the door can only be
    // opened from a side nobody is standing on: no error, nothing wrong in the
    // logs, and a player sealed in forever.
    //
    // MEASURED ON THE AUTHORING INSTANTS THE WRITES THEMSELVES CARRY, not on
    // when they arrived. Each write is mined before it is sent, so arrival
    // times carry a variable delay at both ends of any interval and a check
    // against them is a check against Argon2id's mood. `vec.t` is chosen by
    // `shouldEmit`'s own clock and is exact.
    //
    // `MAX_EMIT_GAP_MS` is the right bar and it is imported, not typed: it is
    // the CEILING on the gap between one swimmer's writes, so a window that is
    // still folding must publish again inside it. Spanning a whole one after
    // the water first refused it is therefore "it is still going", not "the
    // last few were already in flight".
    const wrote = vectorsOf(refused);
    const span = wrote.length < 2 ? 0 : wrote[wrote.length - 1].t - wrote[0].t;
    check('THE INVARIANT: it is still writing a full emit-gap after the first refusal',
      span >= MAX_EMIT_GAP_MS, { span, MAX_EMIT_GAP_MS, wrote: wrote.length });

    // ...AND THOSE WRITES ARE STILL ADDRESSED TO THIS HOUR. A vector authored
    // on the shallows' own clock (a constant instant inside a constant epoch,
    // shallows.ts) would be dated somewhere in 1970: the node's timestamp
    // window would refuse it for a second reason, so the -32015 the standing
    // is built on would stop being what the client is hearing, and an
    // acceptance could never arrive. The player's body may be in the other
    // sea; the write may not.
    check('...on the water\'s own clock, not the shallows\' — every write is dated now',
      wrote.length > 0 && wrote.every((v) => v.t >= started && v.t <= ended + 1_000),
      wrote.map((v) => v.t - started));

    // =====================================================================
    // AND THE PLAYER HAS A SEA TO PLAY. The count above cannot see this: a
    // window that keeps writing into water it cannot affect, with nothing on
    // screen the player can move, satisfies every check before this one. A
    // presence body carries the author's own position, so the wire says which
    // water their fish is in — and the two spawns are 602 cu apart, so no
    // window reaches one from the other by accident.
    const opening = wrote[0];
    check('the first write — before any refusal — comes from the open water\'s spawn',
      opening !== undefined && from(opening, SEA_SPAWN), { opening, SEA_SPAWN });
    check('...and once refused, the player is swimming in the shallows instead',
      wrote.some((v) => from(v, SHALLOWS_SPAWN)),
      { wrote, SHALLOWS_SPAWN });

    check('...and the edge of the water is up, drawn over the live sea',
      refused.edgeAtEnd === true, refused.edgeAtEnd);
    check('...saying the one line this client owns for it, off the rendered DOM',
      refused.edgeLine === EDGE_BODY, refused.edgeLine);

    // (a2) THE EMIT FLOOR IS ABSOLUTE, INCLUDING ACROSS A SEA REBUILD.
    //
    // `MIN_EMIT_GAP_MS` is not a style preference: it is the only thing keeping
    // one window from crowding the per-space mempool budget every swimmer in
    // the water shares, and shoalEmit.ts calls it absolute with "no
    // change-of-mind exception". It is enforced by `shouldEmit` against the
    // input state — and the input state is rebuilt when the standing changes,
    // because the two seas keep clocks decades apart and carrying one across is
    // its own lockout (see App.tsx's effect deps). A rebuilt `InputState` has
    // no memory of when this window last wrote, and `shouldEmit` returns true
    // unconditionally for a null `last`, so the first write on the far side of
    // a transition used to leave 94 ms after the one before it.
    //
    // MEASURED ON `vec.t` ACROSS BOTH SEAS, which is exactly what makes this
    // checkable: every write that leaves this window carries a wall-clock
    // instant, in real water because that sea's clock IS the wall clock and in
    // the shallows because `knockOn` re-stamps it. So consecutive writes are
    // comparable straight through the transition they straddle.
    {
      crossed = await observe({ refuseFirst: 2, awaitWrite: true, settleMs: 26_000 });
      const ts = vectorsOf(crossed).map((v) => v.t);
      const gaps = ts.slice(1).map((t, i) => t - ts[i]);
      check('a window that is refused and then let in really crosses over',
        crossed.submitted.length >= 4 && crossed.edgeAtEnd === false,
        { writes: crossed.submitted.length, edge: crossed.edgeAtEnd });
      check('...and no two writes it ever made are closer than the emit floor',
        gaps.length >= 3 && Math.min(...gaps) >= MIN_EMIT_GAP_MS,
        { gaps, MIN_EMIT_GAP_MS });
      // NON-DEGENERACY: the floor is a floor and not the whole cadence. A
      // window that had simply stopped writing would satisfy the check above.
      check('...while still keeping up the keep-alive it is judged by',
        Math.max(...gaps) <= MAX_EMIT_GAP_MS + MIN_EMIT_GAP_MS,
        { gaps, MAX_EMIT_GAP_MS });
    }

    // (b) THE CLAIM FLOW IS GONE, and this is what says so. Not "the file is
    //     deleted" — a check about the filesystem proves nothing about the
    //     running window — but "the wire carries no such call", asked of the
    //     window that has the strongest possible reason to make one: it is
    //     being refused, right now, on every write.
    //
    //     The harness answers `default: ok({})`, so a re-added call would be
    //     ANSWERED and recorded rather than throwing; this check is the only
    //     thing standing between that and a silent return of the flow.
    const asked = refused.rpcCalls.filter((m) => m.includes('sponsor'));
    check('THE RULING: a refused window never asks about sponsorship at all',
      asked.length === 0, asked);

    // (c) NON-DEGENERACY for (a). The same window with a node that accepts
    //     shows no boundary — so the boundary in (a) is the refusal being
    //     recognised, not a surface that is always on screen.
    const accepted = await observe({ awaitWrite: true, settleMs: 1_500 });
    check('NON-DEGENERACY: a swimmer the water accepts is never shown a boundary',
      accepted.edgeAtEnd === false && accepted.edgeLine === null,
      { atEnd: accepted.edgeAtEnd, line: accepted.edgeLine });
    // ...nor sent to the shallows. The tutorial water is where a newcomer waits,
    // not where a player who is already in the sea plays: a window that drew it
    // whenever it could would take everyone out of the water they share.
    check('...and is never sent to the shallows — they are in the water they joined',
      vectorsOf(accepted).every((v) => !from(v, SHALLOWS_SPAWN))
      && vectorsOf(accepted).some((v) => from(v, SEA_SPAWN)),
      vectorsOf(accepted));
    check('...and asks about sponsorship no more than the refused one did',
      accepted.rpcCalls.filter((m) => m.includes('sponsor')).length === 0,
      accepted.rpcCalls);
  }

  // =======================================================================
  console.log('\n7. BEING LET THROUGH — what opens the door, and what provably\n'
    + '   does not');
  // =======================================================================
  //
  // The client is never told it has been let in. It finds out because a write
  // it was going to make anyway stops being refused, and this section is about
  // the exactness of that: an ACCEPTED write, and nothing else that could be
  // mistaken for one.
  //
  // `classifySendFailure` produces three kinds and only one of them is the
  // refusal. If the boundary lifted on "not refused" rather than on "accepted",
  // then a laptop that dropped its wifi for one write, or a node that answered
  // `PowInvalid` once, would open the door: the player is dropped into water
  // that still will not carry them, and the only thing on screen that said so
  // has just been taken away. That is why both of the other two kinds are
  // driven end to end below, on the wire, through the real classifier, rather
  // than being left to `wayIn.test.ts`'s unit rows.
  {
    const c = crossed;
    if (c === null) throw new Error('section 6 did not run');

    // (a) THE MOMENT ITSELF. One boundary, one lift, and the player is on the
    //     far side of it. `liftAppearances` counts how many times the lifting
    //     class ENTERED the DOM over the whole 26 s run — sampled throughout,
    //     not read at the end — so it can see a welcome that never played and a
    //     welcome that played twice, neither of which is visible in a final
    //     state.
    check('a window that is refused and then let in shows the boundary exactly once',
      c.edgeAppearances === 1, c.edgeAppearances);
    check('...and the boundary LIFTS — the moment is played, not skipped',
      c.liftAppearances === 1, c.liftAppearances);
    // NOT TWICE, AND THIS IS THE HALF THE COUNT ABOVE IS FOR. After the vouch
    // lands, every remaining write in the run is also accepted — at the 8 s
    // keep-alive, that is two or three more inside this settle, and each of
    // them arrives as an `onWrite(null)` identical to the one that opened the
    // door. A welcome that replayed on any of them would read 3 or 4 here.
    check('...and it is not played again by any of the accepted writes that follow',
      c.liftAppearances === 1 && c.submitted.length >= 4,
      { lifts: c.liftAppearances, writes: c.submitted.length });
    check('...and the boundary is gone by the end — the moment ends on its own',
      c.edgeAtEnd === false, c.edgeAtEnd);

    // (b) THE ANSWER IS ACTED ON, NOT NOTICED LATER. Plan 4b's failure was a
    //     180 s client deadline against a 200 s answer; the opposite failure —
    //     a client that polls, or waits for the next refetch, or lifts on the
    //     write AFTER the accepted one — would show up as a gap of seconds
    //     here. The bar is derived: `MIN_EMIT_GAP_MS` is the soonest this
    //     window could possibly write again, so anything at or over it means
    //     the yes was not what did this.
    check('...within a moment of the node saying yes, not on some later write',
      c.msFromAcceptToLift >= 0 && c.msFromAcceptToLift < MIN_EMIT_GAP_MS,
      { msFromAcceptToLift: c.msFromAcceptToLift, MIN_EMIT_GAP_MS });

    // (c) THE SECOND SOCKET IS NOT A LEAK — reported as an open question by
    //     Task 1 and judged either way by nobody. A window whose standing
    //     changes rebuilds its sea, so two sockets are opened in this run and
    //     that number alone says nothing. What settles it is that they were
    //     never both alive: React's effect cleanup stops the old sea before the
    //     next effect builds the new one, so the peak is one. A client that let
    //     the old one run would hold two live subscriptions on the player's
    //     node for the rest of the session.
    //     THE NUMBER IS THREE, NOT TWO, AND I EXPECTED TWO. A sea is rebuilt on
    //     every change of the effect's deps, and this window has three: the
    //     shell configuration arriving, the edge going up, the edge coming
    //     down. Task 1 measured two for a window that was refused and stayed
    //     refused, which is the same rule with one fewer change. Written down
    //     rather than smoothed over, because the count is only interesting
    //     beside the two checks under it.
    check('the crossing rebuilds the sea — three sockets over the run',
      c.sockets === 3, c.sockets);
    check('...but never two at once: the old one is shut before the new one opens',
      c.maxSocketsOpen === 1, c.maxSocketsOpen);
    check('...and every socket this window opened was closed',
      c.socketsClosed === c.sockets, { opened: c.sockets, closed: c.socketsClosed });
    // NON-DEGENERACY: a window that never crossed opens one and closes one, so
    // the numbers above are about the rebuild rather than about teardown.
    const plain = await observe({ awaitWrite: true, settleMs: 800 });
    check('NON-DEGENERACY: a window that never crossed opens one socket and closes it',
      plain.sockets === 1 && plain.socketsClosed === 1 && plain.maxSocketsOpen === 1, plain);

    // =====================================================================
    // (d) NOT ON `unreachable`. The player is refused once — really, with
    //     -32015 — and then the node is gone: every call rejects at the
    //     transport, the way a dropped wifi does. The window keeps writing and
    //     keeps failing, and the boundary must still be there at the end.
    //
    //     THE NON-DEGENERACY IS THE POINT OF THE SCENARIO. "The edge is still
    //     up" is trivially true for a window that never got past its first
    //     refusal, so the run has to be shown to have ATTEMPTED writes after
    //     the node stopped answering — those attempts are what a broadened
    //     trigger would have swallowed, one welcome each.
    const gone = await observe({ thenUnreachable: 1, awaitWrite: true, settleMs: 22_000 });
    check('NON-DEGENERACY: the unreachable window really wrote again after the refusal',
      gone.submitted.length >= 3, gone.submitted.length);
    check('a node that vanishes is NOT a welcome — the boundary is still up',
      gone.edgeAtEnd === true, gone.edgeAtEnd);
    check('...and the moment never played at all', gone.liftAppearances === 0, gone.liftAppearances);
    check('...and the player is still swimming the shallows, not the open water',
      vectorsOf(gone).some((v) => from(v, SHALLOWS_SPAWN)), vectorsOf(gone));

    // (e) NOR ON `unknown`. A second, independent shape: the node answers
    //     perfectly well and says no to a different question (-32010
    //     PowInvalid). A client that had special-cased transport failures alone
    //     would pass (d) and fail here.
    const wrong = await observe({ thenUnknown: 1, awaitWrite: true, settleMs: 22_000 });
    check('NON-DEGENERACY: the PowInvalid window really wrote again after the refusal',
      wrong.submitted.length >= 3, wrong.submitted.length);
    check('a write that failed for another reason is NOT a welcome either',
      wrong.edgeAtEnd === true, wrong.edgeAtEnd);
    check('...and the moment never played at all', wrong.liftAppearances === 0, wrong.liftAppearances);
  }

  // =======================================================================
  console.log('\n8. THE KNOCK: it neither spins nor sleeps, and it survives\n'
    + '   being closed');
  // =======================================================================
  {
    // (a) THE CADENCE, over a window that is refused for its whole life.
    //
    // Two failures are possible here and they are opposite. A client that
    // backed OFF — the obvious reaction to a node saying no over and over —
    // would let a player who was vouched for sit at the boundary for however
    // long the back-off had grown to, which is precisely plan 4b's 200-second
    // answer arriving after everyone stopped listening. A client that sped UP
    // would crowd a per-space mempool budget that every swimmer shares, at the
    // one moment the node has said it wants fewer writes from us.
    //
    // So the claim is that the cadence is UNCHANGED by being refused, and it is
    // measured against the two constants that define it, imported rather than
    // typed. Neither bound is a number read back out of the client.
    //
    // MEASURED ON `vec.t`, the instants the writes themselves carry, because
    // every write is mined before it is sent and arrival times are a check
    // against Argon2id's mood. The settle is long enough for four gaps, so a
    // back-off would have to be visible as growth rather than inferred from one
    // interval.
    //
    // THE BOUNDS ARE A TOLERANCE ON THE KEEP-ALIVE, NOT A CORRIDOR BETWEEN THE
    // TWO CONSTANTS. They used to be `MAX + MIN` (11 s) as a ceiling and `MIN`
    // (3 s) as a floor, against a real cadence of 8 s — honest, but loose enough
    // that a 1.25x back-off (10 s, a whole extra keep-alive of a player who has
    // already been vouched for sitting outside) passed both untouched, which is
    // the regression this section exists to catch (plan 4c task 2 review, M-3).
    // The claim is an EQUALITY with the keep-alive, so the check is one too.
    //
    // A tenth of the keep-alive is 800 ms against a measured jitter of a few ms
    // — the gaps come off `vec.t`, stamped when the emit is DECIDED rather than
    // when the write lands, so mining and network time are not in them — which
    // is ~100x the noise and still fails a 10 s cadence by 1.2 s.
    const CADENCE_TOLERANCE_MS = MAX_EMIT_GAP_MS / 10;
    const mean = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

    const long = await observe({ writesRefused: true, awaitWrite: true, settleMs: 34_000 });
    const ts = vectorsOf(long).map((v) => v.t);
    const gaps = ts.slice(1).map((t, i) => t - ts[i]);
    check('NON-DEGENERACY: a whole session of refusal produced enough writes to have a cadence',
      gaps.length >= 4, { writes: ts.length, gaps });
    check('IT DOES NOT SLEEP: refused every time, it still never goes quiet for '
      + 'longer than the keep-alive',
      gaps.length > 0 && Math.max(...gaps) <= MAX_EMIT_GAP_MS + CADENCE_TOLERANCE_MS,
      { gaps, MAX_EMIT_GAP_MS, CADENCE_TOLERANCE_MS });
    check('IT DOES NOT SPIN: nor does it write faster than the floor every other '
      + 'swimmer is held to',
      gaps.length > 0 && Math.min(...gaps) >= MIN_EMIT_GAP_MS, { gaps, MIN_EMIT_GAP_MS });
    // AND THE CADENCE IS THE KEEP-ALIVE ITSELF, which is the claim the two
    // bounds only fence in. Averaged over the whole run, so a single delayed
    // tick cannot fail it and a back-off cannot hide inside it: a client that
    // stretched every other gap would read halfway between 8 s and its new
    // cadence here, and every stretch big enough to matter is bigger than
    // 800 ms.
    check('...and the cadence it keeps IS the keep-alive, not merely inside the bounds',
      Math.abs(mean(gaps) - MAX_EMIT_GAP_MS) <= CADENCE_TOLERANCE_MS,
      { mean: mean(gaps), MAX_EMIT_GAP_MS, CADENCE_TOLERANCE_MS, gaps });
    // AND IT IS THE SAME CADENCE AN ACCEPTED PLAYER KEEPS. The claims above are
    // about one window against a constant; this is one window against another,
    // and it is what says the knock costs the network and the player's machine
    // exactly what playing costs.
    //
    // TWO MEASUREMENTS OF THE SAME EMITTER CAN BE HELD FAR TIGHTER THAN EITHER
    // CAN BE HELD TO A NUMBER: both windows run the same keep-alive on the same
    // machine in the same minute, so they agree to milliseconds. A quarter of a
    // second is generous for that and still catches a 3% divergence — a
    // back-off applied only to the refused window has nowhere to hide.
    const SAME_CADENCE_MS = 250;
    const accepted = await observe({ awaitWrite: true, settleMs: 34_000 });
    const acceptedTs = vectorsOf(accepted).map((v) => v.t);
    const acceptedGaps = acceptedTs.slice(1).map((t, i) => t - acceptedTs[i]);
    check('...and it is the cadence a player the water accepted keeps, write for write',
      Math.abs(acceptedTs.length - ts.length) <= 1,
      { refused: ts.length, accepted: acceptedTs.length, refusedGaps: gaps, acceptedGaps });
    check('...gap for gap, and not merely write for write',
      acceptedGaps.length > 0 && Math.abs(mean(gaps) - mean(acceptedGaps)) <= SAME_CADENCE_MS,
      { refusedMean: mean(gaps), acceptedMean: mean(acceptedGaps), SAME_CADENCE_MS });

    // (a2) AND IT SURVIVES A WINDOW THAT HAS STOPPED BEING RENDERED.
    //
    // Every claim above is about a window that is drawing frames, because every
    // write this client makes is authored inside `requestAnimationFrame`.
    // Throttling is survivable and was measured to be — a window rendering once
    // a second or once every five still reaches its keep-alive on time — but a
    // MINIMISED, fully occluded or backgrounded window does not render at all,
    // and rAF stops rather than slows. Measured before the backstop existed:
    // ONE write, and none after the halt, over sixty seconds.
    //
    // It heals on the next rendered frame, so it is not the permanent lockout.
    // It is still the wrong player to do it to: the shallows is an hours-long
    // waiting room, and the person waiting to be let in is exactly the one who
    // minimises the window — they come back an hour later still outside, having
    // been accepted forty minutes earlier, because the write that would have
    // told them was never attempted.
    //
    // NO CHECK ABOVE CAN SEE THIS. They all watch writes accumulate, and they
    // all keep passing under any frame rate above zero. `haltFramesAfterWrites`
    // is the only knob that produces the state, and it produces it exactly: the
    // shim stops scheduling, so the frame loop's own re-arm finds nothing to run
    // it again. The window is torn down normally at the end, so this is not a
    // frozen process — only an unpainted one.
    const halted = await observe({
      writesRefused: true, awaitWrite: true, haltFramesAfterWrites: 1, settleMs: 30_000,
    });
    const afterHalt = halted.submitted.length - 1;
    check('CONTROL: the halt really did stop the frames — this window has not painted for 20 s',
      halted.msSinceLastFrame >= 20_000, halted.msSinceLastFrame);
    check('IT KEEPS KNOCKING WITH THE WINDOW MINIMISED — writes go out with no frames at all',
      afterHalt >= 2, { writes: halted.submitted.length, afterHalt });
    // ...on the backstop's own deadline, which is deliberately LATER than the
    // keep-alive so it can never fire beside a frame loop that is working. Two
    // knocks in a thirty-second settle is 11 s apart, not 8; anything at 8 here
    // would mean the two paths are racing, and the cadence checks above are
    // what would catch that in a window that renders.
    const haltedTs = vectorsOf(halted).map((v) => v.t);
    const haltedGaps = haltedTs.slice(1).map((t, i) => t - haltedTs[i]);
    check('...on the backstop deadline rather than the keep-alive, so the two never race',
      haltedGaps.length > 0 && Math.min(...haltedGaps) >= KNOCK_BACKSTOP_MS,
      { haltedGaps, KNOCK_BACKSTOP_MS });

    // (a3) AND IT SURVIVES THE MACHINE'S CLOCK STEPPING BACKWARDS.
    //
    // NTP correcting a laptop that had drifted forward, a wake from sleep,
    // timezone tooling: the wall clock jumps back, and every rule that measures
    // "how long since the last write" by subtracting two `Date.now()` readings
    // reads a NEGATIVE gap and answers "not yet" for as long as real time takes
    // to catch the step back up. THE STEP IS UNBOUNDED, so the stall is too.
    // Measured against this client before the fix: a ten-minute step gave ONE
    // write where the control made five.
    //
    // The knock is measured on `performance.now()` now, which no correction can
    // move (`nodeWriteDue`, `knockBackstopDue`). Ten minutes is chosen because
    // it is far longer than any settle here: a client still measuring elapsed
    // time on the wall clock cannot pass this by waiting.
    const stepped = await observe({
      writesRefused: true, awaitWrite: true, stepClockBackMs: 600_000, settleMs: 26_000,
    });
    check('IT SURVIVES A BACKWARDS CLOCK STEP — ten minutes back, and it keeps knocking',
      stepped.submitted.length >= 3, stepped.submitted.length);
    // NON-DEGENERACY: the step really happened, and it really did move the
    // instants the writes carry. Without this the check above would pass on any
    // window that simply ignored the scenario.
    const steppedTs = vectorsOf(stepped).map((v) => v.t);
    check('...having really been stepped: the writes are dated before the run began',
      steppedTs.length > 1 && steppedTs[steppedTs.length - 1] < steppedTs[0],
      steppedTs.map((t) => t - steppedTs[0]));

    // (b) A SLOW YES SURVIVES THE APP BEING CLOSED.
    //
    // Two windows, one after the other, which is what a restart is: the first
    // is refused for its whole life and ends at the boundary; the vouch lands
    // while nothing is running; the second opens against a node that accepts.
    //
    // NOTHING IS CARRIED BETWEEN THEM AND THAT IS THE MECHANISM, not a gap in
    // it. The standing is never written down, so the second window claims
    // nothing, writes on its first frame and is simply in the water. What would
    // fail here is a client that cached "at the edge" — it would show the
    // boundary to a player who was let in an hour ago, and go on showing it
    // until a write happened to correct it.
    const before = await observe({ writesRefused: true, awaitWrite: true, settleMs: 1_500 });
    check('CONTROL: the window that was closed really was at the boundary',
      before.edgeAppearances === 1 && before.edgeAtEnd === true, before.edgeAppearances);
    const after = await observe({ awaitWrite: true, settleMs: 1_500 });
    check('...and the one that opens after the vouch is in the water from the first frame',
      after.edgeAppearances === 0, after.edgeAppearances);
    check('...never seeing the boundary at all, not even for a frame',
      after.edgeAtEnd === false && after.edgeLine === null, after);
    // AND NO CEREMONY. A player who never waited is not shown a welcome; the
    // moment belongs to the wait it ends.
    check('...and no moment is played for a wait that happened while they were away',
      after.liftAppearances === 0, after.liftAppearances);
    check('...and they swim the open water, never the shallows',
      vectorsOf(after).some((v) => from(v, SEA_SPAWN))
      && vectorsOf(after).every((v) => !from(v, SHALLOWS_SPAWN)), vectorsOf(after));
  }


  console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
  process.exit(failures === 0 ? 0 : 1);
}

await main();
