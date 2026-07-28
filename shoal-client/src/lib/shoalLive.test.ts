/**
 * The live channel's pure decision function. Run: npx tsx src/lib/shoalLive.test.ts
 *
 * Everything here drives `nextAction` directly with a hand-advanced `nowMs`
 * clock — no timers, no sockets, no `Date.now()` (see the plan's global
 * constraints: `nextAction` takes `nowMs` as a parameter and is pure).
 * `startLive` (the thin driver that owns a real socket and real timers) is
 * deliberately not exercised here — see shoalLive.ts's module header for
 * why, matching shoalRoom.ts's `fetchRoomLog` precedent.
 *
 * Expected numbers for the reconnect backoff are computed BY HAND in the
 * comments next to each assertion, from the formula documented in
 * shoalLive.ts (`RECONNECT_BASE_MS=500, doubling, +((attempt*37)%100)
 * jitter, capped at RECONNECT_MAX_MS=16_000`) — never by calling
 * `reconnectDelayMs` itself (it isn't exported, precisely so a test can't
 * accidentally compare the function to itself).
 */
import { createLiveMachine, nextAction, type LiveEvent, type LiveMachine } from './shoalLive';

let failures = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) console.log(`  ok  ${name}`);
  else { failures++; console.log(`FAIL  ${name}${extra !== undefined ? '  ' + JSON.stringify(extra) : ''}`); }
}

const SPACE = 'sp1ourroomspace';
const OTHER_SPACE = 'sp1someotherspace';
const POLL_MS = 4000;

function main() {
  // --- createLiveMachine: initial shape -------------------------------------------
  {
    const m = createLiveMachine(SPACE, POLL_MS, 1_000);
    check('starts in connecting', m.state === 'connecting', m);
    check('carries the given spaceId', m.spaceId === SPACE, m);
    check('carries the given pollIntervalMs', m.pollIntervalMs === POLL_MS, m);
    check('starts with attempt 0', m.attempt === 0, m);
    check('starts with lastLiveMs at creation time', m.lastLiveMs === 1_000, m);
  }

  // --- Socket open: connecting -> live, backoff reset, silence clock reset ---------
  {
    const m0 = createLiveMachine(SPACE, POLL_MS, 1_000);
    const r = nextAction(m0, { type: 'open' }, 1_050);
    check('open moves connecting -> live', r.state === 'live', r);
    check('open resets attempt to 0', r.attempt === 0, r);
    check('open sets lastLiveMs to nowMs', r.lastLiveMs === 1_050, r);
    check('open does not itself request a refetch', r.refetch === false, r);
  }

  // --- content_new for OUR space triggers a refetch ---------------------------------
  {
    const live: LiveMachine = { state: 'live', spaceId: SPACE, pollIntervalMs: POLL_MS, attempt: 0, lastLiveMs: 1_000 };
    const r = nextAction(live, { type: 'content', spaceId: SPACE }, 1_200);
    check('content_new for our space triggers a refetch', r.refetch === true, r);
    check('state stays live', r.state === 'live', r);
    check('lastLiveMs advances to nowMs (proof the pipe is alive)', r.lastLiveMs === 1_200, r);
  }

  // --- content_new for a DIFFERENT space does not trigger a refetch ----------------
  {
    const live: LiveMachine = { state: 'live', spaceId: SPACE, pollIntervalMs: POLL_MS, attempt: 0, lastLiveMs: 1_000 };
    const r = nextAction(live, { type: 'content', spaceId: OTHER_SPACE }, 1_200);
    check('content_new for a different space does NOT trigger a refetch (the space filter)', r.refetch === false, r);
    check('but it still updates lastLiveMs (the pipe itself is proven alive)', r.lastLiveMs === 1_200, r);
  }

  // --- Socket error/close moves to polling and schedules increasing, capped backoff ---
  // Hand-computed via shoalLive.ts's documented formula:
  //   attempt 1: 500*2^0 + (1*37)%100  =  500+37  =  537
  //   attempt 2: 500*2^1 + (2*37)%100  = 1000+74  = 1074
  //   attempt 3: 500*2^2 + (3*37)%100  = 2000+11  = 2011   (111 % 100 = 11)
  //   attempt 4: 500*2^3 + (4*37)%100  = 4000+48  = 4048   (148 % 100 = 48)
  //   attempt 5: 500*2^4 + (5*37)%100  = 8000+85  = 8085   (185 % 100 = 85)
  //   attempt 6: 500*2^5 + (6*37)%100  =16000+22  -> capped to 16000 (222%100=22, 16022>16000)
  //   attempt 7: 500*2^5 + (7*37)%100  =16000+59  -> capped to 16000 (259%100=59)
  //   attempt 8: 500*2^5 + (8*37)%100  =16000+96  -> capped to 16000 (296%100=96)
  const EXPECTED_DELAYS = [537, 1074, 2011, 4048, 8085, 16000, 16000, 16000];
  {
    let m: LiveMachine = createLiveMachine(SPACE, POLL_MS, 0);
    const delays: number[] = [];
    let t = 0;
    for (let i = 0; i < EXPECTED_DELAYS.length; i++) {
      t += 10;
      const r = nextAction(m, { type: 'disconnected' }, t);
      check(`failure #${i + 1} moves to polling`, r.state === 'polling', r);
      delays.push(r.delayMs);
      m = r; // carry forward, still polling
      t += 10;
      const rr = nextAction(m, { type: 'reconnect' }, t); // simulate the backoff timer firing
      check(`failure #${i + 1}: reconnect tick moves polling -> connecting`, rr.state === 'connecting', rr);
      m = rr; // now connecting again, ready for the next disconnected in the loop
    }

    check('reconnect delays match the hand-computed sequence exactly', JSON.stringify(delays) === JSON.stringify(EXPECTED_DELAYS), delays);
    check('delays strictly increase through the uncapped attempts (1..5)', delays[0] < delays[1] && delays[1] < delays[2] && delays[2] < delays[3] && delays[3] < delays[4], delays);
    check('delays are capped from attempt 6 onward (never exceed 16000)', delays.slice(5).every((d) => d <= 16_000), delays);
    check('capped delays equal the cap exactly', delays.slice(5).every((d) => d === 16_000), delays);
  }

  // --- A successful reconnect RESETS the backoff (the classic bug: growth-only) ----
  {
    let m: LiveMachine = createLiveMachine(SPACE, POLL_MS, 0);
    // First failure: attempt -> 1, delay 537 (hand-computed above).
    let r = nextAction(m, { type: 'disconnected' }, 10);
    check('first failure: attempt is 1', r.attempt === 1, r);
    const firstDelay = r.delayMs;
    check('first failure: delay is 537 (hand-computed)', firstDelay === 537, r);
    m = r;

    // Reconnect timer fires -> connecting.
    r = nextAction(m, { type: 'reconnect' }, 20);
    m = r;

    // This attempt SUCCEEDS.
    r = nextAction(m, { type: 'open' }, 30);
    check('successful reconnect resets attempt to 0', r.attempt === 0, r);
    m = r;

    // It drops again immediately. If the reset above didn't happen, this
    // would be attempt 2 (delay 1074) instead of attempt 1 (delay 537) again.
    r = nextAction(m, { type: 'disconnected' }, 40);
    check('second failure AFTER a successful reconnect: attempt is 1 again, not 2', r.attempt === 1, r);
    check('second failure AFTER a successful reconnect: delay equals the FIRST failure\'s delay exactly (backoff reset)', r.delayMs === firstDelay, { got: r.delayMs, expected: firstDelay });
  }

  // --- disconnected while already live also demotes to polling ---------------------
  {
    const live: LiveMachine = { state: 'live', spaceId: SPACE, pollIntervalMs: POLL_MS, attempt: 0, lastLiveMs: 1_000 };
    const r = nextAction(live, { type: 'disconnected' }, 1_500);
    check('a drop from live also moves to polling', r.state === 'polling', r);
    check('a drop from live is a first failure (attempt 1)', r.attempt === 1, r);
  }

  // --- A stray disconnected while already polling is a no-op (no double penalty) ---
  {
    const polling: LiveMachine = { state: 'polling', spaceId: SPACE, pollIntervalMs: POLL_MS, attempt: 3, lastLiveMs: 1_000 };
    const r = nextAction(polling, { type: 'disconnected' }, 1_500);
    check('a stray disconnected while already polling does not bump attempt again', r.attempt === 3, r);
    check('...and state stays polling', r.state === 'polling', r);
  }

  // --- A stale reconnect timer firing outside polling is a no-op -------------------
  {
    const live: LiveMachine = { state: 'live', spaceId: SPACE, pollIntervalMs: POLL_MS, attempt: 0, lastLiveMs: 1_000 };
    const r = nextAction(live, { type: 'reconnect' }, 1_500);
    check('a stale reconnect event while live does not force a state change', r.state === 'live', r);
  }

  // --- In polling, a tick schedules a refetch at the poll interval -----------------
  {
    const polling: LiveMachine = { state: 'polling', spaceId: SPACE, pollIntervalMs: POLL_MS, attempt: 2, lastLiveMs: 1_000 };
    const r = nextAction(polling, { type: 'tick' }, 5_000);
    check('a tick while polling always refetches', r.refetch === true, r);
    check('state stays polling', r.state === 'polling', r);
  }

  // --- Silence detection: a tick in live refetches once nothing has arrived for ----
  // --- longer than the poll interval, even though the socket never errored --------
  {
    const openedAt = 1_000;
    const live: LiveMachine = { state: 'live', spaceId: SPACE, pollIntervalMs: POLL_MS, attempt: 0, lastLiveMs: openedAt };

    // Exactly one interval later: NOT silence yet (the boundary tick is the
    // ordinary heartbeat cadence, not evidence anything is broken).
    const atBoundary = nextAction(live, { type: 'tick' }, openedAt + POLL_MS);
    check('tick exactly at the poll interval does not (yet) count as silence', atBoundary.refetch === false, atBoundary);

    // One ms past the interval: silence, refetch fires anyway.
    const pastBoundary = nextAction(live, { type: 'tick' }, openedAt + POLL_MS + 1);
    check('tick just past the poll interval DOES trigger a refetch (silence detection)', pastBoundary.refetch === true, pastBoundary);
    check('state is unchanged by silence detection alone (still live, no error occurred)', pastBoundary.state === 'live', pastBoundary);

    // Well within the interval: no refetch.
    const early = nextAction(live, { type: 'tick' }, openedAt + 100);
    check('a tick well within the poll interval does not trigger a refetch', early.refetch === false, early);

    // A content_new message (even off-topic) resets the silence clock, so a
    // tick shortly after does NOT count the ORIGINAL open as the baseline.
    const afterContent = nextAction(live, { type: 'content', spaceId: OTHER_SPACE }, openedAt + POLL_MS - 10);
    check('setup: off-topic content does not itself refetch', afterContent.refetch === false, afterContent);
    const tickAfterContent = nextAction(afterContent, { type: 'tick' }, openedAt + POLL_MS + 50);
    // 50ms after the ORIGINAL boundary, but only 60ms after the content
    // message reset the clock (POLL_MS - 10 -> +50 = 60ms since reset),
    // nowhere near POLL_MS (4000) since the reset — must NOT be silence.
    check('a message resets the silence clock: a tick soon after does not refetch even though it is past the ORIGINAL open+interval', tickAfterContent.refetch === false, tickAfterContent);
  }

  // --- stop() from any state reaches stopped, and stopped never schedules again ----
  {
    const starts: LiveMachine[] = [
      { state: 'connecting', spaceId: SPACE, pollIntervalMs: POLL_MS, attempt: 0, lastLiveMs: 0 },
      { state: 'live', spaceId: SPACE, pollIntervalMs: POLL_MS, attempt: 0, lastLiveMs: 0 },
      { state: 'polling', spaceId: SPACE, pollIntervalMs: POLL_MS, attempt: 4, lastLiveMs: 0 },
    ];
    for (const start of starts) {
      const stopped = nextAction(start, { type: 'stop' }, 9_000);
      check(`stop() from ${start.state} reaches stopped`, stopped.state === 'stopped', stopped);
      check(`stop() from ${start.state} never itself refetches`, stopped.refetch === false, stopped);
      check(`stop() from ${start.state} schedules nothing (delayMs 0)`, stopped.delayMs === 0, stopped);

      const events: LiveEvent[] = [
        { type: 'open' },
        { type: 'disconnected' },
        { type: 'content', spaceId: SPACE },
        { type: 'tick' },
        { type: 'reconnect' },
        { type: 'stop' },
      ];
      for (const ev of events) {
        const again = nextAction(stopped, ev, 20_000);
        check(`stopped + ${ev.type}: state stays stopped`, again.state === 'stopped', again);
        check(`stopped + ${ev.type}: never refetches`, again.refetch === false, again);
        check(`stopped + ${ev.type}: schedules nothing (delayMs 0)`, again.delayMs === 0, again);
      }
    }
  }

  console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
