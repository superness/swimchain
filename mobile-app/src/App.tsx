import { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import './App.css';

interface NodeStatus {
  running: boolean;
  state: string;
  peers: number;
  chain_height: number;
  sync_percent: number;
  uptime_seconds: number;
  error: string | null;
}

export default function App() {
  const [status, setStatus] = useState<NodeStatus | null>(null);
  const [rpcAuth, setRpcAuth] = useState<string | null>(null);
  const [rpcEndpoint, setRpcEndpoint] = useState<string | null>(null);
  const [nodeAddress, setNodeAddress] = useState<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Poll node status every 2s.
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const s = await invoke<NodeStatus>('node_status');
        if (alive) setStatus(s);
      } catch {
        /* backend still booting */
      }
    };
    tick();
    const t = setInterval(tick, 2000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  // Once the node reports running, fetch RPC endpoint + cookie auth + the
  // node identity address (desktop parity: without nodeAddress the feed
  // falls into browser-identity mode and mines its own keypair).
  useEffect(() => {
    if (!status?.running || rpcAuth) return;
    (async () => {
      const endpoint = await invoke<string>('get_rpc_endpoint');
      const auth = await invoke<string>('get_rpc_auth');
      const address = await invoke<string>('get_node_address');
      setRpcEndpoint(endpoint);
      setRpcAuth(auth);
      setNodeAddress(address);
    })().catch(console.error);
  }, [status, rpcAuth]);

  // Hand RPC config to the feed iframe - same SWIMCHAIN_RPC_CONFIG postMessage
  // contract as desktop-app's ClientFrame (send on load + retry for 10s in
  // case the client's listener mounts after the load event).
  useEffect(() => {
    if (!rpcAuth || !rpcEndpoint) return;
    const iframe = iframeRef.current;
    if (!iframe) return;
    const send = () =>
      iframe.contentWindow?.postMessage(
        {
          type: 'SWIMCHAIN_RPC_CONFIG',
          rpcEndpoint,
          rpcAuth,
          ...(nodeAddress ? { nodeAddress } : {}),
        },
        window.location.origin
      );
    iframe.addEventListener('load', send);
    send();
    const interval = setInterval(send, 1000);
    const timeout = setTimeout(() => clearInterval(interval), 10000);
    return () => {
      iframe.removeEventListener('load', send);
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [rpcAuth, rpcEndpoint, nodeAddress]);

  return (
    <div className="shell">
      <header className="status-strip">
        {status?.error ? (
          <span className="err">node error: {status.error}</span>
        ) : status?.running ? (
          <span>
            {status.state} · {status.peers} peers · height {status.chain_height} ·{' '}
            {Math.round(status.sync_percent)}%
          </span>
        ) : (
          <span>starting node… (first launch creates your identity)</span>
        )}
      </header>
      {rpcAuth && rpcEndpoint ? (
        <iframe
          ref={iframeRef}
          className="client-frame"
          src="clients/feed-client/index.html"
          title="feed"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
        />
      ) : (
        <div className="boot">waiting for node…</div>
      )}
    </div>
  );
}
