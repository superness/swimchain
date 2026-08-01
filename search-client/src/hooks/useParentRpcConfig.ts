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
import { isConfigMessageTrusted, mergeTrustedConfig } from '@swimchain/frontend';

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

// Set up message listener once
if (typeof window !== 'undefined') {
  window.addEventListener('message', (event) => {
    const ctx = { selfOrigin: window.location.origin, parentWindow: window.parent };

    // Security: validate origin + source before accepting any config (rejects
    // lookalike origins and messages not sent by this frame's real parent —
    // see @swimchain/frontend's configTrust.ts).
    if (!isConfigMessageTrusted(event, ctx)) {
      console.warn('[ParentConfig] Rejected message from untrusted origin:', event.origin);
      return;
    }

    if (event.data?.type === 'SWIMCHAIN_RPC_CONFIG') {
      const incoming: ParentRpcConfig = {
        rpcEndpoint: event.data.rpcEndpoint,
        rpcAuth: event.data.rpcAuth,
        nodeAddress: typeof event.data.nodeAddress === 'string' ? event.data.nodeAddress : undefined,
        nodeDisplayName: typeof event.data.nodeDisplayName === 'string' ? event.data.nodeDisplayName : undefined,
      };

      const next = mergeTrustedConfig(parentConfig, incoming);
      if (next !== parentConfig) {
        parentConfig = next;
        // Notify all listeners only when the merge actually changed something.
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
