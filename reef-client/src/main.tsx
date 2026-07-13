import React from 'react';
import ReactDOM from 'react-dom/client';
import { SwimchainProvider, RpcProvider } from '@swimchain/react';
import { App } from './App';
import './styles.css';

const root = document.getElementById('root');
if (!root) throw new Error('root element missing');

// Point at a remote node RPC (via the whitelisting proxy) when hosted, else the
// local testnet node in dev.
const endpoint = (import.meta.env.VITE_RPC_ENDPOINT as string | undefined)?.trim();
const rpcConfig = endpoint ? { endpoint, timeout: 30000 } : undefined;

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <SwimchainProvider fallback={<div className="center muted">Loading crypto…</div>}>
      <RpcProvider config={rpcConfig}>
        <App />
      </RpcProvider>
    </SwimchainProvider>
  </React.StrictMode>
);
