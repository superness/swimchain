import { checkNodeHealth } from '@/lib/rpc';

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
    latencyMs?: number;
    network?: string;
    version?: string;
    peerCount?: number;
    chainHeight?: number;
    error?: string;
  };
  uptime: number;
}

const startTime = Date.now();

export const dynamic = 'force-dynamic';

/**
 * Health check endpoint for monitoring and orchestration
 *
 * Performs a real get_info round-trip against the configured node
 * (NODE_RPC_URL, default http://127.0.0.1:19736).
 *
 * Returns:
 * - 200 OK: Gateway is healthy (node reachable) or degraded (node down,
 *   gateway still serving)
 * - 503 Service Unavailable: Gateway is unhealthy
 */
export async function GET(): Promise<Response> {
  const nodeHealth = await checkNodeHealth();

  const status: HealthStatus = {
    status: nodeHealth.healthy ? 'healthy' : 'degraded',
    version: process.env.npm_package_version || '1.0.0',
    timestamp: new Date().toISOString(),
    gateway: {
      name: process.env.GATEWAY_NAME || 'Swimchain Gateway',
      operator: process.env.GATEWAY_OPERATOR,
      url: process.env.GATEWAY_PUBLIC_URL,
    },
    node: nodeHealth.healthy && nodeHealth.info
      ? {
          connected: true,
          latencyMs: nodeHealth.latencyMs ?? undefined,
          network: nodeHealth.info.network,
          version: nodeHealth.info.version,
          peerCount: nodeHealth.info.peer_count,
          chainHeight: nodeHealth.info.block_height,
        }
      : {
          connected: false,
          error: nodeHealth.error,
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
