/**
 * ClientFrame - Loads a client app in an iframe and passes RPC config
 */

import { useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';

interface ClientFrameProps {
  client: 'forum' | 'chat' | 'feed' | 'search' | 'wiki';
  rpcEndpoint: string;
  rpcAuth: string;
  /**
   * Node identity public address (cs1...). Optional, never includes key material.
   * Clients that support node-managed signing (e.g. forum via sign_message RPC)
   * can use this to display/prefer the node identity.
   */
  nodeAddress?: string | null;
  /** Node identity display name, if known. */
  nodeDisplayName?: string | null;
}

interface LogMessage {
  type: 'SWIMCHAIN_LOG';
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  client: string;
}

// Logger that writes to file
const log = (level: string, message: string, data?: unknown) => {
  const logLine = data ? `${message} ${JSON.stringify(data)}` : message;
  invoke("write_client_log", { client: "desktop-app", level, message: `[ClientFrame] ${logLine}` }).catch(() => {});
};

// Dev-only verbose logging
const IS_DEV = import.meta.env.DEV;

export function ClientFrame({ client, rpcEndpoint, rpcAuth, nodeAddress, nodeDisplayName }: ClientFrameProps): JSX.Element {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Build the RPC config message. Optionally carries the node identity's
  // PUBLIC address + display name so clients can show "node identity: cs1..."
  // and prefer node-managed signing where supported. Never carries the seed
  // or any private key material.
  const buildConfigMessage = () => ({
    type: 'SWIMCHAIN_RPC_CONFIG',
    rpcEndpoint,
    rpcAuth,
    ...(nodeAddress ? { nodeAddress } : {}),
    ...(nodeDisplayName ? { nodeDisplayName } : {}),
  });

  // Send RPC config to iframe when it loads
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    const handleLoad = () => {
      if (IS_DEV) log("info", "Iframe loaded - sending RPC config via postMessage", { client, rpcEndpoint });
      // Send RPC config to the client via postMessage
      // Use specific origin instead of '*' to prevent credential interception
      iframe.contentWindow?.postMessage(buildConfigMessage(), window.location.origin);
    };

    const handleError = (e: Event) => {
      log("error", "IFRAME LOAD ERROR", { client, error: e });
    };

    iframe.addEventListener('load', handleLoad);
    iframe.addEventListener('error', handleError);
    return () => {
      iframe.removeEventListener('load', handleLoad);
      iframe.removeEventListener('error', handleError);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rpcEndpoint, rpcAuth, nodeAddress, nodeDisplayName, client]);

  // Also send config periodically in case iframe missed it
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    const interval = setInterval(() => {
      iframe.contentWindow?.postMessage(buildConfigMessage(), window.location.origin);
    }, 1000);

    // Stop after 10 seconds (client should have received it by then)
    const timeout = setTimeout(() => clearInterval(interval), 10000);

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rpcEndpoint, rpcAuth, nodeAddress, nodeDisplayName]);

  // Listen for log messages from iframe and write to file
  useEffect(() => {
    const handleMessage = async (event: MessageEvent) => {
      const data = event.data;

      // Only process SWIMCHAIN messages
      if (!data || typeof data !== 'object') return;

      // Handle log messages from iframes
      // In Tauri, origins can be tauri://localhost or similar, so we check
      // that it's either same-origin or a tauri:// origin
      const isTauriOrigin = event.origin.startsWith('tauri://');
      const isSameOrigin = event.origin === window.location.origin;

      // External-link open: a client link inside the sandboxed iframe can't
      // reach the system browser via target="_blank", so the client posts the
      // URL out and we open it through the shell (http(s) only; enforced again
      // in the Rust command).
      if (data.type === 'SWIMCHAIN_OPEN_URL') {
        if (!isSameOrigin && !isTauriOrigin) return;
        const url = typeof data.url === 'string' ? data.url : '';
        if (/^https?:\/\//i.test(url)) {
          invoke('open_external', { url }).catch((e) =>
            console.error('open_external failed:', e)
          );
        }
        return;
      }

      if (data.type === 'SWIMCHAIN_LOG') {
        // Accept logs from same-origin or tauri origins
        if (!isSameOrigin && !isTauriOrigin) {
          console.warn('[ClientFrame] Rejected log from origin:', event.origin, 'expected:', window.location.origin);
          return;
        }

        const logData = data as LogMessage;
        try {
          await invoke('write_client_log', {
            client: logData.client || client,
            level: logData.level || 'info',
            message: logData.message,
          });
        } catch (e) {
          console.error('Failed to write client log:', e);
        }
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [client]);

  // Map client name to resource path
  const clientPath = `clients/${client}-client/index.html`;

  return (
    <iframe
      ref={iframeRef}
      src={clientPath}
      className="client-frame"
      title={`${client} client`}
      sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
    />
  );
}
