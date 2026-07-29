// Instrumentation for the A0 decision. Everything a page can see:
// flip-to-paint, per-channel event-loop health (observed from INSIDE each
// same-origin frame's realm — no client changes), shell main-thread drift,
// renderer JS heap. The authoritative PSS number comes from adb (Task 7).

export function createFlipTimer(now = () => performance.now()) {
  let pending = null;
  const flips = [];
  const pct = (xs, p) => xs[Math.min(xs.length - 1, Math.max(0, Math.ceil(xs.length * p) - 1))];
  return {
    start(to, kind) { pending = { to, kind, t0: now() }; },
    end(via) {
      if (!pending) return null;
      const { to, kind, t0 } = pending;
      pending = null;
      const rec = { to, kind, via, ms: now() - t0 };
      flips.push(rec);
      return rec;
    },
    abort() { pending = null; },
    stats(kind) {
      const xs = flips.filter((f) => f.kind === kind).map((f) => f.ms).sort((a, b) => a - b);
      return xs.length
        ? { n: xs.length, median: pct(xs, 0.5), p95: pct(xs, 0.95), max: xs[xs.length - 1] }
        : null;
    },
    all: () => [...flips],
  };
}

export function createSink() {
  const channels = new Map(); // id -> mutable metrics record
  return {
    channel(id) {
      if (!channels.has(id)) {
        channels.set(id, { rafCount: 0, rafRate: 0, longtasks: 0, longtaskMs: 0 });
      }
      return channels.get(id);
    },
    dropChannel(id) { channels.delete(id); },
    entries: () => [...channels.entries()],
  };
}

// Runs inside the frame's realm via its own window object. Same-origin only.
export function attachFrameProbes(id, iframe, sink) {
  const w = iframe.contentWindow;
  if (!w) return;
  const ch = sink.channel(id);
  const beat = () => { ch.rafCount++; try { w.requestAnimationFrame(beat); } catch { /* frame gone */ } };
  try { w.requestAnimationFrame(beat); } catch { return; }
  let lastCount = 0;
  const rate = setInterval(() => {
    if (!iframe.isConnected) { clearInterval(rate); return; }
    ch.rafRate = ch.rafCount - lastCount;
    lastCount = ch.rafCount;
  }, 1000);
  try {
    new w.PerformanceObserver((list) => {
      for (const e of list.getEntries()) { ch.longtasks++; ch.longtaskMs += e.duration; }
    }).observe({ entryTypes: ['longtask'] });
  } catch { /* longtask unsupported: rAF rate still stands */ }
}

export function createHud(el, timer) {
  const sink = createSink();
  const notes = [];
  const startedAt = performance.now();
  let driftMax = 0, expected = performance.now() + 500;
  setInterval(() => { // shell main-thread starvation probe
    const t = performance.now();
    driftMax = Math.max(driftMax, t - expected);
    expected = t + 500;
  }, 500);
  setInterval(() => {
    if (el.hidden) return;
    const warm = timer.stats('warm'), cold = timer.stats('cold');
    const fmt = (s) => (s ? `n${s.n} med ${s.median.toFixed(0)} p95 ${s.p95.toFixed(0)} max ${s.max.toFixed(0)}` : '-');
    const heap = globalThis.performance?.memory
      ? (performance.memory.usedJSHeapSize / 1048576).toFixed(0) + 'MB' : '?';
    el.textContent = [
      `up ${((performance.now() - startedAt) / 60000).toFixed(1)}m  heap ${heap}  driftMax ${driftMax.toFixed(0)}ms`,
      `warm ${fmt(warm)}`,
      `cold ${fmt(cold)}`,
      ...sink.entries().map(([id, c]) =>
        `${id}: raf ${c.rafRate}/s  longtask ${c.longtasks} (${c.longtaskMs.toFixed(0)}ms)`),
      ...notes.slice(-3),
    ].join('\n');
  }, 1000);
  return {
    sink,
    // Stage-scoped drift gauge: G4 reads the max over ONE protocol stage, so
    // the operator resets it at stage start ('r' key). Lifetime-cumulative
    // would be latched by the first cold mount and fail G4 unconditionally.
    drift: {
      max: () => driftMax,
      reset() { driftMax = 0; expected = performance.now() + 500; },
    },
    toggle() { el.hidden = !el.hidden; },
    note(s) { notes.push(s); },
  };
}

export function exportResults(timer, hud) {
  const payload = {
    exportedAt: new Date().toISOString(),
    ua: navigator.userAgent,
    warm: timer.stats('warm'),
    cold: timer.stats('cold'),
    flips: timer.all(),
    channels: Object.fromEntries(hud.sink.entries()),
    driftMaxMs: hud.drift.max(),
    heapMB: globalThis.performance?.memory ? performance.memory.usedJSHeapSize / 1048576 : null,
  };
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
  a.download = 'surf-spike-results.json';
  a.click();
}
