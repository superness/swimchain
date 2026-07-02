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

// Allowed origins for postMessage (only accept config from trusted sources)
// In production, this should be the exact origin of the desktop app wrapper
const ALLOWED_ORIGINS: string[] = [
  'http://localhost',       // Local development
  'http://127.0.0.1',       // Local development (IP)
  'tauri://localhost',      // Tauri desktop app
  'https://localhost',      // Local HTTPS development
];

/**
 * Check if an origin is allowed to send RPC config
 */
function isOriginAllowed(origin: string): boolean {
  // Allow same-origin (empty string means same origin in some browsers)
  if (!origin || origin === window.location.origin) {
    return true;
  }
  // Check against allowlist (match prefix for port variations)
  return ALLOWED_ORIGINS.some(allowed => origin.startsWith(allowed));
}

// Set up message listener once
if (typeof window !== 'undefined') {
  window.addEventListener('message', (event) => {
    // Validate origin before accepting any config
    if (!isOriginAllowed(event.origin)) {
      if (import.meta.env.DEV) {
        console.warn('[ParentConfig] Rejected message from untrusted origin:', event.origin);
      }
      return;
    }

    if (event.data?.type === 'SWIMCHAIN_RPC_CONFIG') {
      if (import.meta.env.DEV) {
        console.log('[ParentConfig] Received RPC config from parent:', {
          origin: event.origin,
          endpoint: event.data.rpcEndpoint,
          hasAuth: !!event.data.rpcAuth,
        });
      }

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
