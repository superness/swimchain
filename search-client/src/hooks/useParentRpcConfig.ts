/**
 * Hook to receive RPC config from parent frame (desktop-app wrapper)
 *
 * When running inside the desktop-app iframe, the parent sends:
 * {
 *   type: 'SWIMCHAIN_RPC_CONFIG',
 *   rpcEndpoint: 'http://127.0.0.1:19736',
 *   rpcAuth: 'Basic ...'
 * }
 */

import { useState, useEffect } from 'react';

interface ParentRpcConfig {
  rpcEndpoint: string;
  rpcAuth: string;
}

// Global storage for parent config (persists across hook instances)
let parentConfig: ParentRpcConfig | null = null;
let listeners: Array<(config: ParentRpcConfig | null) => void> = [];

// Allowed parent origins for postMessage security
// Only accept RPC config from trusted origins
const ALLOWED_PARENT_ORIGINS: string[] = [
  'http://localhost:1420',      // Tauri dev
  'http://127.0.0.1:1420',      // Tauri dev alt
  'tauri://localhost',          // Tauri production
  'https://app.swimchain.io',   // Production web app
];

// Set up message listener once
if (typeof window !== 'undefined') {
  window.addEventListener('message', (event) => {
    // Security: Validate origin before accepting config
    if (!ALLOWED_PARENT_ORIGINS.includes(event.origin)) {
      console.warn('[ParentConfig] Rejected message from untrusted origin:', event.origin);
      return;
    }

    if (event.data?.type === 'SWIMCHAIN_RPC_CONFIG') {
      console.log('[ParentConfig] Received RPC config from parent:', {
        endpoint: event.data.rpcEndpoint,
        hasAuth: !!event.data.rpcAuth,
        origin: event.origin,
      });

      parentConfig = {
        rpcEndpoint: event.data.rpcEndpoint,
        rpcAuth: event.data.rpcAuth,
      };

      // Notify all listeners
      listeners.forEach(fn => fn(parentConfig));
    }
  });
}

/**
 * Hook to get RPC config from parent frame
 * Returns null if not running in iframe or config not yet received
 */
export function useParentRpcConfig(): ParentRpcConfig | null {
  const [config, setConfig] = useState<ParentRpcConfig | null>(parentConfig);

  useEffect(() => {
    // Subscribe to config updates
    const listener = (newConfig: ParentRpcConfig | null) => {
      setConfig(newConfig);
    };
    listeners.push(listener);

    // Return current config if already set
    if (parentConfig && !config) {
      setConfig(parentConfig);
    }

    return () => {
      listeners = listeners.filter(fn => fn !== listener);
    };
  }, [config]);

  return config;
}

/**
 * Check if running inside an iframe
 */
export function isInIframe(): boolean {
  try {
    return window.self !== window.top;
  } catch {
    // Cross-origin iframe
    return true;
  }
}

/**
 * Get parent config synchronously (for use outside React)
 */
export function getParentConfig(): ParentRpcConfig | null {
  return parentConfig;
}
