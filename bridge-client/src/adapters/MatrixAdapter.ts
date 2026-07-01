/**
 * Matrix Adapter
 *
 * Handles communication with a Matrix homeserver.
 * Provides message polling and sending capabilities.
 */

import type {
  BridgeMessage,
  MatrixConfig,
  ConnectionStatus,
} from '../types';
import { MATRIX_POLL_INTERVAL_MS, MATRIX_PREFIX, CONNECTION_TIMEOUT_MS } from '../types/constants';

/**
 * Message handler callback type.
 */
type MessageHandler = (message: BridgeMessage) => void;

/**
 * Error handler callback type.
 */
type ErrorHandler = (error: Error) => void;

/**
 * Adapter for Matrix homeserver communication.
 */
export class MatrixAdapter {
  private config: MatrixConfig;
  private status: ConnectionStatus = 'disconnected';
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private messageHandlers: Set<MessageHandler> = new Set();
  private errorHandlers: Set<ErrorHandler> = new Set();
  private syncToken: string = '';
  private lastError: string | undefined;

  constructor(config: MatrixConfig) {
    this.config = config;
  }

  /**
   * Connect to the Matrix homeserver.
   */
  async connect(): Promise<void> {
    if (!this.config.enabled) {
      throw new Error('Matrix bridging is not enabled');
    }

    if (!this.config.homeserverUrl || !this.config.accessToken) {
      throw new Error('Matrix homeserver URL and access token are required');
    }

    this.status = 'connecting';

    try {
      // Validate connection by checking whoami
      const response = await this.fetchMatrix('/_matrix/client/v3/account/whoami');

      if (!response.ok) {
        throw new Error(`Matrix authentication failed: ${response.status}`);
      }

      const data = await response.json();
      console.log(`[MatrixAdapter] Connected as ${data.user_id}`);

      this.status = 'connected';
      this.lastError = undefined;

      // Start polling
      this.startPolling();
    } catch (error) {
      this.status = 'error';
      this.lastError = error instanceof Error ? error.message : 'Unknown error';
      throw error;
    }
  }

  /**
   * Disconnect from the Matrix homeserver.
   */
  disconnect(): void {
    this.stopPolling();
    this.status = 'disconnected';
    console.log('[MatrixAdapter] Disconnected');
  }

  /**
   * Get current connection status.
   */
  getStatus(): ConnectionStatus {
    return this.status;
  }

  /**
   * Get last error message.
   */
  getLastError(): string | undefined {
    return this.lastError;
  }

  /**
   * Send a message to a Matrix room.
   *
   * @param roomId - Room to send to
   * @param content - Message content
   * @returns Event ID of the sent message
   */
  async sendMessage(roomId: string, content: string): Promise<string> {
    const txnId = `m${Date.now()}`;
    const response = await this.fetchMatrix(
      `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/send/m.room.message/${txnId}`,
      {
        method: 'PUT',
        body: JSON.stringify({
          msgtype: 'm.text',
          body: content,
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to send message: ${response.status}`);
    }

    const data = await response.json();
    return data.event_id;
  }

  /**
   * Subscribe to messages.
   */
  onMessage(handler: MessageHandler): () => void {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }

  /**
   * Subscribe to errors.
   */
  onError(handler: ErrorHandler): () => void {
    this.errorHandlers.add(handler);
    return () => this.errorHandlers.delete(handler);
  }

  /**
   * Update configuration.
   */
  updateConfig(config: MatrixConfig): void {
    const wasRunning = this.pollTimer !== null;
    if (wasRunning) {
      this.stopPolling();
    }
    this.config = config;
    if (wasRunning && config.enabled) {
      this.startPolling();
    }
  }

  /**
   * Start polling for messages.
   */
  private startPolling(): void {
    if (this.pollTimer) return;

    this.pollTimer = setInterval(() => {
      this.poll().catch((error) => {
        this.notifyError(error instanceof Error ? error : new Error(String(error)));
      });
    }, MATRIX_POLL_INTERVAL_MS);

    // Initial poll
    this.poll().catch((error) => {
      this.notifyError(error instanceof Error ? error : new Error(String(error)));
    });
  }

  /**
   * Stop polling for messages.
   */
  private stopPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  /**
   * Poll for new messages.
   */
  private async poll(): Promise<void> {
    try {
      const params = new URLSearchParams({
        timeout: '0',
        ...(this.syncToken && { since: this.syncToken }),
      });

      const response = await this.fetchMatrix(`/_matrix/client/v3/sync?${params}`);

      if (!response.ok) {
        throw new Error(`Sync failed: ${response.status}`);
      }

      const data = await response.json();
      this.syncToken = data.next_batch;

      // Process room events
      const rooms = data.rooms?.join ?? {};
      for (const [roomId, roomData] of Object.entries(rooms)) {
        if (!this.config.roomIds.includes(roomId)) continue;

        const events = (roomData as { timeline?: { events?: unknown[] } }).timeline?.events ?? [];
        for (const event of events) {
          this.processEvent(roomId, event as Record<string, unknown>);
        }
      }
    } catch (error) {
      this.status = 'error';
      this.lastError = error instanceof Error ? error.message : 'Poll error';
      throw error;
    }
  }

  /**
   * Process a Matrix event.
   */
  private processEvent(roomId: string, event: Record<string, unknown>): void {
    // Only process text messages
    if (event.type !== 'm.room.message') return;
    if ((event.content as { msgtype?: string })?.msgtype !== 'm.text') return;

    const content = event.content as { body?: string };
    const body = content?.body ?? '';

    // Skip if this looks like a bridged message
    if (
      body.startsWith(MATRIX_PREFIX) ||
      body.startsWith('[irc/') ||
      body.startsWith('[cs/')
    ) {
      return;
    }

    const message: BridgeMessage = {
      id: event.event_id as string,
      platform: 'matrix',
      sender: event.sender as string,
      senderDisplayName: (event.sender as string).split(':')[0]?.replace('@', '') ?? 'unknown',
      content: body,
      source: roomId,
      timestamp: new Date((event.origin_server_ts as number) ?? Date.now()),
      isBridged: false,
    };

    this.notifyMessage(message);
  }

  /**
   * Make a request to the Matrix homeserver.
   */
  private async fetchMatrix(
    path: string,
    options: RequestInit = {}
  ): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), CONNECTION_TIMEOUT_MS);

    try {
      return await fetch(`${this.config.homeserverUrl}${path}`, {
        ...options,
        headers: {
          Authorization: `Bearer ${this.config.accessToken}`,
          'Content-Type': 'application/json',
          ...options.headers,
        },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Notify message handlers.
   */
  private notifyMessage(message: BridgeMessage): void {
    for (const handler of this.messageHandlers) {
      try {
        handler(message);
      } catch (error) {
        console.error('[MatrixAdapter] Error in message handler:', error);
      }
    }
  }

  /**
   * Notify error handlers.
   */
  private notifyError(error: Error): void {
    for (const handler of this.errorHandlers) {
      try {
        handler(error);
      } catch (e) {
        console.error('[MatrixAdapter] Error in error handler:', e);
      }
    }
  }
}
