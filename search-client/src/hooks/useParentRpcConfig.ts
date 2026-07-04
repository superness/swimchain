/**
 * Hook to receive RPC config from parent frame (desktop-app wrapper)
 *
 * When running inside the desktop-app iframe, the parent sends:
 * {
 *   type: 'SWIMCHAIN_RPC_CONFIG',
 *   rpcEndpoint: 'http://127.0.0.1:19736',
 *   rpcAuth: 'Basic ...',
 *   nodeAddress: 'cs1...',      // optional: node identity address
 *   nodeDisplayName: 'Alice'    // optional: node identity display name
 * }
 */

import { useState, useEffect } from 'react';

interface ParentRpcConfig {
  rpcEndpoint: string;
  rpcAuth: string;
  // The desktop shell's node identity, when running embedded. In the desktop
  // app the NODE holds the identity (the browser has no keypair), so search
  // adopts this for display and as the stable per-user key for client-side
  // state (blocklist, search history) instead of a browser publicKey.
  nodeAddress?: string;
  nodeDisplayName?: string;
}

// Global storage for parent config (persists across hook instances)
let parentConfig: ParentRpcConfig | null = null;
let listeners: Array<(config: ParentRpcConfig | null) => void> = [];

// Allowed parent origins for postMessage security
// Only accept RPC config from trusted origins
const ALLOWED_PARENT_ORIGINS: string[] = [
  'http://localhost',           // Local development (any port)
  'http://127.0.0.1',           // Local development (IP)
  'tauri://localhost',          // Tauri v1 production
  'http://tauri.localhost',     // Tauri v2 production (Windows webview origin)
  'https://tauri.localhost',    // Tauri v2 production (macOS/Linux)
  'https://localhost',          // Local HTTPS development
  'https://app.swimchain.io',   // Production web app
];

// Accept same-origin (the desktop shell embeds clients under its own origin,
// so the iframe's origin equals the shell's) plus the trusted prefixes above.
// The prior exact .includes() match rejected Tauri v2's http://tauri.localhost,
// which silently blocked search from ever receiving the node RPC config.
function isOriginAllowed(origin: string): boolean {
  if (!origin || origin === window.location.origin) return true;
  return ALLOWED_PARENT_ORIGINS.some((allowed) => origin.startsWith(allowed));
}

// Set up message listener once
if (typeof window !== 'undefined') {
  window.addEventListener('message', (event) => {
    // Security: Validate origin before accepting config
    if (!isOriginAllowed(event.origin)) {
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
        nodeAddress: typeof event.data.nodeAddress === 'string' ? event.data.nodeAddress : undefined,
        nodeDisplayName: typeof event.data.nodeDisplayName === 'string' ? event.data.nodeDisplayName : undefined,
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
