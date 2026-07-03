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
export type NodeEventType = 'content_new' | 'content_engaged' | 'sync_status' | 'peer_connected' | 'peer_disconnected' | 'block_created' | 'space_updated' | 'mempool_changed';
/** All known event types (useful for "subscribe to everything"). */
export declare const ALL_NODE_EVENT_TYPES: NodeEventType[];
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
export declare function rpcEndpointToWsUrl(endpoint: string): string;
/** Check whether an event passes a client-side filter (permissive on unknown fields). */
export declare function eventMatchesFilter(event: NodeEvent, filter?: EventFilter): boolean;
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
export declare class NodeEventsClient {
    private readonly wsUrl;
    private readonly reconnectEnabled;
    private readonly minReconnectDelayMs;
    private readonly maxReconnectDelayMs;
    private readonly pingIntervalMs;
    private readonly WebSocketImpl;
    private ws;
    private status;
    private closedByUser;
    private reconnectAttempts;
    private reconnectTimer;
    private pingTimer;
    private nextRequestId;
    /** Topics currently subscribed on the server (to detect when a re-subscribe is needed). */
    private serverTopics;
    private subscriptions;
    private statusListeners;
    constructor(options: NodeEventsClientOptions);
    /** The resolved WebSocket URL this client connects to. */
    get url(): string;
    /** Current connection status. */
    getStatus(): EventsConnectionStatus;
    /** Register a connection status listener. Returns an unregister function. */
    onStatusChange(listener: StatusListener): () => void;
    /**
     * Subscribe to one or more event types.
     *
     * Opens the connection lazily on first subscription. The returned function
     * removes the listener (and lets the topic lapse server-side if no other
     * listener needs it).
     */
    subscribe(events: NodeEventType[], listener: NodeEventListener, filter?: EventFilter): () => void;
    /** Open the connection (no-op if already connecting/open). */
    connect(): void;
    /** Close the connection and stop reconnecting. Subscriptions are kept for a later connect(). */
    close(): void;
    private openSocket;
    private handleMessage;
    private dispatch;
    /** Union of topics needed by current subscriptions. */
    private desiredTopics;
    /**
     * Bring the server-side subscription in line with what local listeners need.
     * The node accumulates topics per subscribe call, so shrinking requires an
     * unsubscribe followed by a fresh subscribe.
     */
    private syncServerSubscription;
    private send;
    private startPing;
    private scheduleReconnect;
    private clearTimers;
    private setStatus;
}
/**
 * Get (or create) the shared events client for a node URL.
 * Pair every acquire with a {@link releaseEventsClient} call.
 */
export declare function acquireEventsClient(url: string, options?: Omit<NodeEventsClientOptions, 'url'>): NodeEventsClient;
/** Release a shared events client. Closes the socket when the last user releases. */
export declare function releaseEventsClient(client: NodeEventsClient): void;
//# sourceMappingURL=events.d.ts.map