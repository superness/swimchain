import React, { useState } from 'react';
import ReactDOM from 'react-dom/client';
import { SwimchainProvider, RpcProvider } from '@swimchain/react';
import { App } from './App';
import { RPC_URL } from './lib/config';
import './styles.css';

const root = document.getElementById('root');
if (!root) throw new Error('root element missing');

// The endpoint is baked at build time (see lib/config.ts). A build with no
// endpoint falls back to @swimchain/react's LOCAL_TESTNET dev default rather
// than throwing — RunANode/BrowserJoin themselves refuse to pretend a
// sponsor/space is configured (see IS_CONFIGURED), which is the visible
// failure mode a misconfigured build should have.
const rpcConfig = RPC_URL ? { endpoint: RPC_URL, timeout: 30000 } : undefined;

/**
 * SwimchainProvider keeps rendering its `fallback` forever if WASM fails to
 * load — it records the error internally and never surfaces it, so a broken
 * crypto load looks exactly like a slow one (a blank screen with a clean
 * console). Owning the error here turns that into a visible failure. Copied
 * from chips-client/src/main.tsx, which hit this first.
 */
function Root() {
  const [wasmError, setWasmError] = useState<Error | null>(null);
  return (
    <SwimchainProvider
      onError={setWasmError}
      fallback={
        wasmError
          ? <div className="boot bad">the gate will not open — {wasmError.message}</div>
          : <div className="boot">the lights are coming on…</div>
      }
    >
      <RpcProvider config={rpcConfig}>
        <App />
      </RpcProvider>
    </SwimchainProvider>
  );
}

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);
