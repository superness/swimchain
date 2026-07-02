import type {
  ContentEvent,
  ContentResponse,
  SpaceActivitySummary,
  ReputationSummary,
  HealthStatus,
} from '@/types/gateway';
import { NodeRpcClient, getNodeRpc } from './node-rpc';

/**
 * Connection state for the node
 */
export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

/**
 * Event handlers for node connection
 */
export interface NodeConnectionHandlers {
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: Error) => void;
  onContentEvent?: (event: ContentEvent) => void;
}

/**
 * Node connection manager
 * Handles WebSocket + RPC connection to Swimchain node for read-only gateway.
 *
 * Uses the RPC client for data queries and maintains a WebSocket connection
 * for real-time content events (when available).
 */
export class NodeConnection {
  private wsUrl: string;
  private ws: WebSocket | null = null;
  private handlers: NodeConnectionHandlers;
  private state: ConnectionState = 'disconnected';
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectDelay = 1000;
  private lastLatencyMs = 0;
  private pingInterval: ReturnType<typeof setInterval> | null = null;
  private rpc: NodeRpcClient;

  constructor(wsUrl: string, handlers: NodeConnectionHandlers = {}) {
    this.wsUrl = wsUrl;
    this.handlers = handlers;
    this.rpc = new NodeRpcClient(wsUrl);
  }

  /**
   * Connect to the node
   */
  async connect(): Promise<void> {
    if (this.state === 'connected' || this.state === 'connecting') {
      return;
    }

    this.state = 'connecting';

    // First verify RPC connectivity
    try {
      const connected = await this.rpc.ping();
      if (connected) {
        this.state = 'connected';
        this.reconnectAttempts = 0;
        this.handlers.onConnect?.();
      } else {
        throw new Error('RPC ping failed');
      }
    } catch (error) {
      this.state = 'error';
      this.handlers.onError?.(error instanceof Error ? error : new Error('Connection failed'));
      return;
    }

    // Then try WebSocket for real-time events
    if (typeof WebSocket !== 'undefined') {
      try {
        this.ws = new WebSocket(this.wsUrl);
        this.ws.onopen = () => {
          this.startPingInterval();
        };
        this.ws.onclose = () => {
          this.stopPingInterval();
          this.attemptReconnect();
        };
        this.ws.onmessage = (event) => {
          this.handleMessage(event.data);
        };
      } catch {
        // WebSocket is optional — fall back to polling via RPC
      }
    }
  }

  /**
   * Disconnect from the node
   */
  disconnect(): void {
    this.stopPingInterval();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.state = 'disconnected';
  }

  /**
   * Get current connection state
   */
  getState(): ConnectionState {
    return this.state;
  }

  /**
   * Get last measured latency
   */
  getLatencyMs(): number {
    return this.lastLatencyMs;
  }

  /**
   * Get the underlying RPC client
   */
  getRpc(): NodeRpcClient {
    return this.rpc;
  }

  /**
   * Query content by ID — delegates to RPC
   */
  async getContent(contentId: string): Promise<ContentResponse | null> {
    return this.rpc.getContent(contentId);
  }

  /**
   * Query space activity — delegates to RPC
   */
  async getSpaceActivity(spaceId: string): Promise<SpaceActivitySummary | null> {
    return this.rpc.getSpaceInfo(spaceId);
  }

  /**
   * Query all spaces — delegates to RPC
   */
  async getAllSpaces(): Promise<SpaceActivitySummary[]> {
    return this.rpc.getAllSpaces();
  }

  /**
   * Query content in a space — delegates to RPC
   */
  async getSpaceContent(
    spaceId: string,
    limit: number = 50,
    offset: number = 0
  ): Promise<ContentResponse[]> {
    return this.rpc.getSpaceContent(spaceId, limit, offset);
  }

  /**
   * Query identity reputation — delegates to RPC
   */
  async getIdentityReputation(address: string): Promise<ReputationSummary | null> {
    return this.rpc.getIdentityReputation(address);
  }

  /**
   * Query content by identity — delegates to RPC
   */
  async getContentByIdentity(
    address: string,
    limit: number = 50,
    offset: number = 0
  ): Promise<ContentResponse[]> {
    return this.rpc.getContentByIdentity(address, limit, offset);
  }

  /**
   * Get health status — uses RPC ping
   */
  async getHealthStatus(): Promise<HealthStatus> {
    const connected = await this.rpc.ping();
    const info = this.rpc.getNodeInfo();

    return {
      status: connected ? 'healthy' : 'unhealthy',
      nodeConnected: connected,
      nodeLatencyMs: this.lastLatencyMs,
      indexedPosts: 0,
      lastSyncTime: new Date().toISOString(),
    };
  }

  /**
   * Handle incoming WebSocket message
   */
  private handleMessage(data: string): void {
    try {
      const message = JSON.parse(data);

      if (message.type === 'pong') {
        const sentAt = message.sentAt as number | undefined;
        if (sentAt) {
          this.lastLatencyMs = Date.now() - sentAt;
        }
        return;
      }

      if (message.type === 'content_event') {
        const event: ContentEvent = message.payload;
        this.handlers.onContentEvent?.(event);
        return;
      }

      console.log('[NodeConnection] Unknown message type:', message.type);
    } catch (error) {
      console.error('[NodeConnection] Failed to parse message:', error);
    }
  }

  /**
   * Send ping to measure latency
   */
  private sendPing(): void {
    if (this.ws && this.state === 'connected') {
      this.ws.send(JSON.stringify({
        type: 'ping',
        sentAt: Date.now(),
      }));
    }
  }

  /**
   * Start ping interval
   */
  private startPingInterval(): void {
    this.stopPingInterval();
    this.pingInterval = setInterval(() => {
      this.sendPing();
    }, 30000);
  }

  /**
   * Stop ping interval
   */
  private stopPingInterval(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  /**
   * Attempt to reconnect after disconnection
   */
  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[NodeConnection] Max reconnect attempts reached');
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);

    console.log(`[NodeConnection] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);

    setTimeout(() => {
      this.connect().catch((error) => {
        console.error('[NodeConnection] Reconnect failed:', error);
      });
    }, delay);
  }
}

// Singleton connection instance
let _connection: NodeConnection | null = null;

/**
 * Get or create the node connection singleton
 */
export function getNodeConnection(wsUrl?: string): NodeConnection {
  if (_connection === null) {
    const url = wsUrl || process.env.NODE_WEBSOCKET_URL || 'ws://localhost:9001';
    _connection = new NodeConnection(url);
  }
  return _connection;
}

/**
 * Reset connection (for testing)
 */
export function resetNodeConnection(): void {
  if (_connection) {
    _connection.disconnect();
    _connection = null;
  }
}
