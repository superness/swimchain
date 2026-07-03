/**
 * useNodeEvents - React hook for real-time node WebSocket events
 *
 * Subscribes to the node's `GET /ws` event stream and invokes a callback for
 * each matching event. Connections are shared per node URL (the node allows
 * at most 5 WebSocket connections per IP), auto-reconnect with backoff and
 * ping keepalive are handled by the underlying NodeEventsClient.
 *
 * Typical usage is event-driven refetching alongside a slow poll fallback:
 *
 * ```tsx
 * useNodeEvents({
 *   url: rpcEndpoint,               // http://127.0.0.1:19736 (converted to ws://.../ws)
 *   events: ['content_new'],
 *   spaceId: activeSpaceId,          // optional client-side filter
 *   onEvent: () => refetch(),
 * });
 * ```
 */

import { useEffect, useRef, useState } from 'react';
import {
  acquireEventsClient,
  releaseEventsClient,
  type EventsConnectionStatus,
  type NodeEvent,
  type NodeEventType,
} from '../lib/events';

export interface UseNodeEventsOptions {
  /**
   * Node URL: the JSON-RPC HTTP endpoint (e.g. `http://127.0.0.1:19736`) or a
   * `ws://.../ws` URL. Pass null/undefined to disable the subscription.
   */
  url: string | null | undefined;
  /** Event types to subscribe to. */
  events: NodeEventType[];
  /** Optional client-side filter: only events for this space (sp1... ID). */
  spaceId?: string;
  /** Optional client-side filter: only events for this thread (sha256:... content ID). */
  threadId?: string;
  /** Called for each matching event. Latest callback is always used (no re-subscribes on identity change). */
  onEvent: (event: NodeEvent) => void;
  /** Set false to pause the subscription without unmounting (default true). */
  enabled?: boolean;
}

export interface UseNodeEventsResult {
  /** True while the WebSocket connection is open. */
  connected: boolean;
  /** Detailed connection status. */
  status: EventsConnectionStatus;
}

export function useNodeEvents(options: UseNodeEventsOptions): UseNodeEventsResult {
  const { url, events, spaceId, threadId, onEvent, enabled = true } = options;
  const [status, setStatus] = useState<EventsConnectionStatus>('closed');

  // Keep the latest callback in a ref so consumers can pass inline closures
  // without tearing down the subscription on every render.
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  // Stable key for the requested topics (avoids re-subscribing when the
  // caller passes a new array instance with the same contents).
  const eventsKey = [...events].sort().join(',');

  useEffect(() => {
    if (!url || !enabled || eventsKey.length === 0) {
      setStatus('closed');
      return;
    }

    const client = acquireEventsClient(url);
    const offStatus = client.onStatusChange(setStatus);
    setStatus(client.getStatus());

    const topics = eventsKey.split(',') as NodeEventType[];
    const unsubscribe = client.subscribe(
      topics,
      (event) => onEventRef.current(event),
      spaceId !== undefined || threadId !== undefined ? { spaceId, threadId } : undefined
    );

    return () => {
      unsubscribe();
      offStatus();
      releaseEventsClient(client);
    };
  }, [url, enabled, eventsKey, spaceId, threadId]);

  return { connected: status === 'open', status };
}
