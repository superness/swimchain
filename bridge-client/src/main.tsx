/**
 * Swimchain Bridge Client - Entry Point
 *
 * Specialized client for Matrix/IRC integration.
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import { SwimchainProvider } from '@swimchain/react';
import { RpcProvider } from './hooks/useRpc';
import { ErrorBoundary } from './components/ErrorBoundary';
import { LoadingScreen } from './components/Loading';
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
          <App />
        </RpcProvider>
      </SwimchainProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
