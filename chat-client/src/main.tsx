/**
 * Swimchain Chat Client - Entry Point
 *
 * Discord-like real-time messaging experience.
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import { SwimchainProvider } from '@swimchain/frontend';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Loading } from './components/Loading';
import { RpcProvider } from './hooks/useRpc';
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
        fallback={<Loading fullScreen text="Loading Swimchain..." />}
        onLoad={() => console.log('Swimchain WASM loaded successfully')}
        onError={(err) => console.error('WASM initialization failed:', err)}
      >
        <RpcProvider>
          <App />
        </RpcProvider>
      </SwimchainProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
