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
import { isConfigMessageTrusted, mergeTrustedConfig } from '@swimchain/frontend';

interface ParentRpcConfig {
  rpcEndpoint: string;
  rpcAuth: string;
  // The desktop shell's node identity address (cs1...), when running embedded.
  // The node holds the identity, so the browser has no keypair — this is the
  // stable per-user key for anything that would otherwise key on a browser
  // publicKey (e.g. feed follow preferences).
  nodeAddress?: string;
  // Optional human-readable name for the node identity (shown as the current
  // user in node mode). Sent by the desktop shell alongside nodeAddress.
  nodeDisplayName?: string;
}

// Global storage for parent config (persists across hook instances)
let parentConfig: ParentRpcConfig | null = null;
let listeners: Array<(config: ParentRpcConfig | null) => void> = [];

// Set up message listener once
if (typeof window !== 'undefined') {
  window.addEventListener('message', (event) => {
    const ctx = { selfOrigin: window.location.origin, parentWindow: window.parent };

    // Validate origin + source before accepting any config (rejects lookalike origins
    // and messages not sent by this frame's real parent — see @swimchain/frontend's
    // configTrust.ts).
    if (!isConfigMessageTrusted(event, ctx)) {
      if (import.meta.env.DEV) {
        console.warn('[ParentConfig] Rejected untrusted message:', event.origin);
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
