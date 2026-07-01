/**
 * Core type definitions for the Swimchain Bridge Client
 */

/**
 * Space ID type (bech32m format: sp1...)
 */
export type SpaceId = string;

/**
 * Content hash type (sha256:...)
 */
export type ContentHash = string;

/**
 * Identity address type (bech32m format: cs1...)
 */
export type IdentityAddress = string;

/**
 * Supported platforms for bridging
 */
export type Platform = 'matrix' | 'irc' | 'cs';

/**
 * Connection status
 */
export type ConnectionStatus = 'connected' | 'connecting' | 'disconnected' | 'error';

/**
 * Direction of message bridging
 */
export type BridgeDirection = 'inbound' | 'outbound';

/**
 * Bridge configuration
 */
export interface BridgeConfig {
  /** Whether bridging is enabled */
  enabled: boolean;
  /** Target Swimchain space for bridged content */
  targetSpace: SpaceId;
  /** Daily PoW budget in seconds */
  dailyPowBudgetSeconds: number;
  /** Maximum posts per hour per space */
  maxPostsPerHour: number;
  /** Matrix configuration */
  matrix: MatrixConfig;
  /** IRC configuration */
  irc: IrcConfig;
}

/**
 * Matrix configuration
 */
export interface MatrixConfig {
  /** Whether Matrix bridging is enabled */
  enabled: boolean;
  /** Homeserver URL (e.g., https://matrix.org) */
  homeserverUrl: string;
  /** Access token for authentication */
  accessToken: string;
  /** User ID (e.g., @user:matrix.org) */
  userId: string;
  /** Room IDs to bridge */
  roomIds: string[];
}

/**
 * IRC configuration
 */
export interface IrcConfig {
  /** Whether IRC bridging is enabled */
  enabled: boolean;
  /** IRC server hostname */
  server: string;
  /** IRC server port */
  port: number;
  /** Use TLS */
  tls: boolean;
  /** IRC nickname */
  nickname: string;
  /** Channels to bridge */
  channels: string[];
  /** WebSocket proxy URL */
  proxyUrl: string;
}

/**
 * Message from any platform
 */
export interface BridgeMessage {
  /** Unique message ID */
  id: string;
  /** Source platform */
  platform: Platform;
  /** Platform-specific sender identifier */
  sender: string;
  /** Display name of sender */
  senderDisplayName: string;
  /** Message content (text only) */
  content: string;
  /** Source channel/room/space */
  source: string;
  /** Timestamp */
  timestamp: Date;
  /** Whether this was bridged from another platform */
  isBridged: boolean;
  /** Original platform if bridged */
  originalPlatform?: Platform;
}

/**
 * Space mapping configuration
 */
export interface SpaceMapping {
  /** Swimchain space ID */
  spaceId: SpaceId;
  /** Matrix room IDs mapped to this space */
  matrixRooms: string[];
  /** IRC channels mapped to this space */
  ircChannels: string[];
  /** Whether bridging is enabled for this mapping */
  enabled: boolean;
}

/**
 * Bridge status for a platform
 */
export interface PlatformStatus {
  /** Platform identifier */
  platform: Platform;
  /** Connection status */
  status: ConnectionStatus;
  /** Last error message */
  lastError?: string;
  /** Last successful sync time */
  lastSync?: Date;
  /** Number of messages bridged today */
  messagesBridgedToday: number;
}

/**
 * Activity log entry
 */
export interface ActivityLogEntry {
  /** Unique entry ID */
  id: string;
  /** Timestamp */
  timestamp: Date;
  /** Type of activity */
  type: 'message_bridged' | 'error' | 'connection' | 'rate_limited' | 'spam_blocked';
  /** Direction (if applicable) */
  direction?: BridgeDirection;
  /** Source platform */
  sourcePlatform?: Platform;
  /** Target platform */
  targetPlatform?: Platform;
  /** Brief description */
  description: string;
  /** Additional details */
  details?: Record<string, unknown>;
}

/**
 * Rate limit state
 */
export interface RateLimitState {
  /** Space ID being rate limited */
  spaceId: SpaceId;
  /** Timestamps of recent posts */
  postTimestamps: number[];
  /** When the rate limit resets */
  resetsAt: Date;
}

/**
 * Echo tracking entry
 */
export interface EchoEntry {
  /** Target platform message ID */
  targetId: string;
  /** When this entry was created */
  timestamp: number;
}

/**
 * Get default bridge configuration
 */
export function getDefaultConfig(): BridgeConfig {
  return {
    enabled: false,
    targetSpace: '',
    dailyPowBudgetSeconds: 3600,
    maxPostsPerHour: 10,
    matrix: {
      enabled: false,
      homeserverUrl: 'https://matrix.org',
      accessToken: '',
      userId: '',
      roomIds: [],
    },
    irc: {
      enabled: false,
      server: 'irc.libera.chat',
      port: 6697,
      tls: true,
      nickname: 'swimchain-bridge',
      channels: [],
      proxyUrl: 'ws://localhost:8080',
    },
  };
}

/**
 * Get default platform status
 */
export function getDefaultPlatformStatus(platform: Platform): PlatformStatus {
  return {
    platform,
    status: 'disconnected',
    messagesBridgedToday: 0,
  };
}

/**
 * Stored identity for bridge signing
 */
export interface StoredIdentity {
  address: string;         // cs1... bech32m address
  publicKey: string;       // Hex-encoded public key (64 hex chars = 32 bytes)
  seed: string;            // Hex-encoded seed/private key (64 hex chars = 32 bytes)
  createdAt: number;       // UNIX timestamp of creation
}
