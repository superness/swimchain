// Config handover + readiness gate for the incoming channel.
//
// Outbound: SWIMCHAIN_RPC_CONFIG posted with an EXACT targetOrigin — never
// '*' (spec §2.4). Existing clients accept same-origin messages, so the
// spike's own origin always passes their allowlist.
//
// Readiness (spec §2.2 seam rule): the static persists exactly until the
// incoming channel is painted. Signals, first one wins:
//   1. 'message'  — SWIMCHAIN_CHANNEL_READY from exactly this frame
//                   (no shipped client sends it yet; forward-compat)
//   2. 'dom-peek' — same-origin peek: the client's #root gained children,
//                   then one rAF (≈ first meaningful render)
// The spec's load+rAF fallback is for cross-origin channels only: load fires
// BEFORE React renders, so arming it here would expose an unpainted frame.
// Hard timeout → onTimeout → SIGNAL LOST card. Never a blank frame.

export function buildConfigMessage({ rpcEndpoint, rpcAuth, nodeAddress, nodeDisplayName }) {
  return {
    type: 'SWIMCHAIN_RPC_CONFIG',
    rpcEndpoint,
    rpcAuth,
    ...(nodeAddress ? { nodeAddress } : {}),
    ...(nodeDisplayName ? { nodeDisplayName } : {}),
  };
}

// Inbound filter (spec §2.2): a message counts only if it comes from exactly
// this frame's window at exactly the expected origin. No prefix matching.
export function isFromFrame(event, frameWindow, expectedOrigin) {
  return event.source === frameWindow && event.origin === expectedOrigin;
}

// Timer functions are injectable so tests control time.
export function createReadinessGate({ timeoutMs = 2000, onReady, onTimeout,
  setTimeoutFn = setTimeout, clearTimeoutFn = clearTimeout }) {
  let settled = false;
  const timer = setTimeoutFn(() => {
    if (!settled) { settled = true; onTimeout(); }
  }, timeoutMs);
  return {
    get settled() { return settled; },
    ready(via) {
      if (settled) return false;
      settled = true;
      clearTimeoutFn(timer);
      onReady(via);
      return true;
    },
    cancel() { settled = true; clearTimeoutFn(timer); },
  };
}

// DOM wiring. Returns the gate so the caller can cancel on flip-away.
export function watchReadiness(iframe, { timeoutMs = 2000, onReady, onTimeout, pollMs = 50 }) {
  let cleanup = () => {};
  const gate = createReadinessGate({
    timeoutMs,
    onReady: (via) => { cleanup(); onReady(via); },
    onTimeout: () => { cleanup(); onTimeout(); },
  });

  const onMsg = (e) => {
    if (e.data?.type === 'SWIMCHAIN_CHANNEL_READY'
      && isFromFrame(e, iframe.contentWindow, window.location.origin)) {
      gate.ready('message');
    }
  };
  window.addEventListener('message', onMsg);

  const peek = setInterval(() => {
    try {
      const root = iframe.contentDocument?.querySelector('#root');
      if (root && root.childElementCount > 0) {
        clearInterval(peek);
        requestAnimationFrame(() => gate.ready('dom-peek'));
      }
    } catch { /* cross-origin frame: only READY message or timeout apply */ }
  }, pollMs);

  cleanup = () => { window.removeEventListener('message', onMsg); clearInterval(peek); };
  const innerCancel = gate.cancel.bind(gate);
  gate.cancel = () => { cleanup(); innerCancel(); };
  return gate;
}
