/**
 * Swimchain Search Client - Entry Point
 *
 * Google-style search interface for the Swimchain network.
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import { SwimchainProvider, WaveLoader } from '@swimchain/frontend';
import { RpcProvider } from './hooks/useRpc';
import { ErrorBoundary } from './components/ErrorBoundary';
import { App } from './App';
import './styles/globals.css';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Root element not found');
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <SwimchainProvider
        fallback={<WaveLoader fullScreen size="large" text="Loading Swimchain..." />}
        onError={(err) => console.error('WASM initialization failed:', err)}
      >
        <RpcProvider>
          <App />
        </RpcProvider>
      </SwimchainProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
