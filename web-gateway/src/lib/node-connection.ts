import type {
  ContentEvent,
  ContentResponse,
  SpaceActivitySummary,
  ReputationSummary,
  HealthStatus
} from '@/types/gateway';

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
 * Handles WebSocket connection to Swimchain node for real-time updates
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

  constructor(wsUrl: string, handlers: NodeConnectionHandlers = {}) {
    this.wsUrl = wsUrl;
    this.handlers = handlers;
  }

  /**
   * Connect to the node
   */
  async connect(): Promise<void> {
    if (this.state === 'connected' || this.state === 'connecting') {
      return;
    }

    this.state = 'connecting';

    return new Promise((resolve, reject) => {
      try {
        // In server environment, we'd use a different WebSocket implementation
        // For now, we'll use a mock for SSR compatibility
        if (typeof WebSocket === 'undefined') {
          // Server-side: use mock or defer connection
          console.log('[NodeConnection] WebSocket not available (SSR mode)');
          this.state = 'disconnected';
          resolve();
          return;
        }

        this.ws = new WebSocket(this.wsUrl);

        this.ws.onopen = () => {
          console.log('[NodeConnection] Connected to node');
          this.state = 'connected';
          this.reconnectAttempts = 0;
          this.startPingInterval();
          this.handlers.onConnect?.();
          resolve();
        };

        this.ws.onclose = () => {
          console.log('[NodeConnection] Disconnected from node');
          this.state = 'disconnected';
          this.stopPingInterval();
          this.handlers.onDisconnect?.();
          this.attemptReconnect();
        };

        this.ws.onerror = (event) => {
          console.error('[NodeConnection] WebSocket error:', event);
          this.state = 'error';
          const error = new Error('WebSocket connection error');
          this.handlers.onError?.(error);
          reject(error);
        };

        this.ws.onmessage = (event) => {
          this.handleMessage(event.data);
        };
      } catch (error) {
        this.state = 'error';
        reject(error);
      }
    });
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
   * Query content by ID
   */
  async getContent(contentId: string): Promise<ContentResponse | null> {
    // In production, this would send a request to the node
    // For now, return null (simulating not found)
    console.log(`[NodeConnection] getContent(${contentId})`);
    return null;
  }

  /**
   * Query space activity
   */
  async getSpaceActivity(spaceId: string): Promise<SpaceActivitySummary | null> {
    console.log(`[NodeConnection] getSpaceActivity(${spaceId})`);
    return null;
  }

  /**
   * Query all spaces
   */
  async getAllSpaces(): Promise<SpaceActivitySummary[]> {
    console.log('[NodeConnection] getAllSpaces()');
    return [];
  }

  /**
   * Query content in a space
   */
  async getSpaceContent(
    spaceId: string,
    limit: number = 50,
    offset: number = 0
  ): Promise<ContentResponse[]> {
    console.log(`[NodeConnection] getSpaceContent(${spaceId}, ${limit}, ${offset})`);
    return [];
  }

  /**
   * Query identity reputation
   */
  async getIdentityReputation(address: string): Promise<ReputationSummary | null> {
    console.log(`[NodeConnection] getIdentityReputation(${address})`);
    return null;
  }

  /**
   * Query content by identity
   */
  async getContentByIdentity(
    address: string,
    limit: number = 50,
    offset: number = 0
  ): Promise<ContentResponse[]> {
    console.log(`[NodeConnection] getContentByIdentity(${address}, ${limit}, ${offset})`);
    return [];
  }

  /**
   * Get health status
   */
  async getHealthStatus(): Promise<HealthStatus> {
    return {
      status: this.state === 'connected' ? 'healthy' : 'unhealthy',
      nodeConnected: this.state === 'connected',
      nodeLatencyMs: this.lastLatencyMs,
      indexedPosts: 0,
      lastSyncTime: new Date().toISOString(),
    };
  }

  /**
   * Handle incoming WebSocket message
   */
  private handleMessage(data: string | Buffer): void {
    try {
      const message = JSON.parse(data.toString());

      if (message.type === 'pong') {
        // Calculate latency from ping-pong
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
    }, 30000); // Every 30 seconds
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
