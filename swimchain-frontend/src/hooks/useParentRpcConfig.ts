/**
 * Hook to receive RPC config from parent frame (desktop-app wrapper)
 *
 * When running inside the desktop-app iframe, the parent sends:
 * {
 *   type: 'SWIMCHAIN_RPC_CONFIG',
 *   rpcEndpoint: 'http://127.0.0.1:19736',
 *   rpcAuth: 'Basic ...',
 *   // Optional node identity info (PUBLIC data only - never the seed):
 *   nodeAddress: 'cs1...',
 *   nodeDisplayName: 'Alice'
 * }
 */

import { useState, useEffect } from 'react';
import { isConfigMessageTrusted, mergeTrustedConfig } from './configTrust';

interface ParentRpcConfig {
  rpcEndpoint: string;
  rpcAuth: string;
  /** Node identity public address (cs1...), if the shell shared it. */
  nodeAddress?: string;
  /** Node identity display name, if the shell shared it. */
  nodeDisplayName?: string;
}

// Global storage for parent config (persists across hook instances)
let parentConfig: ParentRpcConfig | null = null;
let listeners: Array<(config: ParentRpcConfig | null) => void> = [];

// Dev-mode detection that doesn't require Vite client types
// (import.meta.env is injected by Vite; absent in other runtimes)
const IS_DEV: boolean =
  (import.meta as { env?: { DEV?: boolean } }).env?.DEV === true;

// Set up message listener once
if (typeof window !== 'undefined') {
  window.addEventListener('message', (event) => {
    const ctx = { selfOrigin: window.location.origin, parentWindow: window.parent };

    // Validate origin + source before accepting any config (rejects lookalike origins
    // and messages not sent by this frame's real parent — see configTrust.ts).
    if (!isConfigMessageTrusted(event, ctx)) {
      if (IS_DEV) {
        console.warn('[ParentConfig] Rejected untrusted message:', event.origin);
      }
      return;
    }

    if (event.data?.type === 'SWIMCHAIN_RPC_CONFIG') {
      if (IS_DEV) {
        console.log('[ParentConfig] Received RPC config from parent:', {
          origin: event.origin,
          endpoint: event.data.rpcEndpoint,
          hasAuth: !!event.data.rpcAuth,
        });
      }

      const incoming: ParentRpcConfig = {
        rpcEndpoint: event.data.rpcEndpoint,
        rpcAuth: event.data.rpcAuth,
        ...(typeof event.data.nodeAddress === 'string'
          ? { nodeAddress: event.data.nodeAddress }
          : {}),
        ...(typeof event.data.nodeDisplayName === 'string'
          ? { nodeDisplayName: event.data.nodeDisplayName }
          : {}),
      };

      const next = mergeTrustedConfig(parentConfig, incoming);
      if (next !== parentConfig) {
        parentConfig = next;
        listeners.forEach(fn => fn(parentConfig));
      }
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
