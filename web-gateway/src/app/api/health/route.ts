import { getConfig } from '@/lib/config/gateway';

interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  version: string;
  timestamp: string;
  gateway: {
    name: string;
    operator?: string;
    url?: string;
  };
  node: {
    connected: boolean;
    url?: string;
    lastSyncTime?: string;
    chainHeight?: number;
  };
  uptime: number;
}

const startTime = Date.now();

/**
 * Health check endpoint for monitoring and orchestration
 *
 * Returns:
 * - 200 OK: Gateway is healthy
 * - 503 Service Unavailable: Gateway is unhealthy
 */
export async function GET(): Promise<Response> {
  let config;
  try {
    config = getConfig();
  } catch {
    // Config not available (env vars missing) - return degraded status
    const status: HealthStatus = {
      status: 'degraded',
      version: process.env.npm_package_version || '1.0.0',
      timestamp: new Date().toISOString(),
      gateway: {
        name: process.env.GATEWAY_NAME || 'Swimchain Gateway',
        operator: process.env.GATEWAY_OPERATOR,
      },
      node: {
        connected: false,
      },
      uptime: Math.floor((Date.now() - startTime) / 1000),
    };

    return new Response(JSON.stringify(status, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    });
  }

  // Simulate node connection check (would actually ping the node)
  const nodeConnected = await checkNodeConnection(config.nodeWebsocketUrl);

  const status: HealthStatus = {
    status: nodeConnected ? 'healthy' : 'degraded',
    version: process.env.npm_package_version || '1.0.0',
    timestamp: new Date().toISOString(),
    gateway: {
      name: process.env.GATEWAY_NAME || 'Swimchain Gateway',
      operator: process.env.GATEWAY_OPERATOR,
      url: config.publicUrl,
    },
    node: {
      connected: nodeConnected,
      url: maskUrl(config.nodeWebsocketUrl),
      // These would come from actual node connection
      lastSyncTime: nodeConnected ? new Date().toISOString() : undefined,
      chainHeight: nodeConnected ? 12345 : undefined,
    },
    uptime: Math.floor((Date.now() - startTime) / 1000),
  };

  const httpStatus = status.status === 'unhealthy' ? 503 : 200;

  return new Response(JSON.stringify(status, null, 2), {
    status: httpStatus,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    },
  });
}

async function checkNodeConnection(nodeUrl?: string): Promise<boolean> {
  if (!nodeUrl) {
    return false;
  }

  // TODO: Implement actual node connection check
  // For now, simulate a connected node
  try {
    // Would do: const response = await fetch(nodeUrl + '/health', { timeout: 5000 });
    // return response.ok;
    return true;
  } catch {
    return false;
  }
}

function maskUrl(url: string): string {
  try {
    const parsed = new URL(url);
    // Hide credentials if present
    if (parsed.password) {
      parsed.password = '***';
    }
    return parsed.toString();
  } catch {
    return '[invalid url]';
  }
}
