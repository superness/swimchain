/**
 * React hooks for Swimchain RPC integration
 */

import { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import {
  SwimchainRpc,
  RpcConfig,
  initRpc,
  LOCAL_CONFIG,
  TESTNET_SEED_SF,
  getLocalConfigWithAuth,
  isInTauri,
} from '../lib/rpc';
import { getParentConfig, isInIframe } from './useParentRpcConfig';
import { logger } from '../lib/logger';

import type { Space, Thread, Reply, SyncStatus, StoredIdentity } from '../types';

// Allow overriding endpoint via env for testing without local node
// Set VITE_USE_REMOTE_SEED=true when running: npm run dev
const USE_REMOTE_SEED = import.meta.env.VITE_USE_REMOTE_SEED === 'true';
const REMOTE_SEED_CONFIG = TESTNET_SEED_SF;

// Storage key for identity (must match useStoredIdentity)
const IDENTITY_STORAGE_KEY = 'swimchain-identity';

// Tracks space IDs we've already queried via resolve_space_name this session.
// Prevents re-querying every refetch while a peer is still mid-response.
const spaceNamesAsked = new Set<string>();

/**
 * Load stored identity from localStorage
 */
function loadStoredIdentity(): StoredIdentity | null {
  // In node mode (embedded; the node owns the identity) ignore any browser identity
  // left in localStorage from a prior browser-mode session. Using it would authenticate
  // RPC calls as a stale key the node doesn't recognize as the user — an identity
  // split-brain where the signer shows the node address but calls act as the old key.
  if (getParentConfig() && isInIframe()) {
    return null;
  }
  try {
    const stored = localStorage.getItem(IDENTITY_STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored) as StoredIdentity;
    }
  } catch (error) {
    console.error('Failed to load identity for RPC auth:', error);
  }
  return null;
}

// =========================================================================
// Context
// =========================================================================

interface RpcContextValue {
  rpc: SwimchainRpc | null;
  connected: boolean;
  connecting: boolean;
  error: string | null;
  /** Whether authentication is ready (remote signer configured) */
  authReady: boolean;
  nodeInfo: {
    version: string;
    network: string;
    peerCount: number;
  } | null;
  connect: (config: RpcConfig) => Promise<boolean>;
  disconnect: () => void;
  /** Set up remote signing via node identity */
  setRemoteSigner: (publicKeyHex: string, signFn: (messageHex: string) => Promise<string | null>) => void;
}

const RpcContext = createContext<RpcContextValue | null>(null);

// HMR-persistent storage for RPC state
// @ts-expect-error - Using global for HMR persistence
const hmrState = globalThis.__swimchain_rpc_hmr_state ?? {
  rpc: null as SwimchainRpc | null,
  connected: false,
  authReady: false,
  nodeInfo: null as RpcContextValue['nodeInfo'],
};
// @ts-expect-error - Using global for HMR persistence
globalThis.__swimchain_rpc_hmr_state = hmrState;

/**
 * RPC Provider component
 */
export function RpcProvider({ children }: { children: ReactNode }) {
  logger.info('[RPC] ===== RpcProvider MOUNTING =====', {
    inIframe: isInIframe(),
    inTauri: isInTauri(),
    useRemoteSeed: USE_REMOTE_SEED,
    parentConfig: getParentConfig() ? 'exists' : 'none',
    hmrRpc: !!hmrState.rpc,
    hmrConnected: hmrState.connected,
  });

  // Restore state from HMR if available
  const [rpc, setRpc] = useState<SwimchainRpc | null>(hmrState.rpc);
  const [connected, setConnected] = useState(hmrState.connected);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nodeInfo, setNodeInfo] = useState<RpcContextValue['nodeInfo']>(hmrState.nodeInfo);
  const [authReady, setAuthReady] = useState(hmrState.authReady);

  // Track identity seed to detect changes and reconnect
  const lastIdentitySeedRef = useRef<string | null>(null);

  const connect = useCallback(async (config: RpcConfig): Promise<boolean> => {
    logger.info('[RPC] connect() called with config:', {
      endpoint: config.endpoint,
      hasAuth: !!config.auth,
      hasAuthHeader: !!config.authHeader,
      hasSeed: !!config.seed,
    });
    setConnecting(true);
    setError(null);

    try {
      logger.info('[RPC] Creating RPC client...');
      const client = initRpc(config);
      logger.info('[RPC] Calling client.connect()...');
      const success = await client.connect();
      logger.info('[RPC] client.connect() returned:', success);

      if (success) {
        const info = client.getNodeInfo();
        const nodeInfoObj = info ? {
          version: info.version,
          network: info.network,
          peerCount: info.peer_count,
        } : null;
        logger.info('[RPC] Node info:', info);

        // Update both React state and HMR-persistent state
        setRpc(client);
        setConnected(true);
        setNodeInfo(nodeInfoObj);
        hmrState.rpc = client;
        hmrState.connected = true;
        hmrState.nodeInfo = nodeInfoObj;

        return true;
      } else {
        logger.error('[RPC] Connection failed (success=false)');
        setError('Failed to connect to node');
        return false;
      }
    } catch (err) {
      logger.error('[RPC] Connection error:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
      return false;
    } finally {
      setConnecting(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    setRpc(null);
    setConnected(false);
    setNodeInfo(null);
    hmrState.rpc = null;
    hmrState.connected = false;
    hmrState.nodeInfo = null;
  }, []);

  // =========================================================================
  // LOCAL NODE ONLY - Connect to your embedded node
  // =========================================================================
  // The forum-client ONLY connects to localhost. This is by design.
  // If you see "connection failed", start your local node first.
  //
  // Architecture:
  //   forum-client → YOUR NODE (localhost) → NETWORK (p2p)
  //
  // The client does NOT connect directly to remote seeds.
  // =========================================================================

  /**
   * Build RPC config with identity for signature auth
   */
  const buildConfigWithIdentity = async (): Promise<RpcConfig> => {
    // Get base config - check sources in order of priority:
    // 1. Parent frame config (when running in a shell iframe — the shell's
    //    endpoint/auth is authoritative; a baked-in VITE_RPC_PORT from
    //    .env.local must NOT override it, that pointed node-mode at the
    //    wrong node's port with no auth)
    // 2. VITE_RPC_PORT env var (dev-server / multi-instance setups)
    // 3. VITE_USE_REMOTE_SEED env var
    // 4. Tauri (standalone Tauri app with cookie auth)
    // 5. Local fallback (development)
    let baseConfig: RpcConfig;

    const rpcPort = import.meta.env.VITE_RPC_PORT;
    if (getParentConfig() && isInIframe()) {
      const parentConfig = getParentConfig()!;
      logger.info('[RPC] Using parent frame config:', {
        endpoint: parentConfig.rpcEndpoint,
        hasAuth: !!parentConfig.rpcAuth,
      });
      baseConfig = {
        endpoint: parentConfig.rpcEndpoint,
        authHeader: parentConfig.rpcAuth,
      };
    } else if (rpcPort) {
      logger.info('[RPC] Using VITE_RPC_PORT:', rpcPort);
      baseConfig = { endpoint: `http://127.0.0.1:${rpcPort}`, timeout: 30000 };
    } else if (USE_REMOTE_SEED) {
      logger.info('[RPC] Using remote seed:', REMOTE_SEED_CONFIG.endpoint);
      baseConfig = REMOTE_SEED_CONFIG;
    } else if (isInTauri()) {
      baseConfig = await getLocalConfigWithAuth('testnet');
    } else {
      baseConfig = LOCAL_CONFIG;
    }

    // Load identity for signature auth (browser clients)
    const identity = loadStoredIdentity();
    logger.info('[RPC] Loaded identity from storage:', {
      hasSeed: !!identity?.seed,
      seedLength: identity?.seed?.length,
      hasPublicKey: !!identity?.publicKey,
      publicKeyPrefix: identity?.publicKey?.substring(0, 16) + '...',
    });

    if (identity?.seed && identity?.publicKey) {
      logger.info('[RPC] Identity has seed and publicKey - will use signature auth');
      return {
        ...baseConfig,
        seed: identity.seed,
        publicKey: identity.publicKey,
      };
    }

    logger.info('[RPC] No valid identity found - check Identity page and create one');
    return baseConfig;
  };

  useEffect(() => {
    let retryInterval: ReturnType<typeof setInterval> | null = null;
    let identityCheckInterval: ReturnType<typeof setInterval> | null = null;

    const doConnect = async (): Promise<boolean> => {
      const config = await buildConfigWithIdentity();

      // Track the identity seed we're using
      lastIdentitySeedRef.current = config.seed ?? null;

      // Log auth method being used
      if (config.seed) {
        logger.info('[RPC] Using signature authentication');
      } else if (config.authHeader) {
        logger.info('[RPC] Using authHeader from parent frame');
      } else if (config.auth) {
        logger.info('[RPC] Using cookie/credential authentication');
      } else {
        logger.warn('[RPC] No authentication available - create an identity first');
      }

      return connect(config);
    };

    const autoConnect = async () => {
      // Skip auto-connect if we already have a connection (from HMR)
      if (hmrState.rpc && hmrState.connected) {
        logger.info('[RPC] Skipping auto-connect - already connected via HMR state');
        return;
      }

      logger.info('[RPC] Connecting to local node...');

      if (await doConnect()) {
        logger.info('[RPC] *** CONNECTED *** to local node - components should now fetch data');
        return;
      }

      // Connection failed - user needs to start their node
      logger.info('[RPC] Could not connect to local node');
      logger.info('[RPC] Make sure your Swimchain node is running: sw node start --testnet');

      // Retry every 5 seconds
      retryInterval = setInterval(async () => {
        if (await doConnect()) {
          logger.info('[RPC] Connected to local node');
          if (retryInterval) clearInterval(retryInterval);
        }
      }, 5000);
    };

    // Check for identity changes every second
    // This is needed because the identity can be created on the Identity page
    // and we need to reconnect with the new credentials
    identityCheckInterval = setInterval(() => {
      const currentIdentity = loadStoredIdentity();
      const currentSeed = currentIdentity?.seed ?? null;

      if (currentSeed !== lastIdentitySeedRef.current) {
        logger.info('[RPC] Identity changed, reconnecting...');
        // Clear retry interval if active
        if (retryInterval) {
          clearInterval(retryInterval);
          retryInterval = null;
        }
        // Reconnect with new identity
        doConnect().then(success => {
          if (success) {
            logger.info('[RPC] Reconnected with new identity');
          } else {
            logger.info('[RPC] Failed to reconnect, will retry...');
            // Start retry loop
            retryInterval = setInterval(async () => {
              if (await doConnect()) {
                logger.info('[RPC] Connected to local node');
                if (retryInterval) clearInterval(retryInterval);
              }
            }, 5000);
          }
        });
      }
    }, 1000);

    // If running in iframe, wait for parent config before connecting
    // The parent frame sends config via postMessage after iframe loads
    if (isInIframe() && !getParentConfig()) {
      logger.info('[RPC] In iframe without parent config - waiting for postMessage...');

      // Set up a one-time listener for parent config
      const handleParentConfig = () => {
        logger.info('[RPC] Parent config received, connecting...');
        // Clear retry interval if active
        if (retryInterval) {
          clearInterval(retryInterval);
          retryInterval = null;
        }
        doConnect().then(success => {
          if (success) {
            logger.info('[RPC] Connected with parent-provided config');
          } else {
            logger.info('[RPC] Failed to connect with parent config, will retry...');
            retryInterval = setInterval(async () => {
              if (await doConnect()) {
                logger.info('[RPC] Connected to node via parent config');
                if (retryInterval) clearInterval(retryInterval);
              }
            }, 5000);
          }
        });
      };

      // Listen for parent config via message event
      const messageHandler = (event: MessageEvent) => {
        if (event.data?.type === 'SWIMCHAIN_RPC_CONFIG') {
          // Parent config hook will have already stored it, just trigger connect
          handleParentConfig();
          window.removeEventListener('message', messageHandler);
        }
      };
      window.addEventListener('message', messageHandler);

      // Clean up intervals on unmount
      return () => {
        if (retryInterval) clearInterval(retryInterval);
        if (identityCheckInterval) clearInterval(identityCheckInterval);
        window.removeEventListener('message', messageHandler);
      };
    }

    // Not in iframe or already have parent config - connect normally
    autoConnect();

    // Clean up intervals on unmount
    return () => {
      if (retryInterval) clearInterval(retryInterval);
      if (identityCheckInterval) clearInterval(identityCheckInterval);
    };
  }, [connect]);

  // Set up remote signer for node identity
  const setRemoteSigner = useCallback((publicKeyHex: string, signFn: (messageHex: string) => Promise<string | null>) => {
    if (rpc) {
      rpc.setRemoteSigner(publicKeyHex, signFn);
      setAuthReady(true);
      hmrState.authReady = true; // Persist for HMR/StrictMode remounts
      logger.info('[RPC] Remote signer configured for node identity - auth is now ready');
    } else {
      logger.warn('[RPC] Cannot set remote signer - RPC not connected');
    }
  }, [rpc]);

  return (
    <RpcContext.Provider value={{ rpc, connected, connecting, error, authReady, nodeInfo, connect, disconnect, setRemoteSigner }}>
      {children}
    </RpcContext.Provider>
  );
}

/**
 * Hook to access RPC context
 */
export function useRpc() {
  const context = useContext(RpcContext);
  if (!context) {
    throw new Error('useRpc must be used within RpcProvider');
  }
  return context;
}

// =========================================================================
// Data fetching hooks
// =========================================================================

/**
 * Hook to fetch sync status
 */
export function useNetworkStatus(): { status: SyncStatus | null; loading: boolean; error: string | null } {
  const { rpc, connected } = useRpc();
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!rpc || !connected) {
      setStatus(null);
      setLoading(false);
      return;
    }

    const fetchStatus = async () => {
      try {
        const [syncStatus, peers] = await Promise.all([
          rpc.getSyncStatus(),
          rpc.getPeers(),
        ]);

        setStatus({
          chainPercent: syncStatus.chain_percent,
          peerCount: syncStatus.peer_count,
          peersReceiving: peers.filter(p => p.direction === 'Inbound').length,
          peersSending: peers.filter(p => p.direction === 'Outbound').length,
          storageMB: syncStatus.storage_mb,
          storageTargetMB: syncStatus.storage_target_mb,
          lastBlockTime: syncStatus.last_block_time ?? Math.floor(Date.now() / 1000),
          state: syncStatus.state === 'synced' ? 'synced' :
                 syncStatus.state === 'syncing' ? 'syncing' :
                 syncStatus.state === 'behind' ? 'behind' : 'offline',
        });
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch status');
      } finally {
        setLoading(false);
      }
    };

    fetchStatus();

    // Refresh every 10 seconds
    const interval = setInterval(fetchStatus, 10000);
    return () => clearInterval(interval);
  }, [rpc, connected]);

  return { status, loading, error };
}

/**
 * Hook to fetch spaces from the node
 */
export function useSpaces(): { spaces: Space[]; loading: boolean; error: string | null; refetch: () => Promise<void> } {
  const { rpc, connected, authReady } = useRpc();
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async (skipCache = false) => {
    // Import cache functions
    const { getFromMemory, setInMemory, getFromStorage, setInStorage } = await import('../lib/cache');
    const CACHE_KEY = 'spaces';

    // Check memory cache first (fastest)
    if (!skipCache) {
      const memoryCached = getFromMemory<Space[]>(CACHE_KEY);
      if (memoryCached) {
        setSpaces(memoryCached);
        setLoading(false);
        return;
      }

      // Check localStorage cache (persists across refreshes)
      const storageCached = getFromStorage<Space[]>(CACHE_KEY);
      if (storageCached) {
        setSpaces(storageCached);
        setInMemory(CACHE_KEY, storageCached, 5 * 60 * 1000); // Also populate memory
        setLoading(false);
        // Fetch fresh data in background
        setTimeout(() => refetch(true), 100);
        return;
      }
    }

    if (!rpc || !connected || !authReady) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const result = await rpc.listSpaces();

      // Spaces with no resolved name (name: null on the wire) are hidden from
      // the list — a bare hex id is meaningless to browse. They still get a
      // targeted name-resolve below, so they appear once the name arrives.
      const namedSpaces = result.spaces.filter(s => s.name);

      // Transform RPC result to Space format
      const transformedSpaces: Space[] = namedSpaces.map(s => ({
        id: s.space_id,
        name: s.name ?? s.space_id.substring(0, 12) + '...', // Use space_id prefix if no name
        description: `${s.post_count} ${s.post_count === 1 ? 'post' : 'posts'}`,
        creator: '', // Not tracked in RPC response
        createdAt: s.last_activity ?? 0, // Use last activity as proxy
        activePostCount: s.post_count, // No separate active count from RPC
        postCount: s.post_count,
        // Behavioral communities that grew out of this space (SPEC_13, Phase 2).
        // Additive: `children` is omitted when empty / on pre-Phase-2 nodes.
        communities: s.children?.map(c => ({
          communityId: c.community_id,
          spaceId: c.space_id,
          parentSpaceId: s.space_id,
          name: c.name,
          fullName: c.full_name,
          formedAt: c.formed_at,
          formationHeight: c.formation_height,
          foundingMemberCount: c.founding_member_count,
        })),
      }));

      // Cache the result
      setInMemory(CACHE_KEY, transformedSpaces, 5 * 60 * 1000); // 5 min memory
      setInStorage(CACHE_KEY, transformedSpaces, 30 * 60 * 1000); // 30 min storage

      setSpaces(transformedSpaces);
      setError(null);

      // Resolve placeholder names lazily (Bug #4).
      // Current nodes report an unresolved name as null (the space is hidden
      // above until it resolves); older nodes sent a literal "Space 000be491"
      // placeholder. Fire targeted GET_SPACE_META queries to peers for both
      // shapes and re-fetch once if any peer responds.
      const PLACEHOLDER = /^Space [0-9a-f]{8}$/;
      const placeholderIds = result.spaces
        .filter(s => !s.name || PLACEHOLDER.test(s.name))
        .map(s => s.space_id)
        .filter(id => !spaceNamesAsked.has(id));

      if (placeholderIds.length > 0) {
        placeholderIds.forEach(id => {
          spaceNamesAsked.add(id);
          rpc.resolveSpaceName(id).catch(err =>
            console.warn('[Spaces] resolveSpaceName failed for', id, err)
          );
        });
        // Re-fetch once after peers have had a chance to respond.
        setTimeout(() => {
          // skipCache=true so we hit the server, not the just-cached placeholders.
          refetch(true).catch(() => undefined);
        }, 1500);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch spaces');
      // Keep existing spaces on error
    } finally {
      setLoading(false);
    }
  }, [rpc, connected, authReady]);

  useEffect(() => {
    if (connected && authReady) {
      // Clear any previous errors from unauthenticated requests
      setError(null);
      refetch();
    } else {
      console.log('[useSpaces] NOT calling refetch:', { connected, authReady });
    }
  }, [connected, authReady, refetch]);

  return { spaces, loading, error, refetch: () => refetch(true) };
}

/**
 * Helper to transform ContentResult to Thread with safe defaults
 */
function contentToThread(
  content: {
    content_id: string;
    space_id: string;
    author_id: string;
    title: string | null;
    body: string | null;
    created_at: number;
    last_engagement: number;
    // Content type ("Post", "Reply", "Engage")
    content_type?: string;
    // Parent ID for replies
    parent_id?: string | null;
    // Decay fields from daemon
    decay_state?: string;
    seconds_until_decay_starts?: number | null;
    seconds_until_pruned?: number | null;
    survival_probability?: number;
    is_protected?: boolean;
    time_since_engagement?: number;
    // Reply count from daemon
    reply_count?: number;
    // Pool fields from daemon (from list_space_content)
    has_pool?: boolean;
    pool_progress?: number;
    pool_status?: string;
    // Media attachments
    media_refs?: Array<{
      media_hash: string;
      media_type: string;
      size_bytes: number;
    }>;
    // Whether content is pending in mempool
    pending?: boolean;
    // Author's display name (if set)
    display_name?: string | null;
  },
  poolData?: {
    has_pool: boolean;
    total_pow: number;
    required_pow: number;
    status: string;
    contributor_count: number;
  },
  isUnavailable: boolean = false
): Thread {
  // Default timestamps with safety for undefined/null/0
  // Backend returns milliseconds, convert to seconds for formatRelativeTime
  const createdAtMs = content.created_at || Date.now();
  const lastEngagementMs = content.last_engagement || createdAtMs;
  const createdAt = Math.floor(createdAtMs / 1000);
  const lastEngagement = Math.floor(lastEngagementMs / 1000);

  // Map pool status from RPC to PoolState status
  // First check inline pool data from list_space_content, then fallback to poolData
  let poolStatus: 'empty' | 'partial' | 'complete' | 'locked' = 'empty';
  let poolProgress = 0;

  if (content.has_pool) {
    // Pool data comes from list_space_content
    if (content.pool_status === 'completed') {
      poolStatus = 'complete';
    } else if ((content.pool_progress ?? 0) > 0) {
      poolStatus = 'partial';
    }
    poolProgress = content.pool_progress ?? 0;
  } else if (poolData?.has_pool) {
    // Fallback to separate pool data (for get_content calls)
    if (poolData.status === 'completed') {
      poolStatus = 'complete';
    } else if (poolData.total_pow > 0) {
      poolStatus = 'partial';
    }
    poolProgress = poolData.required_pow > 0 ? poolData.total_pow / poolData.required_pow : 0;
  }

  // Map decay state from RPC
  const decayState = (content.decay_state as 'protected' | 'active' | 'stale' | 'decayed') || 'active';

  // Derive title from first line of body if no explicit title
  // If body is null/undefined, content is still being fetched from network
  // If isUnavailable, content timed out and will not arrive
  const bodyMissing = content.body === null || content.body === undefined;
  const body = isUnavailable && bodyMissing
    ? '[Content unavailable - not found on network]'
    : (content.body ?? '');
  const derivedTitle = content.title ?? (
    isUnavailable && bodyMissing
      ? '(Content unavailable)'
      : bodyMissing
        ? '(Loading from network...)'
        : (body.split('\n')[0]?.trim().substring(0, 80) || 'Untitled')
  );

  return {
    id: content.content_id,
    spaceId: content.space_id,
    author: content.author_id,
    displayName: content.display_name ?? undefined,
    title: derivedTitle,
    content: body,
    createdAt,
    lastEngagement,
    replyCount: content.reply_count ?? 0,
    heat: content.survival_probability ?? calculateHeat(createdAt, lastEngagement),
    pool: {
      contributedSeconds: Math.round(poolProgress * 60), // Convert progress to seconds (60s required)
      requiredSeconds: poolData?.required_pow ?? 60,
      contributorCount: poolData?.contributor_count ?? 0,
      status: poolStatus,
    },
    decay: {
      state: decayState,
      survivalProbability: content.survival_probability ?? 1.0,
      isProtected: content.is_protected ?? false,
      secondsUntilDecayStarts: content.seconds_until_decay_starts ?? null,
      secondsUntilPruned: content.seconds_until_pruned ?? null,
      timeSinceEngagement: content.time_since_engagement ?? 0,
    },
    mediaRefs: content.media_refs?.map(mr => ({
      mediaHash: mr.media_hash,
      mediaType: mr.media_type,
      sizeBytes: mr.size_bytes,
    })),
    pending: content.pending,
  };
}

/**
 * Hook to fetch threads for a space
 * Automatically requests missing content blobs from the network
 */
export function useSpaceThreads(spaceId: string, options?: { offset?: number; limit?: number }): {
  threads: Thread[];
  loading: boolean;
  error: string | null;
  fetching: boolean; // True while fetching missing content from network
  total: number; // Total count for pagination
  refetch: () => Promise<void>;
} {
  const { rpc, connected, authReady } = useRpc();
  const [threads, setThreads] = useState<Thread[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fetching, setFetching] = useState(false);
  const [total, setTotal] = useState(0);
  const pendingRequestsRef = useRef<Set<string>>(new Set());
  // Track content IDs that timed out and are unavailable
  const unavailableContentRef = useRef<Set<string>>(new Set());

  const offset = options?.offset ?? 0;
  const limit = options?.limit ?? 50;

  const refetch = useCallback(async (skipCache = false) => {

    // Import cache functions
    const { getFromMemory, setInMemory } = await import('../lib/cache');
    const CACHE_KEY = `threads:${spaceId}:${offset}:${limit}`;

    // Check memory cache first (show cached immediately, fetch fresh in bg)
    if (!skipCache) {
      const cached = getFromMemory<{ threads: Thread[]; total: number }>(CACHE_KEY);
      if (cached) {
        setThreads(cached.threads);
        setTotal(cached.total);
        setLoading(false);
        // Fetch fresh data in background
        setTimeout(() => refetch(true), 100);
        return;
      }
    }

    if (!rpc) {
      setLoading(false);
      return;
    }
    if (!connected || !authReady) {
      // Don't set loading=false so UI shows loading state
      return;
    }

    if (!skipCache) setLoading(true);
    try {
      // Use listSpacePosts which filters for Posts at the database level
      // This is more efficient than listSpaceContent + client-side filter
      const result = await rpc.listSpacePosts(spaceId, { offset, limit });

      // All items should be Posts now (filtered by server)
      const topLevelPosts = result.items;

      const transformedThreads: Thread[] = topLevelPosts.map(item => contentToThread(item));

      setThreads(transformedThreads);
      setTotal(result.total || topLevelPosts.length);
      setError(null);

      // Cache the result (2 min TTL for threads - they change more frequently)
      setInMemory(CACHE_KEY, { threads: transformedThreads, total: result.total || topLevelPosts.length }, 2 * 60 * 1000);

      // Check for items with missing body (body is null) and request them from network
      const missingContentIds = topLevelPosts
        .filter(item => item.body === null || item.body === undefined)
        .map(item => item.content_id)
        .filter(id => !pendingRequestsRef.current.has(id)); // Don't re-request pending items

      if (missingContentIds.length > 0) {
        setFetching(true);

        // Request all missing content in parallel
        const requestPromises = missingContentIds.map(async (contentId) => {
          pendingRequestsRef.current.add(contentId);
          try {
            await rpc.requestContent(contentId);
            return { contentId, success: true };
          } catch (err) {
            console.warn('[useSpaceThreads] Failed to request', contentId, ':', err);
            return { contentId, success: false };
          }
        });

        await Promise.all(requestPromises);

        // Poll for content arrival - check every 2 seconds for up to 30 seconds
        let pollCount = 0;
        const maxPolls = 15;

        const pollForContent = async () => {
          if (pollCount >= maxPolls) {
            setFetching(false);
            // Mark remaining missing content as unavailable and update UI
            missingContentIds.forEach(id => {
              pendingRequestsRef.current.delete(id);
              unavailableContentRef.current.add(id);
            });
            // Re-fetch and update with unavailable markers
            try {
              const finalResult = await rpc.listSpaceContent(spaceId);
              const finalPosts = finalResult.items.filter(
                item => item.content_type === 'Post' || (!item.parent_id && item.content_type !== 'Reply')
              );
              const updatedThreads = finalPosts.map(item =>
                contentToThread(item, undefined, unavailableContentRef.current.has(item.content_id))
              );
              setThreads(updatedThreads);
            } catch { /* ignore */ }
            return;
          }

          pollCount++;
          await new Promise(resolve => setTimeout(resolve, 2000));

          // Re-fetch space content to see if any bodies have arrived
          try {
            const pollResult = await rpc.listSpaceContent(spaceId);
            const pollPosts = pollResult.items.filter(
              item => item.content_type === 'Post' || (!item.parent_id && item.content_type !== 'Reply')
            );

            // Check how many still have missing bodies
            const stillMissing = pollPosts.filter(
              item => (item.body === null || item.body === undefined) && missingContentIds.includes(item.content_id)
            );

            // Update threads with any newly arrived content
            const updatedThreads = pollPosts.map(item =>
              contentToThread(item, undefined, unavailableContentRef.current.has(item.content_id))
            );
            setThreads(updatedThreads);

            if (stillMissing.length === 0) {
              setFetching(false);
              missingContentIds.forEach(id => pendingRequestsRef.current.delete(id));
              return;
            }

            await pollForContent();
          } catch (pollErr) {
            console.warn('[useSpaceThreads] Poll error:', pollErr);
            // Continue polling despite errors
            await pollForContent();
          }
        };

        // Start polling in background (don't await - let UI render with partial data)
        pollForContent();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch threads');
    } finally {
      setLoading(false);
    }
  }, [rpc, connected, authReady, spaceId, offset, limit]);

  // Log when connection state changes for debugging
  useEffect(() => {
    if (connected && authReady && rpc && spaceId) {
      console.log('[useSpaceThreads] *** Should now fetch content for space:', spaceId);
    }
  }, [rpc, connected, authReady, spaceId]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { threads, loading, error, fetching, total, refetch };
}

/**
 * Hook to fetch a single thread
 * Will request content from network if not available locally
 */
export function useThread(contentId: string): {
  thread: Thread | null;
  loading: boolean;
  error: string | null;
  fetching: boolean;
  refetch: () => Promise<void>;
} {
  const { rpc, connected, authReady } = useRpc();
  const [thread, setThread] = useState<Thread | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fetching, setFetching] = useState(false);

  // Refetch function that can be called after pool completion
  const refetch = async () => {
    if (!rpc || !connected || !authReady || !contentId) return;

    try {
      const content = await rpc.getContent(contentId);
      let poolData;
      try {
        poolData = await rpc.getPoolForContent(contentId);
      } catch { /* Pool data not available */ }
      setThread(contentToThread(content, poolData));
    } catch (err) {
      console.error('[useThread] Refetch error:', err);
    }
  };

  useEffect(() => {
    if (!rpc || !connected || !authReady || !contentId) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    const fetchThread = async () => {
      setLoading(true);
      setError(null);

      try {
        // First, try to get content locally
        const content = await rpc.getContent(contentId);

        // Also fetch pool data for this content
        let poolData;
        try {
          poolData = await rpc.getPoolForContent(contentId);
        } catch (poolErr) {
          console.log('[useThread] Failed to get pool data:', poolErr);
        }

        if (!cancelled) {
          setThread(contentToThread(content, poolData));
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';

        // If content not found, try to request from network
        if (errorMessage.includes('not found') || errorMessage.includes('Content not found')) {
          setFetching(true);

          try {
            // Request content from network
            const requestResult = await rpc.requestContent(contentId);

            if (requestResult.status === 'found_locally') {
              // Content was already available - retry get
              const content = await rpc.getContent(contentId);
              let poolData;
              try {
                poolData = await rpc.getPoolForContent(contentId);
              } catch { /* Pool data not available */ }
              if (!cancelled) {
                setThread(contentToThread(content, poolData));
                setFetching(false);
              }
            } else {
              // Content is being fetched from network - poll for it
              let retries = 0;
              const maxRetries = 30; // 30 seconds max

              const pollForContent = async (): Promise<void> => {
                if (cancelled || retries >= maxRetries) {
                  if (!cancelled) {
                    setError('Content not available on network after 30 seconds');
                    setFetching(false);
                  }
                  return;
                }

                retries++;
                await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second

                try {
                  const content = await rpc.getContent(contentId);
                  let poolData;
                  try {
                    poolData = await rpc.getPoolForContent(contentId);
                  } catch { /* Pool data not available */ }
                  if (!cancelled) {
                    setThread(contentToThread(content, poolData));
                    setFetching(false);
                  }
                } catch {
                  // Still not available, keep polling
                  await pollForContent();
                }
              };

              await pollForContent();
            }
          } catch (fetchErr) {
            if (!cancelled) {
              console.error('[useThread] Failed to request content from network:', fetchErr);
              setError('Content not available locally or on network');
              setFetching(false);
            }
          }
        } else {
          if (!cancelled) {
            setError(errorMessage);
          }
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    fetchThread();

    return () => {
      cancelled = true;
    };
  }, [rpc, connected, authReady, contentId]);

  return { thread, loading, error, fetching, refetch };
}

/**
 * Hook to fetch a set of threads by their content ids (SPEC_13 community view).
 *
 * A behavioral community's threads physically live in its PARENT space; the
 * community view renders exactly the moved_threads set from get_space_lineage.
 * Threads that fail to load (e.g. decayed or not yet synced) are skipped —
 * the community view shows what's available rather than erroring.
 */
export function useThreadsByIds(contentIds: string[]): {
  threads: Thread[];
  loading: boolean;
} {
  const { rpc, connected, authReady } = useRpc();
  const [threads, setThreads] = useState<Thread[]>([]);
  const [loading, setLoading] = useState(true);

  // Stable key so re-renders with an equal id list don't refetch.
  const idsKey = contentIds.join(',');

  useEffect(() => {
    if (!rpc || !connected || !authReady) return;
    const ids = idsKey ? idsKey.split(',') : [];
    if (ids.length === 0) {
      setThreads([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    (async () => {
      const results = await Promise.all(
        ids.map(async (id) => {
          try {
            const content = await rpc.getContent(id);
            return contentToThread(content);
          } catch (err) {
            console.warn('[useThreadsByIds] Failed to load', id, err);
            return null;
          }
        })
      );
      if (cancelled) return;
      setThreads(results.filter((t): t is Thread => t !== null));
      setLoading(false);
    })();

    return () => { cancelled = true; };
  }, [rpc, connected, authReady, idsKey]);

  return { threads, loading };
}

// =========================================================================
// Pool & Content Submission Hooks
// =========================================================================

/**
 * Hook for submitting engagement (reactions) with PoW
 * Previously used pools, now submits directly via submit_engagement
 */
export function usePoolContribution() {
  const { rpc, connected } = useRpc();
  const [contributing, setContributing] = useState(false);
  const [progress, setProgress] = useState({ attempts: 0, elapsedMs: 0 });
  const [error, setError] = useState<string | null>(null);

  const contribute = useCallback(async (
    contentId: string,
    _targetSeconds: number, // Not used anymore - PoW difficulty determines work
    identityPublicKey: string,
    signFn: (message: Uint8Array) => Uint8Array | Promise<Uint8Array>,
    emoji?: number // Optional emoji code (1-8)
  ): Promise<{ success: boolean; poolComplete: boolean; totalPow: number }> => {
    if (!rpc || !connected) {
      return { success: false, poolComplete: false, totalPow: 0 };
    }

    setContributing(true);
    setError(null);
    setProgress({ attempts: 0, elapsedMs: 0 });

    try {
      // Import action-pow functions dynamically to avoid circular deps
      const { hexToBytes, bytesToHex, computePow, ActionType, TESTNET_DIFFICULTY, TESTNET_CONFIG } = await import('../lib/action-pow');

      // Parse content ID to get hash bytes
      const contentHashHex = contentId.startsWith('sha256:')
        ? contentId.slice(7)
        : contentId;
      const contentHashBytes = hexToBytes(contentHashHex);

      // Generate nonce space
      const nonceSpace = new Uint8Array(8);
      crypto.getRandomValues(nonceSpace);
      const nonceSpaceHex = bytesToHex(nonceSpace);

      // For engagement, difficulty is 6 on testnet (16 mainnet)
      const authorBytes = hexToBytes(identityPublicKey);
      const timestamp = Math.floor(Date.now() / 1000);
      const difficulty = TESTNET_DIFFICULTY[ActionType.Engage];

      const challenge = {
        actionType: ActionType.Engage,
        contentHash: contentHashBytes,
        authorId: authorBytes,
        timestamp,
        difficulty,
        nonceSpace,
      };

      const solution = await computePow(
        challenge,
        TESTNET_CONFIG,
        (attempts, elapsedMs, _hashRate) => {
          setProgress({ attempts, elapsedMs });
        },
      );

      // Sign the engagement
      const signMessage = new TextEncoder().encode(
        `engage:${contentId}:${solution.nonce}:${timestamp}${emoji ? `:${emoji}` : ''}`
      );
      const signature = await Promise.resolve(signFn(signMessage));
      const signatureHex = bytesToHex(signature);

      // Submit engagement directly (no pool needed)
      const result = await rpc.submitEngagement({
        contentId,
        authorId: identityPublicKey,
        powNonce: Number(solution.nonce),
        powDifficulty: difficulty,
        powNonceSpace: nonceSpaceHex,
        powHash: solution.hash ? bytesToHex(solution.hash) : '',
        signature: signatureHex,
        timestamp,
        emoji,
      });

      // Engagement is successful if either the decay was reset or the reaction was stored
      // (reaction might not store if duplicate, but engaged can still succeed)
      const success = result.engaged || result.reaction_stored;

      return {
        success,
        poolComplete: false, // No pools anymore - celebration handled separately based on cumulative work
        totalPow: 10, // Approximate work value for display purposes
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to submit engagement';
      setError(errorMessage);
      console.error('[Engage] Submit error:', err);
      return { success: false, poolComplete: false, totalPow: 0 };
    } finally {
      setContributing(false);
    }
  }, [rpc, connected]);

  return { contribute, contributing, progress, error };
}

/**
 * Hook for submitting new posts (threads)
 */
export function usePostSubmit() {
  const { rpc, connected } = useRpc();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Submit a new post with Argon2id PoW
   *
   * @param spaceId - The space ID to post to
   * @param title - The post title
   * @param body - The post body text
   * @param identityPublicKey - Author's public key (hex)
   * @param signFn - Function to sign messages
   * @param powParams - PoW parameters from solutionToRpcParams()
   * @param mediaRefs - Optional media attachments
   */
  const submitPost = useCallback(async (
    spaceId: string,
    title: string,
    body: string,
    identityPublicKey: string,
    signFn: (message: Uint8Array) => Promise<Uint8Array | null>,
    powParams: {
      pow_nonce: number;
      pow_difficulty: number;
      pow_nonce_space: string;
      pow_hash: string;
      timestamp: number;
    },
    mediaRefs?: Array<{
      media_hash: string;
      media_type: string;
      size_bytes: number;
    }>
  ): Promise<{ success: boolean; contentId: string | null }> => {
    if (!rpc || !connected) {
      return { success: false, contentId: null };
    }

    setSubmitting(true);
    setError(null);

    try {
      // Sign the canonical action preimage the node verifies (validate_action_signature):
      //   content_hash(32) || timestamp_LE(8) || private(1)  = 41 bytes
      // POST content_hash = sha256(`${title}\n\n${body}`), matching the node's
      // submit_post content hashing. Timestamp MUST be the PoW-challenge timestamp.
      const { sha256 } = await import('../lib/action-pow');
      const contentHash = await sha256(new TextEncoder().encode(`${title}\n\n${body}`));
      const preimage = new Uint8Array(41);
      preimage.set(contentHash, 0);
      new DataView(preimage.buffer).setBigUint64(32, BigInt(powParams.timestamp), true);
      preimage[40] = isPrivateCiphertext(body) ? 1 : 0;
      const signature = await signFn(preimage);
      if (!signature) {
        throw new Error('Failed to sign message');
      }
      const signatureHex = Array.from(signature).map(b => b.toString(16).padStart(2, '0')).join('');

      // Submit to RPC
      const result = await rpc.submitPost({
        spaceId,
        title,
        body,
        authorId: identityPublicKey,
        powNonce: powParams.pow_nonce,
        powDifficulty: powParams.pow_difficulty,
        powNonceSpace: powParams.pow_nonce_space,
        powHash: powParams.pow_hash,
        signature: signatureHex,
        timestamp: powParams.timestamp,
        mediaRefs,
      });

      return {
        success: true,
        contentId: result.content_id,
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to submit post';
      setError(errorMessage);
      console.error('[Post] Submit error:', err);
      return { success: false, contentId: null };
    } finally {
      setSubmitting(false);
    }
  }, [rpc, connected]);

  return { submitPost, submitting, error };
}

// =========================================================================
// Media Upload
// =========================================================================

interface MediaUploadResult {
  mediaHash: string;
  mediaType: string;
  sizeBytes: number;
}

/**
 * Compress an image to fit within target size
 * Uses canvas to resize and JPEG compression
 */
async function compressImage(file: File, targetBytes: number): Promise<File> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = async () => {
      URL.revokeObjectURL(url);

      let { width, height } = img;
      let quality = 0.85;
      let canvas = document.createElement('canvas');
      let ctx = canvas.getContext('2d');

      if (!ctx) {
        reject(new Error('Failed to get canvas context'));
        return;
      }

      // Start with original dimensions
      canvas.width = width;
      canvas.height = height;

      // Try progressively smaller sizes and lower quality
      let attempts = 0;
      const maxAttempts = 10;

      while (attempts < maxAttempts) {
        // Draw image to canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        // Convert to blob
        const blob = await new Promise<Blob | null>((res) => {
          canvas.toBlob(res, 'image/jpeg', quality);
        });

        if (!blob) {
          reject(new Error('Failed to compress image'));
          return;
        }

        // Check if we're under target
        if (blob.size <= targetBytes) {
          const compressedFile = new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), {
            type: 'image/jpeg',
          });
          resolve(compressedFile);
          return;
        }

        // Reduce size for next attempt
        attempts++;
        if (quality > 0.5) {
          quality -= 0.1;
        } else {
          // Reduce dimensions by 20%
          width = Math.round(width * 0.8);
          height = Math.round(height * 0.8);
          canvas.width = width;
          canvas.height = height;
          quality = 0.8; // Reset quality for new size
        }
      }

      // If we couldn't get small enough, return best effort
      const finalBlob = await new Promise<Blob | null>((res) => {
        canvas.toBlob(res, 'image/jpeg', 0.5);
      });

      if (finalBlob) {
        resolve(new File([finalBlob], file.name.replace(/\.[^.]+$/, '.jpg'), {
          type: 'image/jpeg',
        }));
      } else {
        reject(new Error('Failed to compress image'));
      }
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image'));
    };

    img.src = url;
  });
}

/** Protocol limit: 1MB max per media file */
const MAX_MEDIA_BYTES = 1024 * 1024;

/** Target size for compression (accounts for base64 overhead) */
const COMPRESSION_TARGET_BYTES = 700 * 1024;

export interface MediaUploadResponse {
  success: boolean;
  result: MediaUploadResult | null;
  /** If true, file is too large and needs compression */
  needsCompression?: boolean;
  /** Original file size in bytes */
  originalSize?: number;
}

/**
 * Hook for uploading media (images)
 */
export function useMediaUpload() {
  const { rpc, connected } = useRpc();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Upload an image file (without compression)
   * @param file - File object from input or drag/drop
   * @returns MediaUploadResponse - may indicate needsCompression if file > 1MB
   */
  const uploadImage = useCallback(async (
    file: File
  ): Promise<MediaUploadResponse> => {
    if (!rpc || !connected) {
      setError('Not connected to node');
      return { success: false, result: null };
    }

    // Validate file type
    const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      setError('Invalid file type. Supported: JPEG, PNG, GIF, WebP');
      return { success: false, result: null };
    }

    // Check if file exceeds protocol limit - don't auto-compress, let UI prompt
    if (file.size > MAX_MEDIA_BYTES) {
      setError(`Image exceeds 1MB limit (${(file.size / 1024 / 1024).toFixed(2)}MB)`);
      return {
        success: false,
        result: null,
        needsCompression: true,
        originalSize: file.size,
      };
    }

    setUploading(true);
    setError(null);

    try {
      // Read file as base64
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const dataUrl = reader.result as string;
          // Remove data URL prefix (e.g., "data:image/jpeg;base64,")
          const base64Data = dataUrl.split(',')[1] || '';
          resolve(base64Data);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      // Upload to node
      const result = await rpc.uploadMedia({
        data: base64,
        mediaType: file.type,
      });

      if (result.success) {
        return {
          success: true,
          result: {
            mediaHash: result.media_hash,
            mediaType: file.type,
            sizeBytes: result.size_bytes,
          },
        };
      } else {
        setError('Upload failed');
        return { success: false, result: null };
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Upload failed';
      setError(errorMessage);
      console.error('[Media] Upload error:', err);
      return { success: false, result: null };
    } finally {
      setUploading(false);
    }
  }, [rpc, connected]);

  /**
   * Compress and upload an image file
   * Use this when user has confirmed they want compression after needsCompression=true
   * @param file - File object from input or drag/drop
   * @returns MediaUploadResult with hash, type, and size
   */
  const compressAndUpload = useCallback(async (
    file: File
  ): Promise<MediaUploadResponse> => {
    if (!rpc || !connected) {
      setError('Not connected to node');
      return { success: false, result: null };
    }

    setUploading(true);
    setError(null);

    try {
      // Compress the image
      const compressedFile = await compressImage(file, COMPRESSION_TARGET_BYTES);

      // Read as base64
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const dataUrl = reader.result as string;
          const base64Data = dataUrl.split(',')[1] || '';
          resolve(base64Data);
        };
        reader.onerror = reject;
        reader.readAsDataURL(compressedFile);
      });

      // Upload to node
      const result = await rpc.uploadMedia({
        data: base64,
        mediaType: 'image/jpeg', // Compression converts to JPEG
      });

      if (result.success) {
        return {
          success: true,
          result: {
            mediaHash: result.media_hash,
            mediaType: 'image/jpeg',
            sizeBytes: result.size_bytes,
          },
        };
      } else {
        setError('Upload failed');
        return { success: false, result: null };
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Compression failed';
      setError(errorMessage);
      console.error('[Media] Compress+upload error:', err);
      return { success: false, result: null };
    } finally {
      setUploading(false);
    }
  }, [rpc, connected]);

  /**
   * Upload an encrypted image file
   * Encrypts the image bytes before uploading so it can only be viewed with the passphrase
   * @param file - File object from input or drag/drop
   * @param passphrase - Passphrase to encrypt with
   * @returns MediaUploadResponse with encrypted media hash
   */
  const uploadEncryptedImage = useCallback(async (
    file: File,
    passphrase: string
  ): Promise<MediaUploadResponse> => {
    if (!rpc || !connected) {
      setError('Not connected to node');
      return { success: false, result: null };
    }

    // Validate file type
    const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      setError('Invalid file type. Supported: JPEG, PNG, GIF, WebP');
      return { success: false, result: null };
    }

    setUploading(true);
    setError(null);

    try {
      // Import encryption functions
      const { encryptMedia, bytesToBase64 } = await import('../lib/encryption');

      // Read file as ArrayBuffer
      const arrayBuffer = await file.arrayBuffer();

      // Encrypt the image bytes
      const encryptedBytes = await encryptMedia(arrayBuffer, passphrase);

      // Convert to base64 for upload
      const base64 = bytesToBase64(encryptedBytes);

      // Upload to node with encrypted type marker
      // Format: "encrypted:original/type" so we know the original format after decryption
      const encryptedMediaType = `encrypted:${file.type}`;

      const result = await rpc.uploadMedia({
        data: base64,
        mediaType: encryptedMediaType,
      });

      if (result.success) {
        return {
          success: true,
          result: {
            mediaHash: result.media_hash,
            mediaType: encryptedMediaType,
            sizeBytes: result.size_bytes,
          },
        };
      } else {
        setError('Upload failed');
        return { success: false, result: null };
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Encryption/upload failed';
      setError(errorMessage);
      console.error('[Media] Encrypted upload error:', err);
      return { success: false, result: null };
    } finally {
      setUploading(false);
    }
  }, [rpc, connected]);

  /**
   * Compress and upload an encrypted image file
   * @param file - File object from input or drag/drop
   * @param passphrase - Passphrase to encrypt with
   * @returns MediaUploadResponse with encrypted media hash
   */
  const compressAndUploadEncrypted = useCallback(async (
    file: File,
    passphrase: string
  ): Promise<MediaUploadResponse> => {
    if (!rpc || !connected) {
      setError('Not connected to node');
      return { success: false, result: null };
    }

    setUploading(true);
    setError(null);

    try {
      // Import encryption functions
      const { encryptMedia, bytesToBase64 } = await import('../lib/encryption');

      // Compress the image first
      const compressedFile = await compressImage(file, COMPRESSION_TARGET_BYTES);

      // Read as ArrayBuffer
      const arrayBuffer = await compressedFile.arrayBuffer();

      // Encrypt the compressed bytes
      const encryptedBytes = await encryptMedia(arrayBuffer, passphrase);

      // Convert to base64
      const base64 = bytesToBase64(encryptedBytes);

      // Upload with encrypted type marker (compressed = JPEG)
      const encryptedMediaType = 'encrypted:image/jpeg';

      const result = await rpc.uploadMedia({
        data: base64,
        mediaType: encryptedMediaType,
      });

      if (result.success) {
        return {
          success: true,
          result: {
            mediaHash: result.media_hash,
            mediaType: encryptedMediaType,
            sizeBytes: result.size_bytes,
          },
        };
      } else {
        setError('Upload failed');
        return { success: false, result: null };
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Compression/encryption failed';
      setError(errorMessage);
      console.error('[Media] Compress+encrypt error:', err);
      return { success: false, result: null };
    } finally {
      setUploading(false);
    }
  }, [rpc, connected]);

  /**
   * Get media URL from hash (for display)
   * Uses IndexedDB cache for instant loads on repeat visits
   */
  const getMediaUrl = useCallback(async (
    mediaHash: string
  ): Promise<string | null> => {
    // Import cache functions dynamically to avoid circular deps
    const { getMediaFromCache, setMediaInCache } = await import('../lib/cache');

    // Check cache first (IndexedDB - permanent storage)
    const cached = await getMediaFromCache(mediaHash);
    if (cached) {
      return `data:${cached.mediaType};base64,${cached.data}`;
    }

    if (!rpc || !connected) return null;

    try {
      const result = await rpc.getMedia(mediaHash);

      // Cache the result for future loads
      await setMediaInCache(mediaHash, result.data, result.media_type);

      // Return as data URL for direct use in img src
      return `data:${result.media_type};base64,${result.data}`;
    } catch (err) {
      console.error('[Media] Get error:', err);
      return null;
    }
  }, [rpc, connected]);

  return {
    uploadImage,
    compressAndUpload,
    uploadEncryptedImage,
    compressAndUploadEncrypted,
    getMediaUrl,
    uploading,
    error,
  };
}

/**
 * Hook for submitting replies
 */
export function useReplySubmit() {
  const { rpc, connected } = useRpc();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Submit a reply with Argon2id PoW
   *
   * @param parentId - The content ID to reply to
   * @param body - The reply body text
   * @param identityPublicKey - Author's public key (hex)
   * @param signFn - Function to sign messages
   * @param powParams - PoW parameters from solutionToRpcParams()
   */
  const submitReply = useCallback(async (
    parentId: string,
    body: string,
    identityPublicKey: string,
    signFn: (message: Uint8Array) => Uint8Array | Promise<Uint8Array | null>,
    powParams: {
      pow_nonce: number;
      pow_difficulty: number;
      pow_nonce_space: string;
      pow_hash: string;
      timestamp: number;
    }
  ): Promise<{ success: boolean; contentId: string | null }> => {
    if (!rpc || !connected) {
      return { success: false, contentId: null };
    }

    setSubmitting(true);
    setError(null);

    try {
      // Sign the canonical action preimage the node verifies (validate_action_signature):
      //   content_hash(32) || timestamp_LE(8) || private(1)  = 41 bytes
      // REPLY content_hash = sha256(body), matching the node's submit_reply hashing.
      const { sha256 } = await import('../lib/action-pow');
      const contentHash = await sha256(new TextEncoder().encode(body));
      const preimage = new Uint8Array(41);
      preimage.set(contentHash, 0);
      new DataView(preimage.buffer).setBigUint64(32, BigInt(powParams.timestamp), true);
      preimage[40] = isPrivateCiphertext(body) ? 1 : 0;
      const signature = await Promise.resolve(signFn(preimage));
      if (!signature) {
        throw new Error('Failed to sign message');
      }
      const signatureHex = Array.from(signature).map(b => b.toString(16).padStart(2, '0')).join('');

      // Submit to RPC
      const result = await rpc.submitReply({
        parentId,
        body,
        authorId: identityPublicKey,
        powNonce: powParams.pow_nonce,
        powDifficulty: powParams.pow_difficulty,
        powNonceSpace: powParams.pow_nonce_space,
        powHash: powParams.pow_hash,
        signature: signatureHex,
        timestamp: powParams.timestamp,
      });

      return {
        success: true,
        contentId: result.content_id,
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to submit reply';
      setError(errorMessage);
      console.error('[Reply] Submit error:', err);
      return { success: false, contentId: null };
    } finally {
      setSubmitting(false);
    }
  }, [rpc, connected]);

  return { submitReply, submitting, error };
}

/**
 * Hook for submitting content edits
 *
 * Only the original author can edit their content.
 * Edits require Argon2id PoW similar to posts/replies.
 */
export function useEditSubmit() {
  const { rpc, connected } = useRpc();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Submit an edit with Argon2id PoW
   *
   * @param originalContentId - The content ID being edited
   * @param title - Optional new title (for posts)
   * @param body - The new body text
   * @param identityPublicKey - Author's public key (hex)
   * @param signFn - Function to sign messages
   * @param powParams - PoW parameters from solutionToRpcParams()
   */
  const submitEdit = useCallback(async (
    originalContentId: string,
    title: string | undefined,
    body: string,
    identityPublicKey: string,
    signFn: (message: Uint8Array) => Uint8Array | Promise<Uint8Array | null>,
    powParams: {
      pow_nonce: number;
      pow_difficulty: number;
      pow_nonce_space: string;
      pow_hash: string;
      timestamp: number;
    }
  ): Promise<{ success: boolean; contentId: string | null }> => {
    if (!rpc || !connected) {
      return { success: false, contentId: null };
    }

    setSubmitting(true);
    setError(null);

    try {
      // Sign the canonical action preimage the node verifies (validate_action_signature):
      //   content_hash(32) || timestamp_LE(8) || private(1)  = 41 bytes
      // EDIT content_hash = sha256(title ? `${title}\n\n${body}` : body), matching the
      // node's submit_edit hashing.
      const { sha256 } = await import('../lib/action-pow');
      const editContent = title ? `${title}\n\n${body}` : body;
      const contentHash = await sha256(new TextEncoder().encode(editContent));
      const preimage = new Uint8Array(41);
      preimage.set(contentHash, 0);
      new DataView(preimage.buffer).setBigUint64(32, BigInt(powParams.timestamp), true);
      preimage[40] = isPrivateCiphertext(body) ? 1 : 0;
      const signature = await Promise.resolve(signFn(preimage));
      if (!signature) {
        throw new Error('Failed to sign message');
      }
      const signatureHex = Array.from(signature).map(b => b.toString(16).padStart(2, '0')).join('');

      // Submit to RPC
      const result = await rpc.submitEdit({
        originalContentId,
        title,
        body,
        authorId: identityPublicKey,
        powNonce: powParams.pow_nonce,
        powDifficulty: powParams.pow_difficulty,
        powNonceSpace: powParams.pow_nonce_space,
        powHash: powParams.pow_hash,
        signature: signatureHex,
        timestamp: powParams.timestamp,
      });

      return {
        success: true,
        contentId: result.content_id,
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to submit edit';
      setError(errorMessage);
      console.error('[Edit] Submit error:', err);
      return { success: false, contentId: null };
    } finally {
      setSubmitting(false);
    }
  }, [rpc, connected]);

  return { submitEdit, submitting, error };
}

/**
 * Hook for fetching replies to content
 */
export function useReplies(contentId: string) {
  const { rpc, connected, authReady } = useRpc();
  const [replies, setReplies] = useState<Reply[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pendingRequestsRef = useRef<Set<string>>(new Set());
  // Track content IDs that timed out and are unavailable
  const unavailableContentRef = useRef<Set<string>>(new Set());

  const fetchReplies = useCallback(async () => {
    if (!rpc || !connected || !authReady || !contentId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await rpc.getReplies(contentId);

      // Convert flat replies to tree structure, passing unavailable content IDs
      const replyTree = buildReplyTree(result.replies, contentId, unavailableContentRef.current);
      setReplies(replyTree);

      // Find replies with empty/missing bodies and request them from network
      // Sort by depth (shallower first) so visible content loads before deeply nested content
      const emptyBodyReplies = result.replies
        .filter(r => !r.body || r.body === '')
        .filter(r => !pendingRequestsRef.current.has(r.content_id))
        .map(r => {
          // Calculate depth by counting parent chain
          let depth = 0;
          let currentParentId: string | null = r.parent_id;
          while (currentParentId && currentParentId !== contentId) {
            depth++;
            const parent = result.replies.find(p => p.content_id === currentParentId);
            currentParentId = parent?.parent_id ?? null;
          }
          return { ...r, depth };
        })
        .sort((a, b) => a.depth - b.depth) // Shallower first
        .map(r => r.content_id);

      if (emptyBodyReplies.length > 0) {
        setFetching(true);

        // Request all missing content in parallel
        const requestPromises = emptyBodyReplies.slice(0, 20).map(async (cid) => {
          pendingRequestsRef.current.add(cid);
          try {
            await rpc.requestContent(cid);
            return { cid, success: true };
          } catch (err) {
            console.warn('[Replies] Failed to request', cid, ':', err);
            return { cid, success: false };
          }
        });

        await Promise.all(requestPromises);

        // Poll for content arrival - check every 2 seconds for up to 20 seconds
        let pollCount = 0;
        const maxPolls = 10;

        const pollForContent = async () => {
          if (pollCount >= maxPolls) {
            setFetching(false);
            // Mark remaining empty replies as unavailable
            emptyBodyReplies.forEach(id => {
              pendingRequestsRef.current.delete(id);
              unavailableContentRef.current.add(id);
            });
            // Re-fetch and rebuild tree with unavailable markers
            try {
              const finalResult = await rpc.getReplies(contentId);
              const stillEmpty = finalResult.replies
                .filter(r => (!r.body || r.body === '') && emptyBodyReplies.includes(r.content_id))
                .map(r => r.content_id);
              stillEmpty.forEach(id => unavailableContentRef.current.add(id));
              const finalTree = buildReplyTree(finalResult.replies, contentId, unavailableContentRef.current);
              setReplies(finalTree);
            } catch { /* ignore */ }
            return;
          }

          pollCount++;
          await new Promise(resolve => setTimeout(resolve, 2000));

          try {
            const pollResult = await rpc.getReplies(contentId);
            const stillEmpty = pollResult.replies.filter(
              r => (!r.body || r.body === '') && emptyBodyReplies.includes(r.content_id)
            );

            // Update with any newly arrived content
            const updatedTree = buildReplyTree(pollResult.replies, contentId, unavailableContentRef.current);
            setReplies(updatedTree);

            if (stillEmpty.length === 0) {
              setFetching(false);
              emptyBodyReplies.forEach(id => pendingRequestsRef.current.delete(id));
              return;
            }

            await pollForContent();
          } catch (pollErr) {
            console.warn('[Replies] Poll error:', pollErr);
            await pollForContent();
          }
        };

        pollForContent();
      }
    } catch (err) {
      console.error('[Replies] Fetch error:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch replies');
      setReplies([]);
    } finally {
      setLoading(false);
    }
  }, [rpc, connected, authReady, contentId]);

  // Fetch on mount and when contentId changes
  useEffect(() => {
    fetchReplies();
  }, [fetchReplies]);

  return { replies, loading, fetching, error, refetch: fetchReplies };
}

/**
 * Build a nested reply tree from flat reply list
 * @param unavailableIds - Content IDs that timed out and are known to be unavailable
 */
function buildReplyTree(
  flatReplies: Array<{
    content_id: string;
    author_id: string;
    body: string;
    parent_id: string;
    created_at: number;
    last_engagement: number;
    depth?: number;        // From RPC - 0 = direct reply to root (optional for backwards compat)
    child_count?: number;  // From RPC - total children even if not fetched (optional for backwards compat)
    // New decay fields from daemon
    decay_state?: string;
    seconds_until_decay_starts?: number | null;
    seconds_until_pruned?: number | null;
    survival_probability?: number;
    is_protected?: boolean;
    time_since_engagement?: number;
    // Author display name (if set)
    display_name?: string | null;
  }>,
  threadId: string,
  unavailableIds: Set<string> = new Set()
): Reply[] {
  // Create a map of all replies by ID
  const replyMap = new Map<string, Reply>();

  // First pass: create Reply objects for each item
  for (const item of flatReplies) {
    const decayState = (item.decay_state as 'protected' | 'active' | 'stale' | 'decayed') || 'active';
    // Check if content is known to be unavailable (timed out)
    const isUnavailable = unavailableIds.has(item.content_id);
    // Body is loading if empty string or missing AND not marked as unavailable
    const bodyIsLoading = (!item.body || item.body === '') && !isUnavailable;
    // Show unavailable message if content timed out
    const displayContent = isUnavailable && (!item.body || item.body === '')
      ? '[Content unavailable - not found on network]'
      : item.body;
    const reply: Reply = {
      id: item.content_id,
      threadId,
      parentId: item.parent_id === threadId ? null : item.parent_id,
      author: item.author_id, // This is hex pubkey, should be converted to address
      displayName: item.display_name ?? undefined,
      content: displayContent,
      createdAt: Math.floor(item.created_at / 1000), // Convert from ms to seconds
      lastEngagement: Math.floor(item.last_engagement / 1000),
      heat: item.survival_probability ?? calculateHeat(Math.floor(item.created_at / 1000), Math.floor(item.last_engagement / 1000)),
      depth: item.depth ?? 0, // Use RPC-provided depth
      childCount: item.child_count ?? 0, // Use RPC-provided child count
      children: [], // Will be populated from fetched nested replies
      decay: {
        state: decayState,
        survivalProbability: item.survival_probability ?? 1.0,
        isProtected: item.is_protected ?? false,
        secondsUntilDecayStarts: item.seconds_until_decay_starts ?? null,
        secondsUntilPruned: item.seconds_until_pruned ?? null,
        timeSinceEngagement: item.time_since_engagement ?? 0,
      },
      bodyLoading: bodyIsLoading,
    };
    replyMap.set(item.content_id, reply);
  }

  // Second pass: build tree structure
  const rootReplies: Reply[] = [];

  for (const reply of replyMap.values()) {
    if (reply.parentId === null) {
      // Direct reply to thread
      rootReplies.push(reply);
    } else {
      // Nested reply - find parent and add as child
      const parent = replyMap.get(reply.parentId);
      if (parent) {
        parent.children.push(reply);
      } else {
        // Parent not found in fetched data (beyond depth limit), treat as orphan
        // This shouldn't happen normally since we only fetch within depth limit
        rootReplies.push(reply);
      }
    }
  }

  // Sort replies by creation time (oldest first)
  const sortByTime = (a: Reply, b: Reply) => a.createdAt - b.createdAt;
  rootReplies.sort(sortByTime);

  // Recursively sort children
  const sortChildren = (reply: Reply) => {
    reply.children.sort(sortByTime);
    reply.children.forEach(sortChildren);
  };
  rootReplies.forEach(sortChildren);

  return rootReplies;
}

// =========================================================================
// Helpers
// =========================================================================

/**
 * Calculate heat value based on creation and last engagement times
 * Uses 7-day half-life with 48-hour floor protection
 */
function calculateHeat(createdAt: number, lastEngagement: number): number {
  const now = Math.floor(Date.now() / 1000);
  const floorPeriod = 48 * 3600; // 48 hours
  const halfLife = 7 * 24 * 3600; // 7 days

  // During floor protection, heat is 1.0
  if (now - createdAt < floorPeriod) {
    return 1.0;
  }

  // Calculate decay from last engagement
  const timeSinceEngagement = now - lastEngagement;
  const decayFactor = Math.pow(0.5, timeSinceEngagement / halfLife);

  return Math.max(0.01, Math.min(1.0, decayFactor));
}

// =========================================================================
// Reactions Hook
// =========================================================================

/**
 * Hook for fetching and managing reactions on content
 */
export function useReactions(contentId: string) {
  const { rpc, connected, authReady } = useRpc();
  const [reactions, setReactions] = useState<{
    reactions: Array<{ emoji: string; reactionType: number; count: number }>;
    total: number;
    userReactions?: number[];
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchReactions = useCallback(async () => {
    if (!rpc || !connected || !authReady || !contentId) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await rpc.getReactions(contentId);

      // Also try to get user's own reactions if we have an identity
      const identity = loadStoredIdentity();
      let userReactions: number[] = [];

      if (identity) {
        try {
          const userResult = await rpc.getUserReactions(contentId);
          userReactions = userResult.reaction_types;
        } catch (err) {
          // User might not have reacted yet, ignore error
          console.log('[Reactions] No user reactions found');
        }
      }

      // Map snake_case from RPC to camelCase for frontend
      const mappedReactions = result.reactions.map(r => ({
        emoji: r.emoji,
        reactionType: r.reaction_type,
        count: r.count,
      }));

      setReactions({
        reactions: mappedReactions,
        total: result.total,
        userReactions,
      });
    } catch (err) {
      console.error('[Reactions] Fetch error:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch reactions');
    } finally {
      setLoading(false);
    }
  }, [rpc, connected, authReady, contentId]);

  // Fetch on mount and when contentId changes
  useEffect(() => {
    fetchReactions();
  }, [fetchReactions]);

  return { reactions, loading, error, refetch: fetchReactions };
}

// =========================================================================
// Spam Attestation Hooks (SPEC_12 §3)
// =========================================================================

/** Spam reasons that can be reported */
export type SpamReason = 'advertising' | 'repetitive' | 'off_topic' | 'harassment' | 'illegal_content';

/** Spam status for content */
export interface SpamStatus {
  isFlagged: boolean;
  attestationCount: number;
  counterCount: number;
  reasons: string[];
  spamThreshold: number;
  counterThreshold: number;
}

/**
 * Hook for fetching spam status of content
 */
export function useSpamStatus(contentId: string) {
  const { rpc, connected } = useRpc();
  const [status, setStatus] = useState<SpamStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    if (!rpc || !connected || !contentId) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Strip sha256: prefix if present (RPC expects raw 32-byte hex)
      const contentHashHex = contentId.startsWith('sha256:') ? contentId.slice(7) : contentId;
      const result = await rpc.getSpamStatus(contentHashHex);
      setStatus({
        isFlagged: result.is_flagged,
        attestationCount: result.attestation_count,
        counterCount: result.counter_count,
        reasons: result.reasons,
        spamThreshold: result.spam_threshold,
        counterThreshold: result.counter_threshold,
      });
    } catch (err) {
      // Content might not have any spam reports yet - that's OK
      setStatus({
        isFlagged: false,
        attestationCount: 0,
        counterCount: 0,
        reasons: [],
        spamThreshold: 3,
        counterThreshold: 2,
      });
    } finally {
      setLoading(false);
    }
  }, [rpc, connected, contentId]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  return { status, loading, error, refetch: fetchStatus };
}

/**
 * Hook for submitting spam reports with PoW
 */
export function useSpamReport() {
  const { rpc, connected } = useRpc();
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState({ attempts: 0, elapsedMs: 0 });
  const [error, setError] = useState<string | null>(null);

  /**
   * Submit a spam report for content
   * Requires PoW to prevent abuse
   */
  const reportSpam = useCallback(async (
    contentId: string,
    reason: SpamReason,
    identityPublicKey: string,
    signFn: (message: Uint8Array) => Uint8Array | Promise<Uint8Array | null>,
  ): Promise<{ success: boolean; thresholdReached: boolean }> => {
    if (!rpc || !connected) {
      return { success: false, thresholdReached: false };
    }

    setSubmitting(true);
    setError(null);
    setProgress({ attempts: 0, elapsedMs: 0 });

    try {
      const { hexToBytes, bytesToHex } = await import('../lib/action-pow');

      // Parse content ID
      const contentHashHex = contentId.startsWith('sha256:') ? contentId.slice(7) : contentId;
      const contentHashBytes = hexToBytes(contentHashHex);

      const attesterBytes = hexToBytes(identityPublicKey); // 32-byte attester pubkey
      const timestamp = Math.floor(Date.now() / 1000);
      const REASON_U8: Record<string, number> = {
        advertising: 1, repetitive: 2, off_topic: 3, harassment: 4, illegal_content: 5,
      };
      const reasonByte = REASON_U8[String(reason).toLowerCase()] ?? 0;

      // Spam-attestation PoW (SPEC_12): find a u64 nonce so that
      //   sha256(pow_message || nonce_LE) has >= 12 leading ZERO BITS,
      // where pow_message = content_hash(32) || attester(32) || reason(1) || timestamp(8 LE).
      // The old code mined Argon2id over an unrelated action challenge, so the node
      // recomputed 0 leading zeros -> -32602 "required 12 ... got 0". sha256 at 12
      // bits is ~4096 attempts (fast); difficulty is a fixed constant, not per-network.
      const POW_DIFFICULTY = 12;
      const powMessage = new Uint8Array(32 + 32 + 1 + 8);
      powMessage.set(contentHashBytes, 0);
      powMessage.set(attesterBytes, 32);
      powMessage[64] = reasonByte;
      new DataView(powMessage.buffer).setBigUint64(65, BigInt(timestamp), true);

      const powBuf = new Uint8Array(powMessage.length + 8);
      powBuf.set(powMessage, 0);
      const powNonceView = new DataView(powBuf.buffer, powMessage.length, 8);
      const leadingZeroBits = (h: Uint8Array): number => {
        let c = 0;
        for (const b of h) { if (b === 0) { c += 8; } else { c += Math.clz32(b) - 24; break; } }
        return c;
      };
      let powNonce = 0n;
      let powHashBytes = new Uint8Array(32);
      let attempts = 0;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        powNonceView.setBigUint64(0, powNonce, true);
        powHashBytes = new Uint8Array(await crypto.subtle.digest('SHA-256', powBuf));
        if (leadingZeroBits(powHashBytes) >= POW_DIFFICULTY) break;
        powNonce++;
        if (++attempts % 256 === 0) setProgress({ attempts, elapsedMs: 0 });
      }

      // Sign the report over the EXACT bytes the node verifies (SPEC_12):
      // "SPAM_ATTESTATION" || content_hash(32) || reason(1) || timestamp(8, LE).
      const label = new TextEncoder().encode('SPAM_ATTESTATION');
      const signMessage = new Uint8Array(label.length + 32 + 1 + 8);
      signMessage.set(label, 0);
      signMessage.set(contentHashBytes, label.length);
      signMessage[label.length + 32] = reasonByte;
      new DataView(signMessage.buffer).setBigUint64(label.length + 33, BigInt(timestamp), true);
      const signature = await Promise.resolve(signFn(signMessage));
      if (!signature) {
        throw new Error('Failed to sign message');
      }
      const signatureHex = bytesToHex(signature);

      // Submit spam attestation (use hex hash without sha256: prefix)
      const result = await rpc.submitSpamAttestation({
        contentId: contentHashHex,
        attesterId: identityPublicKey,
        reason,
        powNonce: Number(powNonce),
        powDifficulty: POW_DIFFICULTY,
        powNonceSpace: '0000000000000000',
        powHash: bytesToHex(powHashBytes),
        signature: signatureHex,
        timestamp,
      });

      return {
        success: result.stored,
        thresholdReached: result.threshold_reached,
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to submit spam report';
      // A duplicate report is a benign no-op: you already reported this content.
      // Treat it as success so a double-click shows "reported", not a scary error.
      if (/already exists/i.test(errorMessage)) {
        return { success: true, thresholdReached: false };
      }
      setError(errorMessage);
      return { success: false, thresholdReached: false };
    } finally {
      setSubmitting(false);
    }
  }, [rpc, connected]);

  /**
   * Submit a counter-attestation to defend content
   */
  const defendContent = useCallback(async (
    contentId: string,
    identityPublicKey: string,
    signFn: (message: Uint8Array) => Uint8Array | Promise<Uint8Array | null>,
  ): Promise<{ success: boolean; thresholdReached: boolean }> => {
    if (!rpc || !connected) {
      return { success: false, thresholdReached: false };
    }

    setSubmitting(true);
    setError(null);
    setProgress({ attempts: 0, elapsedMs: 0 });

    try {
      const { hexToBytes, bytesToHex, computePow, ActionType, TESTNET_DIFFICULTY, TESTNET_CONFIG } = await import('../lib/action-pow');

      const contentHashHex = contentId.startsWith('sha256:') ? contentId.slice(7) : contentId;
      const contentHashBytes = hexToBytes(contentHashHex);

      const nonceSpace = new Uint8Array(8);
      crypto.getRandomValues(nonceSpace);
      const nonceSpaceHex = bytesToHex(nonceSpace);

      const authorBytes = hexToBytes(identityPublicKey);
      const timestamp = Math.floor(Date.now() / 1000);
      const difficulty = TESTNET_DIFFICULTY[ActionType.Engage];

      const challenge = {
        actionType: ActionType.Engage,
        contentHash: contentHashBytes,
        authorId: authorBytes,
        timestamp,
        difficulty,
        nonceSpace,
      };

      const solution = await computePow(
        challenge,
        TESTNET_CONFIG,
        (attempts, elapsedMs) => {
          setProgress({ attempts, elapsedMs });
        },
      );

      const signMessage = new TextEncoder().encode(
        `counter:${contentId}:${solution.nonce}:${timestamp}`
      );
      const signature = await Promise.resolve(signFn(signMessage));
      if (!signature) {
        throw new Error('Failed to sign message');
      }
      const signatureHex = bytesToHex(signature);

      const result = await rpc.submitCounterAttestation({
        contentId: contentHashHex,
        attesterId: identityPublicKey,
        powNonce: Number(solution.nonce),
        powDifficulty: difficulty,
        powNonceSpace: nonceSpaceHex,
        powHash: solution.hash ? bytesToHex(solution.hash) : '',
        signature: signatureHex,
        timestamp,
      });

      return {
        success: result.stored,
        thresholdReached: result.threshold_reached,
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to submit counter attestation';
      setError(errorMessage);
      console.error('[DefendContent] Error:', err);
      return { success: false, thresholdReached: false };
    } finally {
      setSubmitting(false);
    }
  }, [rpc, connected]);

  return { reportSpam, defendContent, submitting, progress, error };
}

/**
 * Hook to manage identity display name
 * Fetches and updates the display name stored on the node
 */
export function useIdentityName() {
  const { rpc, connected } = useRpc();
  const [name, setName] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch current name from node
  const fetchName = useCallback(async () => {
    if (!rpc || !connected) return;

    setLoading(true);
    setError(null);

    try {
      const result = await rpc.call('get_identity_name', {}) as { identity_name?: string | null };
      setName(result.identity_name ?? null);
    } catch (err) {
      console.error('[IdentityName] Failed to fetch:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch display name');
    } finally {
      setLoading(false);
    }
  }, [rpc, connected]);

  // Fetch on mount and when connection changes
  useEffect(() => {
    if (connected) {
      fetchName();
    }
  }, [connected, fetchName]);

  // Update name on node
  const updateName = useCallback(async (newName: string | null): Promise<boolean> => {
    if (!rpc || !connected) return false;

    setSaving(true);
    setError(null);

    try {
      const result = await rpc.call('set_identity_name', {
        name: newName?.trim() || null
      }) as { success?: boolean; identity_name?: string | null };

      if (result.success) {
        setName(result.identity_name ?? null);
        return true;
      } else {
        setError('Failed to update display name');
        return false;
      }
    } catch (err) {
      console.error('[IdentityName] Failed to update:', err);
      setError(err instanceof Error ? err.message : 'Failed to update display name');
      return false;
    } finally {
      setSaving(false);
    }
  }, [rpc, connected]);

  return { name, loading, saving, error, updateName, refetch: fetchName };
}

// =========================================================================
// Private Space Hooks
// =========================================================================

export interface PrivateSpaceInfo {
  spaceId: string;
  spaceIdBech32: string;
  encryptedName?: string;
  /** Decrypted name — populated in node-managed mode (the node holds the key). */
  name?: string;
  role: 'admin' | 'moderator' | 'member';
  joinedAt: number;
  memberCount: number;
  keyVersion: number;
}

export interface InviteInfo {
  inviteHash: string;
  spaceId: string;
  inviter: string;
  encryptedSpaceKey: string;
  createdAt: number;
  expiresAt?: number;
  message?: string;
}

export interface SpaceMemberInfo {
  member: string;
  role: 'admin' | 'moderator' | 'member';
  joinedAt: number;
  invitedBy: string;
}

/**
 * Hook to get user's private spaces
 */
export function usePrivateSpaces(userPublicKey?: string) {
  const { rpc, connected, authReady } = useRpc();
  const [spaces, setSpaces] = useState<PrivateSpaceInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSpaces = useCallback(async () => {
    if (!rpc || !connected || !authReady || !userPublicKey) return;

    setLoading(true);
    setError(null);

    try {
      const result = await rpc.call('get_my_private_spaces', { user: userPublicKey }) as {
        spaces: Array<{
          space_id: string;
          space_id_bech32: string;
          encrypted_name?: string;
          name?: string | null;
          role: string;
          joined_at: number;
          member_count: number;
          key_version: number;
        }>;
      };

      setSpaces(result.spaces.map(s => ({
        spaceId: s.space_id,
        spaceIdBech32: s.space_id_bech32,
        encryptedName: s.encrypted_name,
        name: s.name ?? undefined,
        role: s.role as 'admin' | 'moderator' | 'member',
        joinedAt: s.joined_at,
        memberCount: s.member_count,
        keyVersion: s.key_version,
      })));
    } catch (err) {
      console.error('[PrivateSpaces] Failed to fetch:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch private spaces');
    } finally {
      setLoading(false);
    }
  }, [rpc, connected, authReady, userPublicKey]);

  useEffect(() => {
    if (connected && authReady && userPublicKey) {
      fetchSpaces();
    }
  }, [connected, authReady, userPublicKey, fetchSpaces]);

  return { spaces, loading, error, refetch: fetchSpaces };
}

/** True if a message body carries node-decryptable private-space ciphertext. */
export function isPrivateCiphertext(text: string | null | undefined): boolean {
  return typeof text === 'string' && text.startsWith('[PRIVATE:v1:');
}

/**
 * Node-managed private-space content crypto (desktop mode). The node holds the space
 * key, so embedded clients delegate encrypt/decrypt instead of using a local key.
 */
export function usePrivateContent() {
  const { rpc, connected, authReady } = useRpc();

  const encryptForSpace = useCallback(async (spaceId: string, plaintext: string): Promise<string | null> => {
    if (!rpc || !connected || !authReady) return null;
    try {
      const r = await rpc.call('encrypt_private_content', { space_id: spaceId, content: plaintext }) as { content: string };
      return r.content;
    } catch (err) {
      console.error('[PrivateContent] encrypt failed:', err);
      return null;
    }
  }, [rpc, connected, authReady]);

  const decryptForSpace = useCallback(async (spaceId: string, ciphertext: string): Promise<string | null> => {
    if (!rpc || !connected || !authReady) return null;
    try {
      const r = await rpc.call('decrypt_private_content', { space_id: spaceId, content: ciphertext }) as { content: string };
      return r.content;
    } catch (err) {
      console.error('[PrivateContent] decrypt failed:', err);
      return null;
    }
  }, [rpc, connected, authReady]);

  return { encryptForSpace, decryptForSpace };
}

/**
 * Shareable private-space invites (node-managed, out-of-band). The inviter's node
 * produces a self-contained `swiminv1:...` blob (space key wrapped for the invitee);
 * the invitee redeems it to join — no network invite propagation needed.
 *
 * NOTE: create_space_invite_blob needs the 16-byte HEX space id, not the sp1 bech32 form.
 */
export function useSpaceInvites() {
  const { rpc, connected } = useRpc();

  const createBlob = useCallback(async (spaceId: string, inviteePubkeyHex: string): Promise<string> => {
    if (!rpc || !connected) throw new Error('Not connected');
    const r = await rpc.call('create_space_invite_blob', { space_id: spaceId, invitee: inviteePubkeyHex }) as { blob: string };
    return r.blob;
  }, [rpc, connected]);

  const redeem = useCallback(async (blob: string): Promise<{ spaceId: string; spaceIdBech32?: string; name?: string }> => {
    if (!rpc || !connected) throw new Error('Not connected');
    const r = await rpc.call('redeem_space_invite', { blob: blob.trim() }) as { space_id: string; space_id_bech32?: string; name?: string | null };
    return { spaceId: r.space_id, spaceIdBech32: r.space_id_bech32, name: r.name ?? undefined };
  }, [rpc, connected]);

  return { createBlob, redeem };
}

/**
 * Hook to get pending invites for user
 */
export function usePrivateSpaceInvites(userPublicKey?: string) {
  const { rpc, connected, authReady } = useRpc();
  const [invites, setInvites] = useState<InviteInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchInvites = useCallback(async () => {
    if (!rpc || !connected || !authReady || !userPublicKey) return;

    setLoading(true);
    setError(null);

    try {
      const result = await rpc.call('get_my_invites', { user: userPublicKey }) as {
        invites: Array<{
          invite_hash: string;
          space_id: string;
          inviter: string;
          encrypted_space_key: string;
          created_at: number;
          expires_at?: number;
          message?: string;
        }>;
      };

      setInvites(result.invites.map(i => ({
        inviteHash: i.invite_hash,
        spaceId: i.space_id,
        inviter: i.inviter,
        encryptedSpaceKey: i.encrypted_space_key,
        createdAt: i.created_at,
        expiresAt: i.expires_at,
        message: i.message,
      })));
    } catch (err) {
      console.error('[PrivateSpaceInvites] Failed to fetch:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch invites');
    } finally {
      setLoading(false);
    }
  }, [rpc, connected, authReady, userPublicKey]);

  useEffect(() => {
    if (connected && authReady && userPublicKey) {
      fetchInvites();
    }
  }, [connected, authReady, userPublicKey, fetchInvites]);

  return { invites, loading, error, refetch: fetchInvites };
}

/**
 * Hook to get members of a private space
 */
export function useSpaceMembers(spaceId?: string) {
  const { rpc, connected, authReady } = useRpc();
  const [members, setMembers] = useState<SpaceMemberInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchMembers = useCallback(async () => {
    if (!rpc || !connected || !authReady || !spaceId) return;

    setLoading(true);
    setError(null);

    try {
      const result = await rpc.call('get_space_members', { space_id: spaceId }) as {
        space_id: string;
        members: Array<{
          member: string;
          role: string;
          joined_at: number;
          invited_by: string;
        }>;
        count: number;
      };

      setMembers(result.members.map(m => ({
        member: m.member,
        role: m.role as 'admin' | 'moderator' | 'member',
        joinedAt: m.joined_at,
        invitedBy: m.invited_by,
      })));
    } catch (err) {
      console.error('[SpaceMembers] Failed to fetch:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch members');
    } finally {
      setLoading(false);
    }
  }, [rpc, connected, authReady, spaceId]);

  useEffect(() => {
    if (connected && authReady && spaceId) {
      fetchMembers();
    }
  }, [connected, authReady, spaceId, fetchMembers]);

  return { members, loading, error, refetch: fetchMembers };
}

/**
 * Hook to create a private space
 */
export function useCreatePrivateSpace() {
  const { rpc, connected, authReady } = useRpc();
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createSpace = useCallback(async (params: {
    name: string;
    creator: string;
    creatorEncryptedKey: string;
    signature: string;
    powNonce: number;
    powDifficulty: number;
    powNonceSpace: string;
    powHash: string;
    timestamp: number;
  }): Promise<{ spaceId: string; spaceIdBech32: string } | null> => {
    if (!rpc || !connected || !authReady) {
      setError('Not connected or auth not ready');
      return null;
    }

    setCreating(true);
    setError(null);

    try {
      const result = await rpc.call('create_private_space', {
        name: params.name,
        creator: params.creator,
        creator_encrypted_key: params.creatorEncryptedKey,
        signature: params.signature,
        pow_nonce: params.powNonce,
        pow_difficulty: params.powDifficulty,
        pow_nonce_space: params.powNonceSpace,
        pow_hash: params.powHash,
        timestamp: params.timestamp,
      }) as { space_id: string; space_id_bech32: string; broadcast: boolean };

      return {
        spaceId: result.space_id,
        spaceIdBech32: result.space_id_bech32,
      };
    } catch (err) {
      console.error('[CreatePrivateSpace] Failed:', err);
      setError(err instanceof Error ? err.message : 'Failed to create private space');
      return null;
    } finally {
      setCreating(false);
    }
  }, [rpc, connected, authReady]);

  // Node-managed create (desktop mode): the node owns the seed and does all crypto +
  // PoW + signing, so we send only the plaintext name. Used when embedded in the shell.
  const createSpaceManaged = useCallback(async (params: {
    name: string;
    description?: string;
  }): Promise<{ spaceId: string; spaceIdBech32: string } | null> => {
    if (!rpc || !connected || !authReady) {
      setError('Not connected or auth not ready');
      return null;
    }
    setCreating(true);
    setError(null);
    try {
      const result = await rpc.call('create_private_space_managed', {
        name: params.name,
        description: params.description ?? null,
      }) as { space_id: string; space_id_bech32: string; broadcast: boolean };
      return { spaceId: result.space_id, spaceIdBech32: result.space_id_bech32 };
    } catch (err) {
      // Surface the node's real error (e.g. "Identity is not sponsored…") instead of
      // returning null, which made the UI show a useless "no space ID returned".
      setError(err instanceof Error ? err.message : 'Failed to create private space');
      throw err;
    } finally {
      setCreating(false);
    }
  }, [rpc, connected, authReady]);

  return { createSpace, createSpaceManaged, creating, error };
}

/**
 * Hook to invite someone to a private space
 */
export function useInviteToSpace() {
  const { rpc, connected, authReady } = useRpc();
  const [inviting, setInviting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const invite = useCallback(async (params: {
    spaceId: string;
    inviter: string;
    invitee: string;
    encryptedSpaceKey: string;
    signature: string;
    powNonce: number;
    powDifficulty: number;
    powNonceSpace: string;
    powHash: string;
    timestamp: number;
    expiresAt?: number;
    message?: string;
  }): Promise<{ inviteHash: string } | null> => {
    if (!rpc || !connected || !authReady) {
      setError('Not connected or auth not ready');
      return null;
    }

    setInviting(true);
    setError(null);

    try {
      const result = await rpc.call('invite_to_space', {
        space_id: params.spaceId,
        inviter: params.inviter,
        invitee: params.invitee,
        encrypted_space_key: params.encryptedSpaceKey,
        signature: params.signature,
        pow_nonce: params.powNonce,
        pow_difficulty: params.powDifficulty,
        pow_nonce_space: params.powNonceSpace,
        pow_hash: params.powHash,
        timestamp: params.timestamp,
        expires_at: params.expiresAt,
        message: params.message,
      }) as { invite_hash: string; broadcast: boolean };

      return { inviteHash: result.invite_hash };
    } catch (err) {
      console.error('[InviteToSpace] Failed:', err);
      setError(err instanceof Error ? err.message : 'Failed to send invite');
      return null;
    } finally {
      setInviting(false);
    }
  }, [rpc, connected, authReady]);

  return { invite, inviting, error };
}

/**
 * Hook to accept an invite
 */
export function useAcceptInvite() {
  const { rpc, connected, authReady } = useRpc();
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const accept = useCallback(async (params: {
    inviteHash: string;
    acceptor: string;
    signature: string;
    timestamp: number;
  }): Promise<{ spaceId: string } | null> => {
    if (!rpc || !connected || !authReady) {
      setError('Not connected or auth not ready');
      return null;
    }

    setAccepting(true);
    setError(null);

    try {
      const result = await rpc.call('accept_invite', {
        invite_hash: params.inviteHash,
        acceptor: params.acceptor,
        signature: params.signature,
        timestamp: params.timestamp,
      }) as { space_id: string; broadcast: boolean };

      return { spaceId: result.space_id };
    } catch (err) {
      console.error('[AcceptInvite] Failed:', err);
      setError(err instanceof Error ? err.message : 'Failed to accept invite');
      return null;
    } finally {
      setAccepting(false);
    }
  }, [rpc, connected, authReady]);

  return { accept, accepting, error };
}

/**
 * Hook to leave a private space
 */
export function useLeaveSpace() {
  const { rpc, connected, authReady } = useRpc();
  const [leaving, setLeaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const leave = useCallback(async (params: {
    spaceId: string;
    member: string;
    signature: string;
    timestamp: number;
  }): Promise<boolean> => {
    if (!rpc || !connected || !authReady) {
      setError('Not connected or auth not ready');
      return false;
    }

    setLeaving(true);
    setError(null);

    try {
      const result = await rpc.call('leave_space', {
        space_id: params.spaceId,
        member: params.member,
        signature: params.signature,
        timestamp: params.timestamp,
      }) as { success: boolean; broadcast: boolean };

      return result.success;
    } catch (err) {
      console.error('[LeaveSpace] Failed:', err);
      setError(err instanceof Error ? err.message : 'Failed to leave space');
      return false;
    } finally {
      setLeaving(false);
    }
  }, [rpc, connected, authReady]);

  return { leave, leaving, error };
}

/**
 * Hook for kicking a member from a private space
 */
export function useKickMember() {
  const { rpc, connected, authReady } = useRpc();
  const [kicking, setKicking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const kick = useCallback(async (params: {
    spaceId: string;
    admin: string;
    member: string;
    newEncryptedKeys: Record<string, string>;
    keyVersion: number;
    powNonce: number;
    powDifficulty: number;
    powNonceSpace: string;
    powHash: string;
    signature: string;
    timestamp: number;
  }): Promise<{ success: boolean; keyVersion: number } | null> => {
    if (!rpc || !connected || !authReady) {
      setError('Not connected or auth not ready');
      return null;
    }

    setKicking(true);
    setError(null);

    try {
      const result = await rpc.call('kick_member', {
        space_id: params.spaceId,
        admin: params.admin,
        member: params.member,
        new_encrypted_keys: params.newEncryptedKeys,
        key_version: params.keyVersion,
        pow_nonce: params.powNonce,
        pow_difficulty: params.powDifficulty,
        pow_nonce_space: params.powNonceSpace,
        pow_hash: params.powHash,
        signature: params.signature,
        timestamp: params.timestamp,
      }) as { success: boolean; key_version: number; broadcast: boolean };

      return { success: result.success, keyVersion: result.key_version };
    } catch (err) {
      console.error('[KickMember] Failed:', err);
      setError(err instanceof Error ? err.message : 'Failed to kick member');
      return null;
    } finally {
      setKicking(false);
    }
  }, [rpc, connected, authReady]);

  return { kick, kicking, error };
}

/**
 * Hook for sending a DM request
 */
export function useRequestDM() {
  const { rpc, connected, authReady } = useRpc();
  const [requesting, setRequesting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const request = useCallback(async (params: {
    requester: string;
    recipient: string;
    keyShare: string;
    powNonce: number;
    powDifficulty: number;
    powNonceSpace: string;
    powHash: string;
    signature: string;
    timestamp: number;
  }): Promise<{ requestHash: string } | null> => {
    if (!rpc || !connected || !authReady) {
      setError('Not connected or auth not ready');
      return null;
    }

    setRequesting(true);
    setError(null);

    try {
      const result = await rpc.call('request_dm', {
        requester: params.requester,
        recipient: params.recipient,
        key_share: params.keyShare,
        pow_nonce: params.powNonce,
        pow_difficulty: params.powDifficulty,
        pow_nonce_space: params.powNonceSpace,
        pow_hash: params.powHash,
        signature: params.signature,
        timestamp: params.timestamp,
      }) as { request_hash: string; broadcast: boolean };

      return { requestHash: result.request_hash };
    } catch (err) {
      console.error('[RequestDM] Failed:', err);
      setError(err instanceof Error ? err.message : 'Failed to send DM request');
      return null;
    } finally {
      setRequesting(false);
    }
  }, [rpc, connected, authReady]);

  return { request, requesting, error };
}

/**
 * Hook for accepting a DM request
 */
export function useAcceptDM() {
  const { rpc, connected, authReady } = useRpc();
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const accept = useCallback(async (params: {
    requester: string;
    acceptor: string;
    keyShare: string;
    signature: string;
    timestamp: number;
  }): Promise<{ spaceId: string } | null> => {
    if (!rpc || !connected || !authReady) {
      setError('Not connected or auth not ready');
      return null;
    }

    setAccepting(true);
    setError(null);

    try {
      const result = await rpc.call('accept_dm', {
        requester: params.requester,
        acceptor: params.acceptor,
        key_share: params.keyShare,
        signature: params.signature,
        timestamp: params.timestamp,
      }) as { space_id: string; broadcast: boolean };

      return { spaceId: result.space_id };
    } catch (err) {
      console.error('[AcceptDM] Failed:', err);
      setError(err instanceof Error ? err.message : 'Failed to accept DM request');
      return null;
    } finally {
      setAccepting(false);
    }
  }, [rpc, connected, authReady]);

  return { accept, accepting, error };
}

/**
 * Hook for declining a DM request
 */
export function useDeclineDM() {
  const { rpc, connected, authReady } = useRpc();
  const [declining, setDeclining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const decline = useCallback(async (params: {
    requester: string;
    decliner: string;
    signature: string;
    timestamp: number;
  }): Promise<boolean> => {
    if (!rpc || !connected || !authReady) {
      setError('Not connected or auth not ready');
      return false;
    }

    setDeclining(true);
    setError(null);

    try {
      const result = await rpc.call('decline_dm', {
        requester: params.requester,
        decliner: params.decliner,
        signature: params.signature,
        timestamp: params.timestamp,
      }) as { success: boolean; broadcast: boolean };

      return result.success;
    } catch (err) {
      console.error('[DeclineDM] Failed:', err);
      setError(err instanceof Error ? err.message : 'Failed to decline DM request');
      return false;
    } finally {
      setDeclining(false);
    }
  }, [rpc, connected, authReady]);

  return { decline, declining, error };
}

/**
 * Hook for getting pending DM requests
 */
export function usePendingDMRequests(userId?: string) {
  const { rpc, connected, authReady } = useRpc();
  const [requests, setRequests] = useState<Array<{
    requestHash: string;
    requester: string;
    keyShare: string;
    createdAt: number;
  }>>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!rpc || !connected || !authReady || !userId) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await rpc.call('get_pending_dm_requests', {
        user_id: userId,
      }) as { requests: Array<{ request_hash: string; requester: string; key_share: string; created_at: number }> };

      setRequests(result.requests.map(r => ({
        requestHash: r.request_hash,
        requester: r.requester,
        keyShare: r.key_share,
        createdAt: r.created_at,
      })));
    } catch (err) {
      console.error('[PendingDMRequests] Failed:', err);
      setError(err instanceof Error ? err.message : 'Failed to get pending DM requests');
    } finally {
      setLoading(false);
    }
  }, [rpc, connected, authReady, userId]);

  useEffect(() => {
    if (connected && authReady && userId) {
      refetch();
    }
  }, [connected, authReady, userId, refetch]);

  return { requests, loading, error, refetch };
}

// =========================================================================
// Search Hook
// =========================================================================

/**
 * Search result item from the search RPC
 */
export interface SearchResult {
  id: string;
  type: 'space' | 'thread';
  score: number;
  highlights: {
    name?: string;
    content?: string;
  };
  data: {
    // Space fields
    spaceId?: string;
    name?: string;
    description?: string;
    threadCount?: number;
    memberCount?: number;
    lastActivity?: number;
    isActive?: boolean;
    // Thread fields
    contentId?: string;
    authorId?: string;
    title?: string;
    body?: string;
    createdAt?: number;
    lastEngagement?: number;
    replyCount?: number;
    reactionCount?: number;
    hasMedia?: boolean;
  };
}

/**
 * Hook to search spaces and threads
 */
export function useSearch(query: string, types?: ('space' | 'thread')[]): {
  results: SearchResult[];
  total: number;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
} {
  const { rpc, connected, authReady } = useRpc();
  const [results, setResults] = useState<SearchResult[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    // Search requires authentication, so wait for authReady
    if (!rpc || !connected || !authReady) {
      setResults([]);
      setTotal(0);
      setLoading(false);
      return;
    }

    const trimmedQuery = query.trim();
    if (!trimmedQuery) {
      setResults([]);
      setTotal(0);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const params: { query: string; types?: string[]; limit?: number } = {
        query: trimmedQuery,
        limit: 50,
      };
      if (types && types.length > 0) {
        params.types = types;
      }

      const result = await rpc.call('search', params) as {
        results: SearchResult[];
        total: number;
        took_ms: number;
      };

      setResults(result.results);
      setTotal(result.total);
    } catch (err) {
      console.error('[Search] Failed:', err);
      setError(err instanceof Error ? err.message : 'Search failed');
      setResults([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [rpc, connected, authReady, query, types]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { results, total, loading, error, refetch };
}
