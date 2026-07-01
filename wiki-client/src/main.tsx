/**
 * Swimchain Wiki Client - Entry Point
 *
 * Collaborative knowledge base built on the Swimchain decentralized network.
 * Spaces become wiki namespaces. Posts become wiki pages.
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import { SwimchainProvider, WaveLoader } from '@swimchain/frontend';
import { RpcProvider } from './hooks/useRpc';
import { ErrorBoundary } from './components/ErrorBoundary';
import { App } from './App';
import './styles/wiki.css';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Root element not found');
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <SwimchainProvider
        fallback={<WaveLoader fullScreen size="large" text="Loading Swimchain Wiki..." />}
        onLoad={() => console.log('Swimchain WASM loaded')}
        onError={(err) => console.error('WASM initialization failed:', err)}
      >
        <RpcProvider>
          <App />
        </RpcProvider>
      </SwimchainProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
