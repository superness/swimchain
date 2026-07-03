/**
 * Node WebSocket Events Client
 *
 * Connects to the Swimchain node's real-time event stream, served at `GET /ws`
 * on the same port as the JSON-RPC HTTP endpoint. The WebSocket endpoint is
 * unauthenticated (only per-IP connection limits apply), so no cookie or
 * signature auth is needed.
 *
 * Protocol (JSON-RPC 2.0 over WebSocket):
 * - Client -> node: `{"jsonrpc":"2.0","method":"subscribe","params":{"events":[...]},"id":1}`
 * - Client -> node: `{"jsonrpc":"2.0","method":"unsubscribe","id":2}`
 * - Client -> node: `{"jsonrpc":"2.0","method":"ping","id":3}` (keepalive)
 * - Node -> client: `{"jsonrpc":"2.0","method":"event","params":{"type":"content_new","timestamp":...,"data":{...}}}`
 * - Node -> client: `{"jsonrpc":"2.0","method":"welcome","params":{...}}` on connect
 *
 * NOTE: The node broadcasts events filtered by event *type* only. Space/thread
 * filtering must happen client-side, which this module supports via
 * {@link EventFilter}.
 *
 * @packageDocumentation
 */

/** Event types the node can publish (see src/rpc/events.rs). */
export type NodeEventType =
  | 'content_new'
  | 'content_engaged'
  | 'sync_status'
  | 'peer_connected'
  | 'peer_disconnected'
  | 'block_created'
  | 'space_updated'
  | 'mempool_changed';

/** All known event types (useful for "subscribe to everything"). */
export const ALL_NODE_EVENT_TYPES: NodeEventType[] = [
  'content_new',
  'content_engaged',
  'sync_status',
  'peer_connected',
  'peer_disconnected',
  'block_created',
  'space_updated',
  'mempool_changed',
];

/** A real-time event pushed by the node. */
export interface NodeEvent {
  /** Event type */
  type: NodeEventType;
  /** Node-side timestamp (Unix milliseconds) */
  timestamp: number;
  /** Event-specific payload */
  data: Record<string, unknown>;
}

/** Payload of a `content_new` event. */
export interface ContentNewEventData {
  content_id: string;
  content_type: 'post' | 'reply';
  space_id: string;
  author_id: string;
  /** Content ID of the thread root (parent for replies, self for posts). May be null. */
  thread_id: string | null;
}

/** Payload of a `content_engaged` event. */
export interface ContentEngagedEventData {
  content_id: string;
  engager_id: string;
  emoji: number | null;
  /** Space of the engaged content, when known. */
  space_id: string | null;
  /** Thread root of the engaged content, when known. */
  thread_id: string | null;
}

/**
 * Client-side filter for delivered events.
 *
 * Matching is permissive: if the event payload does not carry the filtered
 * field (older nodes, or events where the context is unknown), the event is
 * still delivered. Only an explicit mismatch is dropped. Consumers should
 * treat events as refetch hints, not as authoritative data.
 */
export interface EventFilter {
  /** Only deliver events whose data.space_id matches (bech32m sp1... string). */
  spaceId?: string;
  /** Only deliver events whose data.thread_id matches (sha256:... content ID). */
  threadId?: string;
}

/** Connection status of the events client. */
export type EventsConnectionStatus = 'connecting' | 'open' | 'closed';

export type NodeEventListener = (event: NodeEvent) => void;
export type StatusListener = (status: EventsConnectionStatus) => void;

/** Options for {@link NodeEventsClient}. */
export interface NodeEventsClientOptions {
  /**
   * Node URL. Accepts either the JSON-RPC HTTP endpoint
   * (e.g. `http://127.0.0.1:19736`) or a ready WebSocket URL
   * (e.g. `ws://127.0.0.1:19736/ws`). HTTP URLs are converted automatically.
   */
  url: string;
  /** Auto-reconnect on connection loss (default true). */
  reconnect?: boolean;
  /** Initial reconnect delay in ms (default 1000). Doubles per attempt. */
  minReconnectDelayMs?: number;
  /** Max reconnect delay in ms (default 30000). */
  maxReconnectDelayMs?: number;
  /** Keepalive ping interval in ms (default 30000). Set 0 to disable. */
  pingIntervalMs?: number;
  /** WebSocket constructor override (for tests / non-browser runtimes). */
  webSocketImpl?: typeof WebSocket;
}

/**
 * Convert a node JSON-RPC HTTP endpoint into its WebSocket events URL.
 *
 * - `http://host:port`  -> `ws://host:port/ws`
 * - `https://host:port` -> `wss://host:port/ws`
 * - `ws://.../ws` and `wss://.../ws` are passed through unchanged.
 */
export function rpcEndpointToWsUrl(endpoint: string): string {
  const trimmed = endpoint.trim().replace(/\/+$/, '');
  if (trimmed.startsWith('ws://') || trimmed.startsWith('wss://')) {
    return trimmed.endsWith('/ws') ? trimmed : `${trimmed}/ws`;
  }
  if (trimmed.startsWith('https://')) {
    return `wss://${trimmed.slice('https://'.length)}/ws`;
  }
  if (trimmed.startsWith('http://')) {
    return `ws://${trimmed.slice('http://'.length)}/ws`;
  }
  // Bare host:port
  return `ws://${trimmed}/ws`;
}

interface Subscription {
  events: Set<NodeEventType>;
  filter: EventFilter | undefined;
  listener: NodeEventListener;
}

/** Check whether an event passes a client-side filter (permissive on unknown fields). */
export function eventMatchesFilter(event: NodeEvent, filter?: EventFilter): boolean {
  if (!filter) return true;
  if (filter.spaceId !== undefined) {
    const eventSpace = event.data['space_id'];
    if (typeof eventSpace === 'string' && eventSpace.length > 0 && eventSpace !== filter.spaceId) {
      return false;
    }
  }
  if (filter.threadId !== undefined) {
    const eventThread = event.data['thread_id'];
    if (typeof eventThread === 'string' && eventThread.length > 0 && eventThread !== filter.threadId) {
      return false;
    }
  }
  return true;
}

/**
 * Reusable WebSocket subscription client for node real-time events.
 *
 * Features:
 * - Connect / auto-reconnect with exponential backoff + jitter
 * - Topic subscription with client-side space/thread filtering
 * - Automatic re-subscribe after reconnect
 * - JSON-RPC ping keepalive
 *
 * ```ts
 * const client = new NodeEventsClient({ url: 'http://127.0.0.1:19736' });
 * const unsubscribe = client.subscribe(['content_new'], (event) => {
 *   console.log('new content', event.data);
 * }, { spaceId: 'sp1...' });
 * // later:
 * unsubscribe();
 * client.close();
 * ```
 */
export class NodeEventsClient {
  private readonly wsUrl: string;
  private readonly reconnectEnabled: boolean;
  private readonly minReconnectDelayMs: number;
  private readonly maxReconnectDelayMs: number;
  private readonly pingIntervalMs: number;
  private readonly WebSocketImpl: typeof WebSocket;

  private ws: WebSocket | null = null;
  private status: EventsConnectionStatus = 'closed';
  private closedByUser = false;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private nextRequestId = 1;
  /** Topics currently subscribed on the server (to detect when a re-subscribe is needed). */
  private serverTopics: Set<NodeEventType> = new Set();

  private subscriptions: Set<Subscription> = new Set();
  private statusListeners: Set<StatusListener> = new Set();

  constructor(options: NodeEventsClientOptions) {
    this.wsUrl = rpcEndpointToWsUrl(options.url);
    this.reconnectEnabled = options.reconnect ?? true;
    this.minReconnectDelayMs = options.minReconnectDelayMs ?? 1000;
    this.maxReconnectDelayMs = options.maxReconnectDelayMs ?? 30000;
    this.pingIntervalMs = options.pingIntervalMs ?? 30000;
    const impl = options.webSocketImpl ?? (typeof WebSocket !== 'undefined' ? WebSocket : undefined);
    if (!impl) {
      throw new Error('No WebSocket implementation available; pass options.webSocketImpl');
    }
    this.WebSocketImpl = impl;
  }

  /** The resolved WebSocket URL this client connects to. */
  get url(): string {
    return this.wsUrl;
  }

  /** Current connection status. */
  getStatus(): EventsConnectionStatus {
    return this.status;
  }

  /** Register a connection status listener. Returns an unregister function. */
  onStatusChange(listener: StatusListener): () => void {
    this.statusListeners.add(listener);
    return () => {
      this.statusListeners.delete(listener);
    };
  }

  /**
   * Subscribe to one or more event types.
   *
   * Opens the connection lazily on first subscription. The returned function
   * removes the listener (and lets the topic lapse server-side if no other
   * listener needs it).
   */
  subscribe(
    events: NodeEventType[],
    listener: NodeEventListener,
    filter?: EventFilter
  ): () => void {
    const sub: Subscription = {
      events: new Set(events),
      filter,
      listener,
    };
    this.subscriptions.add(sub);
    this.connect();
    this.syncServerSubscription();
    return () => {
      this.subscriptions.delete(sub);
      this.syncServerSubscription();
    };
  }

  /** Open the connection (no-op if already connecting/open). */
  connect(): void {
    this.closedByUser = false;
    if (this.ws || this.status === 'connecting' || this.status === 'open') {
      return;
    }
    this.openSocket();
  }

  /** Close the connection and stop reconnecting. Subscriptions are kept for a later connect(). */
  close(): void {
    this.closedByUser = true;
    this.clearTimers();
    if (this.ws) {
      const ws = this.ws;
      this.ws = null;
      try {
        ws.close();
      } catch {
        // ignore
      }
    }
    this.serverTopics = new Set();
    this.setStatus('closed');
  }

  // ------------------------------------------------------------------
  // Internals
  // ------------------------------------------------------------------

  private openSocket(): void {
    this.setStatus('connecting');
    let ws: WebSocket;
    try {
      ws = new this.WebSocketImpl(this.wsUrl);
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.ws = ws;

    ws.onopen = () => {
      if (this.ws !== ws) return;
      this.reconnectAttempts = 0;
      this.serverTopics = new Set();
      this.setStatus('open');
      this.syncServerSubscription();
      this.startPing();
    };

    ws.onmessage = (msgEvent: MessageEvent) => {
      if (this.ws !== ws) return;
      this.handleMessage(msgEvent.data);
    };

    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ws = null;
      this.clearTimers();
      this.serverTopics = new Set();
      this.setStatus('closed');
      this.scheduleReconnect();
    };

    ws.onerror = () => {
      // onclose fires after onerror; reconnect is handled there.
    };
  }

  private handleMessage(raw: unknown): void {
    if (typeof raw !== 'string') return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return;
    }
    if (typeof parsed !== 'object' || parsed === null) return;
    const message = parsed as { method?: unknown; params?: unknown };
    if (message.method !== 'event') {
      // welcome / subscribe responses / pong — nothing to dispatch
      return;
    }
    const params = message.params as Partial<NodeEvent> | undefined;
    if (!params || typeof params.type !== 'string') return;
    const event: NodeEvent = {
      type: params.type as NodeEventType,
      timestamp: typeof params.timestamp === 'number' ? params.timestamp : Date.now(),
      data:
        typeof params.data === 'object' && params.data !== null
          ? (params.data as Record<string, unknown>)
          : {},
    };
    this.dispatch(event);
  }

  private dispatch(event: NodeEvent): void {
    for (const sub of this.subscriptions) {
      if (!sub.events.has(event.type)) continue;
      if (!eventMatchesFilter(event, sub.filter)) continue;
      try {
        sub.listener(event);
      } catch (err) {
        // Never let one listener break the dispatch loop
        // eslint-disable-next-line no-console
        console.error('[NodeEvents] listener error:', err);
      }
    }
  }

  /** Union of topics needed by current subscriptions. */
  private desiredTopics(): Set<NodeEventType> {
    const topics = new Set<NodeEventType>();
    for (const sub of this.subscriptions) {
      for (const t of sub.events) topics.add(t);
    }
    return topics;
  }

  /**
   * Bring the server-side subscription in line with what local listeners need.
   * The node accumulates topics per subscribe call, so shrinking requires an
   * unsubscribe followed by a fresh subscribe.
   */
  private syncServerSubscription(): void {
    if (!this.ws || this.status !== 'open') return;
    const desired = this.desiredTopics();

    const sameSize = desired.size === this.serverTopics.size;
    const allPresent = [...desired].every((t) => this.serverTopics.has(t));
    if (sameSize && allPresent) return;

    const shrinking = [...this.serverTopics].some((t) => !desired.has(t));
    if (shrinking) {
      this.send({ jsonrpc: '2.0', method: 'unsubscribe', id: this.nextRequestId++ });
      this.serverTopics = new Set();
    }
    if (desired.size > 0) {
      this.send({
        jsonrpc: '2.0',
        method: 'subscribe',
        params: { events: [...desired] },
        id: this.nextRequestId++,
      });
      this.serverTopics = desired;
    }
  }

  private send(message: Record<string, unknown>): void {
    if (!this.ws) return;
    try {
      this.ws.send(JSON.stringify(message));
    } catch {
      // socket died; onclose will handle reconnection
    }
  }

  private startPing(): void {
    if (this.pingTimer) clearInterval(this.pingTimer);
    if (this.pingIntervalMs <= 0) return;
    this.pingTimer = setInterval(() => {
      if (this.status === 'open') {
        this.send({ jsonrpc: '2.0', method: 'ping', id: this.nextRequestId++ });
      }
    }, this.pingIntervalMs);
  }

  private scheduleReconnect(): void {
    if (this.closedByUser || !this.reconnectEnabled) return;
    if (this.reconnectTimer) return;
    if (this.subscriptions.size === 0) return; // nothing to reconnect for

    const exp = Math.min(
      this.minReconnectDelayMs * 2 ** this.reconnectAttempts,
      this.maxReconnectDelayMs
    );
    // Full jitter: random delay in [minDelay/2, exp]
    const delay = Math.max(this.minReconnectDelayMs / 2, Math.random() * exp);
    this.reconnectAttempts += 1;

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.closedByUser && !this.ws) {
        this.openSocket();
      }
    }, delay);
  }

  private clearTimers(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private setStatus(status: EventsConnectionStatus): void {
    if (this.status === status) return;
    this.status = status;
    for (const listener of this.statusListeners) {
      try {
        listener(status);
      } catch {
        // ignore listener errors
      }
    }
  }
}

// ----------------------------------------------------------------------
// Shared client registry
// ----------------------------------------------------------------------
//
// The node caps WebSocket connections at 5 per IP, so components should share
// a single connection per node URL. acquire/release manage a refcounted
// registry used by the useNodeEvents hook.

interface SharedEntry {
  client: NodeEventsClient;
  refCount: number;
}

const sharedClients = new Map<string, SharedEntry>();

/**
 * Get (or create) the shared events client for a node URL.
 * Pair every acquire with a {@link releaseEventsClient} call.
 */
export function acquireEventsClient(
  url: string,
  options?: Omit<NodeEventsClientOptions, 'url'>
): NodeEventsClient {
  const key = rpcEndpointToWsUrl(url);
  let entry = sharedClients.get(key);
  if (!entry) {
    entry = { client: new NodeEventsClient({ url, ...options }), refCount: 0 };
    sharedClients.set(key, entry);
  }
  entry.refCount += 1;
  return entry.client;
}

/** Release a shared events client. Closes the socket when the last user releases. */
export function releaseEventsClient(client: NodeEventsClient): void {
  for (const [key, entry] of sharedClients) {
    if (entry.client === client) {
      entry.refCount -= 1;
      if (entry.refCount <= 0) {
        sharedClients.delete(key);
        client.close();
      }
      return;
    }
  }
  // Not a shared client — close directly
  client.close();
}
