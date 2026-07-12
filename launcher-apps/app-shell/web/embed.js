const { invoke } = window.__TAURI__.core;
const iframe = document.getElementById('client');

// JSON-RPC call to the node (cookie auth). Used to learn the node's identity so
// the embedded client can adopt it ("node mode").
async function nodeRpc(endpoint, auth, method, params) {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: auth },
    body: JSON.stringify({ jsonrpc: '2.0', method, params: params || {}, id: 1 }),
  });
  const j = await res.json();
  if (j.error) throw new Error(j.error.message || 'rpc error');
  return j.result;
}

async function pushConfig() {
  let cfg;
  try {
    cfg = await invoke('get_rpc_config');
  } catch (e) {
    console.warn('[app-shell] node not ready (no rpc config):', e);
    return;
  }
  // The embedded clients only adopt the NODE's identity ("node mode") when the
  // config carries a non-empty nodeAddress; without it they fall back to the
  // browser create-identity flow. get_rpc_config leaves these empty, so resolve
  // the node's identity here before forwarding the config.
  let nodeAddress = cfg.nodeAddress || '';
  let nodeDisplayName = cfg.nodeDisplayName || '';
  if (!nodeAddress) {
    try {
      const info = await nodeRpc(cfg.endpoint, cfg.auth, 'get_identity_info');
      nodeAddress = (info && info.address) || '';
      if (nodeAddress && !nodeDisplayName) {
        // Best-effort: the node's own display name, so the client shows it.
        try {
          const prof = await nodeRpc(cfg.endpoint, cfg.auth, 'get_user_profile', { user_id: nodeAddress });
          nodeDisplayName = (prof && (prof.display_name || prof.name)) || '';
        } catch (_) { /* no profile yet — name is optional */ }
      }
    } catch (e) {
      // Node identity not ready yet; the retry loop below re-pushes once it is.
      console.warn('[app-shell] node identity not ready:', e);
    }
  }
  iframe.contentWindow?.postMessage(
    {
      type: 'SWIMCHAIN_RPC_CONFIG',
      rpcEndpoint: cfg.endpoint,
      rpcAuth: cfg.auth,
      nodeAddress,
      nodeDisplayName,
    },
    window.location.origin,
  );
}
// Client asks for config on load; also push every 1s for 10s like the desktop shell,
// so a node identity that becomes ready slightly later still flips the client to node mode.
iframe.addEventListener('load', pushConfig);
let n = 0; const t = setInterval(() => { pushConfig(); if (++n >= 10) clearInterval(t); }, 1000);
