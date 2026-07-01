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
import { logger } from '../lib/logger';

interface ParentRpcConfig {
  rpcEndpoint: string;
  rpcAuth: string;
}

// Global storage for parent config (persists across hook instances)
let parentConfig: ParentRpcConfig | null = null;
let listeners: Array<(config: ParentRpcConfig | null) => void> = [];

// Set up message listener once
if (typeof window !== 'undefined') {
  logger.info('[ParentConfig] Setting up message listener, isIframe:', window.self !== window.top);
  logger.info('[ParentConfig] Current origin:', window.location.origin);

  window.addEventListener('message', (event) => {
    logger.info('[ParentConfig] Received message:', {
      type: event.data?.type,
      origin: event.origin,
      hasData: !!event.data,
    });

    // Validate origin to prevent credential interception from malicious sources
    // Accept messages from same origin or from parent frame (tauri://localhost or http://localhost:*)
    const validOrigins = [
      window.location.origin,
      'tauri://localhost',
    ];
    const isLocalhost = event.origin.startsWith('http://localhost:') ||
                        event.origin.startsWith('https://localhost:');

    if (!validOrigins.includes(event.origin) && !isLocalhost) {
      logger.warn('[ParentConfig] Ignoring message from untrusted origin:', event.origin);
      return;
    }

    if (event.data?.type === 'SWIMCHAIN_RPC_CONFIG') {
      logger.info('[ParentConfig] Received RPC config from parent:', {
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
