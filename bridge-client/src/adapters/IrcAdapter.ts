/**
 * IRC Adapter
 *
 * Handles communication with IRC servers via a WebSocket proxy.
 * The proxy translates WebSocket messages to IRC protocol.
 *
 * Expected proxy protocol:
 * Client -> Proxy:
 *   { type: "connect", server: "irc.example.com", port: 6697, tls: true }
 *   { type: "send", data: "NICK bridgebot\r\n" }
 *
 * Proxy -> Client:
 *   { type: "connected" }
 *   { type: "data", data: ":server 001 bridgebot :Welcome...\r\n" }
 *   { type: "error", message: "Connection refused" }
 *   { type: "disconnected" }
 */

import type {
  BridgeMessage,
  IrcConfig,
  ConnectionStatus,
} from '../types';
import {
  IRC_PREFIX,
  IRC_PROXY_MSG,
  CONNECTION_TIMEOUT_MS,
  RECONNECT_DELAY_MS,
} from '../types/constants';

type MessageHandler = (message: BridgeMessage) => void;
type ErrorHandler = (error: Error) => void;

/**
 * Adapter for IRC server communication via WebSocket proxy.
 */
export class IrcAdapter {
  private config: IrcConfig;
  private status: ConnectionStatus = 'disconnected';
  private ws: WebSocket | null = null;
  private messageHandlers: Set<MessageHandler> = new Set();
  private errorHandlers: Set<ErrorHandler> = new Set();
  private lastError: string | undefined;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private messageBuffer: string = '';

  constructor(config: IrcConfig) {
    this.config = config;
  }

  /**
   * Connect to the IRC server via proxy.
   */
  async connect(): Promise<void> {
    if (!this.config.enabled) {
      throw new Error('IRC bridging is not enabled');
    }

    if (!this.config.proxyUrl || !this.config.server) {
      throw new Error('IRC proxy URL and server are required');
    }

    this.status = 'connecting';

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('IRC connection timeout'));
        this.ws?.close();
      }, CONNECTION_TIMEOUT_MS);

      try {
        this.ws = new WebSocket(this.config.proxyUrl);

        this.ws.onopen = () => {
          // Request connection to IRC server
          this.sendProxy({
            type: IRC_PROXY_MSG.CONNECT,
            server: this.config.server,
            port: this.config.port,
            tls: this.config.tls,
          });
        };

        this.ws.onmessage = (event) => {
          let msg: { type?: string; message?: string; data?: string };
          try {
            msg = JSON.parse(event.data);
          } catch (parseError) {
            console.error('[IrcAdapter] Failed to parse WebSocket message:', parseError);
            return;
          }

          // Validate message has expected structure
          if (!msg || typeof msg !== 'object' || typeof msg.type !== 'string') {
            console.warn('[IrcAdapter] Received malformed message:', msg);
            return;
          }

          if (msg.type === IRC_PROXY_MSG.CONNECTED) {
            clearTimeout(timeout);
            this.onConnected();
            this.status = 'connected';
            this.lastError = undefined;
            resolve();
          } else if (msg.type === IRC_PROXY_MSG.DATA) {
            if (msg.data) {
              this.onData(msg.data);
            }
          } else if (msg.type === IRC_PROXY_MSG.ERROR) {
            clearTimeout(timeout);
            this.status = 'error';
            this.lastError = msg.message;
            reject(new Error(msg.message ?? 'Unknown IRC error'));
          } else if (msg.type === IRC_PROXY_MSG.DISCONNECTED) {
            this.status = 'disconnected';
            this.scheduleReconnect();
          }
        };

        this.ws.onerror = (_event) => {
          clearTimeout(timeout);
          this.status = 'error';
          this.lastError = 'WebSocket error';
          reject(new Error('WebSocket error'));
        };

        this.ws.onclose = () => {
          this.status = 'disconnected';
          this.scheduleReconnect();
        };
      } catch (error) {
        clearTimeout(timeout);
        this.status = 'error';
        this.lastError = error instanceof Error ? error.message : 'Unknown error';
        reject(error);
      }
    });
  }

  /**
   * Disconnect from the IRC server.
   */
  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.ws) {
      this.sendIrc('QUIT :Swimchain Bridge disconnecting');
      this.ws.close();
      this.ws = null;
    }

    this.status = 'disconnected';
    console.log('[IrcAdapter] Disconnected');
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
   * Send a message to an IRC channel.
   *
   * @param channel - Channel to send to (with #)
   * @param content - Message content
   */
  sendMessage(channel: string, content: string): void {
    if (!channel.startsWith('#')) {
      channel = '#' + channel;
    }
    // Sanitize content to prevent IRC command injection
    const sanitizedContent = content.replace(/[\r\n]/g, ' ');
    this.sendIrc(`PRIVMSG ${channel} :${sanitizedContent}`);
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
  updateConfig(config: IrcConfig): void {
    const wasConnected = this.status === 'connected';
    if (wasConnected) {
      this.disconnect();
    }
    this.config = config;
    if (wasConnected && config.enabled) {
      this.connect().catch(() => {});
    }
  }

  /**
   * Handle successful connection to IRC server.
   */
  private onConnected(): void {
    console.log('[IrcAdapter] Connected to IRC server');

    // Send registration
    this.sendIrc(`NICK ${this.config.nickname}`);
    this.sendIrc(`USER ${this.config.nickname} 0 * :Swimchain Bridge`);

    // Join channels after a short delay
    setTimeout(() => {
      for (const channel of this.config.channels) {
        const chan = channel.startsWith('#') ? channel : '#' + channel;
        this.sendIrc(`JOIN ${chan}`);
      }
    }, 1000);
  }

  /**
   * Handle incoming IRC data.
   */
  private onData(data: string): void {
    this.messageBuffer += data;

    // Process complete lines
    const lines = this.messageBuffer.split('\r\n');
    this.messageBuffer = lines.pop() ?? '';

    for (const line of lines) {
      if (line.trim()) {
        this.processLine(line);
      }
    }
  }

  /**
   * Process a single IRC line.
   */
  private processLine(line: string): void {
    // Handle PING
    if (line.startsWith('PING')) {
      const arg = line.substring(5);
      this.sendIrc(`PONG ${arg}`);
      return;
    }

    // Parse PRIVMSG
    const privmsgMatch = line.match(/:([^!]+)!\S+ PRIVMSG (#\S+) :(.+)/);
    if (privmsgMatch) {
      const [, nick, channel, content] = privmsgMatch;

      // Skip if this looks like a bridged message
      if (
        content?.startsWith(IRC_PREFIX) ||
        content?.startsWith('[matrix/') ||
        content?.startsWith('[cs/')
      ) {
        return;
      }

      // Check if channel is in our list
      const normalizedChannel = channel?.toLowerCase();
      const inChannelList = this.config.channels.some(
        (c) => (c.startsWith('#') ? c : '#' + c).toLowerCase() === normalizedChannel
      );

      if (!inChannelList) return;

      const message: BridgeMessage = {
        id: `irc:${Date.now()}:${Math.random().toString(36).slice(2)}`,
        platform: 'irc',
        sender: nick ?? 'unknown',
        senderDisplayName: nick ?? 'unknown',
        content: content ?? '',
        source: channel ?? '',
        timestamp: new Date(),
        isBridged: false,
      };

      this.notifyMessage(message);
    }
  }

  /**
   * Send an IRC command.
   */
  private sendIrc(command: string): void {
    this.sendProxy({
      type: IRC_PROXY_MSG.SEND,
      data: command + '\r\n',
    });
  }

  /**
   * Send a message to the WebSocket proxy.
   */
  private sendProxy(msg: Record<string, unknown>): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  /**
   * Schedule a reconnection attempt.
   */
  private scheduleReconnect(): void {
    if (this.reconnectTimer || !this.config.enabled) return;

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      console.log('[IrcAdapter] Attempting reconnection...');
      this.connect().catch((error) => {
        this.notifyError(error instanceof Error ? error : new Error(String(error)));
      });
    }, RECONNECT_DELAY_MS);
  }

  /**
   * Notify message handlers.
   */
  private notifyMessage(message: BridgeMessage): void {
    for (const handler of this.messageHandlers) {
      try {
        handler(message);
      } catch (error) {
        console.error('[IrcAdapter] Error in message handler:', error);
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
        console.error('[IrcAdapter] Error in error handler:', e);
      }
    }
  }
}
