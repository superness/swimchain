const { invoke } = window.__TAURI__.core;
const iframe = document.getElementById('client');

async function pushConfig() {
  try {
    const cfg = await invoke('get_rpc_config');
    iframe.contentWindow?.postMessage({
      type: 'SWIMCHAIN_RPC_CONFIG',
      rpcEndpoint: cfg.endpoint,
      rpcAuth: cfg.auth,
      nodeAddress: cfg.nodeAddress,
      nodeDisplayName: cfg.nodeDisplayName,
    }, '*');
  } catch (e) {
    console.warn('[app-shell] node not ready:', e);
  }
}
// Client asks for config on load; also push every 1s for 10s like the desktop shell.
iframe.addEventListener('load', pushConfig);
let n = 0; const t = setInterval(() => { pushConfig(); if (++n >= 10) clearInterval(t); }, 1000);
