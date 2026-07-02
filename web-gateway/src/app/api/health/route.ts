import { getConfig } from '@/lib/config/gateway';
import { NodeRpcClient } from '@/lib/node-rpc';

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
    peerCount?: number;
    network?: string;
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
 *
 * Performs a live RPC call to the configured node to verify connectivity.
 */
export async function GET(): Promise<Response> {
  let config;
  let nodeUrl: string | undefined;

  try {
    config = getConfig();
    nodeUrl = config.nodeWebsocketUrl;
  } catch {
    // Config not available (env vars missing)
  }

  // Use NODE_RPC_URL env var directly, or derive from WebSocket URL
  const rpcUrl = process.env.NODE_RPC_URL || nodeUrl;

  // Ping the node via RPC
  let nodeConnected = false;
  let nodeInfo: { chainHeight?: number; peerCount?: number; network?: string } = {};
  let lastSyncTime: string | undefined;

  if (rpcUrl) {
    try {
      const client = new NodeRpcClient(rpcUrl, 5000);
      nodeConnected = await client.ping();
      if (nodeConnected) {
        const info = client.getNodeInfo();
        if (info) {
          nodeInfo = {
            chainHeight: info.block_height,
            peerCount: info.peer_count,
            network: info.network,
          };
        }
        lastSyncTime = new Date().toISOString();
      }
    } catch {
      nodeConnected = false;
    }
  }

  const status: HealthStatus = {
    status: nodeConnected ? 'healthy' : 'degraded',
    version: process.env.npm_package_version || '1.0.0',
    timestamp: new Date().toISOString(),
    gateway: {
      name: process.env.GATEWAY_NAME || 'Swimchain Gateway',
      operator: process.env.GATEWAY_OPERATOR,
      url: config?.publicUrl,
    },
    node: {
      connected: nodeConnected,
      url: nodeUrl ? maskUrl(nodeUrl) : undefined,
      lastSyncTime,
      ...nodeInfo,
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

function maskUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.password) {
      parsed.password = '***';
    }
    return parsed.toString();
  } catch {
    return '[invalid url]';
  }
}
