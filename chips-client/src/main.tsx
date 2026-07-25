import React, { useState } from 'react';
import ReactDOM from 'react-dom/client';
import { SwimchainProvider, RpcProvider } from '@swimchain/react';
import { App } from './App';
import { RPC_URL } from './lib/host';
import './styles.css';

const root = document.getElementById('root');
if (!root) throw new Error('root element missing');

// The endpoint is baked at build time (see lib/host.ts). A build with no
// endpoint must NOT quietly fall back to localhost — createBrowserHost throws
// on that and App renders the reason, which is the behaviour Task 11 relies on.
const rpcConfig = RPC_URL ? { endpoint: RPC_URL, timeout: 30000 } : undefined;

/**
 * SwimchainProvider keeps rendering its `fallback` forever if WASM fails to
 * load — it records the error internally and never surfaces it, so a broken
 * crypto load looks exactly like a slow one (a blank screen with a clean
 * console). Owning the error here turns that into a visible failure.
 */
function Root() {
  const [wasmError, setWasmError] = useState<Error | null>(null);
  return (
    <SwimchainProvider
      onError={setWasmError}
      fallback={
        wasmError
          ? <div className="boot bad">the fryer will not light — {wasmError.message}</div>
          : <div className="boot">the lights are coming on…</div>
      }
    >
      <RpcProvider config={rpcConfig}>
        <App />
      </RpcProvider>
    </SwimchainProvider>
  );
}

const reactRoot = ReactDOM.createRoot(root);

// StrictMode is deliberate, not incidental: it double-invokes effects, which is
// the cheapest continuous test that useFryers' worker teardown really releases
// every worker it created (a leaked one burns a core at 8 MiB a hash, forever).
reactRoot.render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);

// DEV-only handle so the worker lifecycle can be verified in a real browser
// (unmount must terminate every fryer). Statically dropped from production.
if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).__chipsRoot = reactRoot;
}
