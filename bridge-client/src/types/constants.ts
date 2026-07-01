/**
 * Constants for the Bridge Client
 * Values sourced from CLIENT_DESIGN §10.2
 */

// Rate Limiting
export const MAX_BRIDGE_POSTS_PER_HOUR = 10; // Maximum bridged posts per hour per space
export const RATE_LIMIT_WINDOW_MS = 3600_000; // 1 hour sliding window

// Echo Prevention
export const ECHO_TTL_MS = 3600_000; // 1 hour TTL for echo tracking

// PoW Budget
export const DAILY_POW_BUDGET_SECS = 3600; // 1 hour of PoW per day for bridged content

// Pool requirements (from SPEC_03)
export const POOL_REQUIRED_POW_SECS = 60; // 60 seconds total PoW required

// Polling intervals
export const MATRIX_POLL_INTERVAL_MS = 5000; // 5 seconds
export const IRC_POLL_INTERVAL_MS = 1000; // 1 second (IRC is faster)
export const CS_POLL_INTERVAL_MS = 10_000; // 10 seconds

// Connection timeouts
export const CONNECTION_TIMEOUT_MS = 30_000; // 30 seconds
export const RECONNECT_DELAY_MS = 5000; // 5 seconds

// Message formatting
export const MATRIX_PREFIX = '[matrix/'; // e.g., "[matrix/user]"
export const IRC_PREFIX = '[irc/'; // e.g., "[irc/nick]"
export const CS_PREFIX = '[cs/'; // e.g., "[cs/address]"

// Platform identifiers
export const PLATFORM = {
  MATRIX: 'matrix',
  IRC: 'irc',
  CHAINSOCIAL: 'cs',
} as const;

// Local storage keys
export const STORAGE_KEYS = {
  CONFIG: 'bridge_config',
  MATRIX_STATE: 'bridge_matrix_state',
  IRC_STATE: 'bridge_irc_state',
  RATE_LIMITS: 'bridge_rate_limits',
  ACTIVITY_LOG: 'bridge_activity_log',
} as const;

// IRC Proxy WebSocket message types
export const IRC_PROXY_MSG = {
  CONNECT: 'connect',
  SEND: 'send',
  CONNECTED: 'connected',
  DATA: 'data',
  ERROR: 'error',
  DISCONNECTED: 'disconnected',
} as const;

// Activity log size limit
export const MAX_ACTIVITY_LOG_ENTRIES = 500;

// Default IRC port
export const DEFAULT_IRC_PORT = 6697; // TLS
export const DEFAULT_IRC_PORT_PLAIN = 6667;
