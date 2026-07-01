import type { GatewayConfig } from '@/types/gateway';

/**
 * Default configuration values
 */
const DEFAULTS = {
  rateLimitPerMinute: 60,
  searchRateLimitPerMinute: 20,
  cacheMaxAge: 300, // 5 minutes
  syncWindowHours: 168, // 7 days
} as const;

/**
 * Load and validate gateway configuration from environment
 */
export function loadGatewayConfig(): GatewayConfig {
  const nodeWebsocketUrl = process.env.NODE_WEBSOCKET_URL;
  const publicUrl = process.env.GATEWAY_PUBLIC_URL;

  if (!nodeWebsocketUrl) {
    throw new Error(
      'NODE_WEBSOCKET_URL environment variable is required. ' +
      'Set it to the WebSocket URL of a Swimchain node (e.g., ws://localhost:9001)'
    );
  }

  if (!publicUrl) {
    throw new Error(
      'GATEWAY_PUBLIC_URL environment variable is required. ' +
      'Set it to the public URL where this gateway is accessible (e.g., https://read.swimchain.io)'
    );
  }

  // Validate WebSocket URL format
  try {
    const wsUrl = new URL(nodeWebsocketUrl);
    if (!['ws:', 'wss:'].includes(wsUrl.protocol)) {
      throw new Error('NODE_WEBSOCKET_URL must use ws:// or wss:// protocol');
    }
  } catch (e) {
    if (e instanceof Error && e.message.includes('protocol')) {
      throw e;
    }
    throw new Error(`Invalid NODE_WEBSOCKET_URL: ${nodeWebsocketUrl}`);
  }

  // Validate public URL format
  try {
    const pubUrl = new URL(publicUrl);
    if (!['http:', 'https:'].includes(pubUrl.protocol)) {
      throw new Error('GATEWAY_PUBLIC_URL must use http:// or https:// protocol');
    }
  } catch (e) {
    if (e instanceof Error && e.message.includes('protocol')) {
      throw e;
    }
    throw new Error(`Invalid GATEWAY_PUBLIC_URL: ${publicUrl}`);
  }

  const config: GatewayConfig = {
    nodeWebsocketUrl,
    publicUrl,
    rateLimitPerMinute: parseIntEnv('RATE_LIMIT_REQUESTS_PER_MINUTE', DEFAULTS.rateLimitPerMinute),
    searchRateLimitPerMinute: parseIntEnv('RATE_LIMIT_SEARCH_PER_MINUTE', DEFAULTS.searchRateLimitPerMinute),
    cacheMaxAge: parseIntEnv('CACHE_MAX_AGE', DEFAULTS.cacheMaxAge),
    syncWindowHours: parseIntEnv('SYNC_WINDOW_HOURS', DEFAULTS.syncWindowHours),
  };

  // Validate numeric ranges
  if (config.rateLimitPerMinute < 1 || config.rateLimitPerMinute > 1000) {
    throw new Error('RATE_LIMIT_REQUESTS_PER_MINUTE must be between 1 and 1000');
  }
  if (config.searchRateLimitPerMinute < 1 || config.searchRateLimitPerMinute > 100) {
    throw new Error('RATE_LIMIT_SEARCH_PER_MINUTE must be between 1 and 100');
  }
  if (config.cacheMaxAge < 0 || config.cacheMaxAge > 86400) {
    throw new Error('CACHE_MAX_AGE must be between 0 and 86400 (24 hours)');
  }
  if (config.syncWindowHours < 1 || config.syncWindowHours > 8760) {
    throw new Error('SYNC_WINDOW_HOURS must be between 1 and 8760 (1 year)');
  }

  return config;
}

/**
 * Parse an integer environment variable with a default value
 */
function parseIntEnv(name: string, defaultValue: number): number {
  const value = process.env[name];
  if (value === undefined || value === '') {
    return defaultValue;
  }
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) {
    throw new Error(`${name} must be a valid integer, got: ${value}`);
  }
  return parsed;
}

/**
 * Get configuration (cached singleton)
 */
let _config: GatewayConfig | null = null;

export function getConfig(): GatewayConfig {
  if (_config === null) {
    _config = loadGatewayConfig();
  }
  return _config;
}

/**
 * Reset config cache (for testing)
 */
export function resetConfigCache(): void {
  _config = null;
}
