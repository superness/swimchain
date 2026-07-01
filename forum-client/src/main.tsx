/**
 * Swimchain Forum Client - Entry Point
 *
 * Reference implementation of a Swimchain forum client.
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import { SwimchainProvider } from './providers/SwimchainProvider';
import { ErrorBoundary } from './components/ErrorBoundary';
import { LoadingScreen } from './components/Loading';
import { RpcProvider } from './hooks/useRpc';
import { NodeIdentityProvider } from './hooks/useNodeIdentity';
import { App } from './App';
import { logger } from './lib/logger';
import './styles/globals.css';

// Log startup IMMEDIATELY with full environment info
const startupInfo = {
  timestamp: new Date().toISOString(),
  href: window.location.href,
  origin: window.location.origin,
  pathname: window.location.pathname,
  isIframe: window.self !== window.top,
  parentOrigin: window.self !== window.top ? 'in-iframe' : 'top-level',
  userAgent: navigator.userAgent,
  platform: navigator.platform,
};
logger.info(`===== FORUM CLIENT STARTED ===== ${JSON.stringify(startupInfo)}`);

// Global error handler - catches uncaught errors
window.onerror = (message, source, lineno, colno, error) => {
  logger.error(`UNCAUGHT ERROR: ${message} at ${source}:${lineno}:${colno}`, error);
};

// Unhandled promise rejection handler
window.onunhandledrejection = (event) => {
  logger.error(`UNHANDLED REJECTION:`, event.reason);
};

const rootElement = document.getElementById('root');

if (!rootElement) {
  logger.error('CRITICAL: Root element not found!');
  throw new Error('Root element not found');
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <SwimchainProvider
        fallback={<LoadingScreen />}
        onLoad={() => logger.info('WASM modules loaded successfully')}
        onError={(err) => logger.error('WASM initialization failed:', err)}
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
