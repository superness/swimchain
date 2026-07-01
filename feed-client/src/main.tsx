/**
 * Swimchain Feed Client - Entry Point
 *
 * Social media-style feed client for Swimchain.
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import { SwimchainProvider } from './providers/SwimchainProvider';
import { ErrorBoundary } from './components/ErrorBoundary';
import { LoadingScreen } from './components/Loading';
import { RpcProvider } from './hooks/useRpc';
import { NodeIdentityProvider } from './hooks/useNodeIdentity';
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
        fallback={<LoadingScreen />}
        onLoad={() => console.log('Swimchain WASM loaded successfully')}
        onError={(err) => console.error('WASM initialization failed:', err)}
      >
        <RpcProvider>
          <NodeIdentityProvider>
            <App />
          </NodeIdentityProvider>
        </RpcProvider>
      </SwimchainProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
