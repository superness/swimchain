/**
 * React hooks for Swimchain RPC integration
 */

import { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import {
  SwimchainRpc,
  RpcConfig,
  initRpc,
  LOCAL_CONFIG,
  getLocalConfigWithAuth,
  isInTauri,
} from '../lib/rpc';
import type { Space, Reply, SyncStatus, StoredIdentity, Message, DecayInfo, PoolState } from '../types';

/**
 * Thread type for RPC hooks (forum-style content)
 * Different from chat-client's Thread which wraps Message
 */
interface RpcThread {
  id: string;
  spaceId: string;
  author: string;
  title: string;
  content: string;
  createdAt: number;
  lastEngagement: number;
  replyCount: number;
  heat: number;
  pool: PoolState;
  decay: DecayInfo;
}

// Storage key for identity (must match useStoredIdentity)
const IDENTITY_STORAGE_KEY = 'swimchain-identity';

/**
 * Load stored identity from localStorage
 */
function loadStoredIdentity(): StoredIdentity | null {
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
  /** Set up remote signer for node identity */
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
  const [rpc, setRpc] = useState<SwimchainRpc | null>(hmrState.rpc);
  const [connected, setConnected] = useState(hmrState.connected);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(hmrState.authReady);
  const [nodeInfo, setNodeInfo] = useState<RpcContextValue['nodeInfo']>(hmrState.nodeInfo);

  // Track identity seed to detect changes and reconnect
  const lastIdentitySeedRef = useRef<string | null>(null);

  const connect = useCallback(async (config: RpcConfig): Promise<boolean> => {
    setConnecting(true);
    setError(null);

    try {
      const client = initRpc(config);
      const success = await client.connect();

      if (success) {
        const info = client.getNodeInfo();
        const nodeInfoObj = info ? {
          version: info.version,
          network: info.network,
          peerCount: info.peer_count,
        } : null;
        setRpc(client);
        setConnected(true);
        setNodeInfo(nodeInfoObj);
        // Persist to HMR state
        hmrState.rpc = client;
        hmrState.connected = true;
        hmrState.nodeInfo = nodeInfoObj;
        return true;
      } else {
        setError('Failed to connect to node');
        return false;
      }
    } catch (err) {
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
    // Clear HMR state
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
    // Get base config - in Tauri, this includes cookie auth
    const baseConfig = isInTauri()
      ? await getLocalConfigWithAuth('testnet')
      : LOCAL_CONFIG;

    // Load identity for signature auth (browser clients)
    const identity = loadStoredIdentity();

    if (identity?.seed && identity?.publicKey) {
      return {
        ...baseConfig,
        seed: identity.seed,
        publicKey: identity.publicKey,
      };
    }
    return baseConfig;
  };

  useEffect(() => {
    let retryInterval: ReturnType<typeof setInterval> | null = null;
    let identityCheckInterval: ReturnType<typeof setInterval> | null = null;

    const doConnect = async (): Promise<boolean> => {
      const config = await buildConfigWithIdentity();

      // Track the identity seed we're using
      lastIdentitySeedRef.current = config.seed ?? null;

      return connect(config);
    };

    const autoConnect = async () => {
      // Skip auto-connect if we already have a connection (from HMR)
      if (hmrState.rpc && hmrState.connected) {
        console.log('[RPC] Skipping auto-connect - already connected via HMR state');
        return;
      }

      console.log('[RPC] Connecting to local node...');

      if (await doConnect()) {
        console.log('[RPC] Connected to local node');
        return;
      }

      // Connection failed - user needs to start their node
      console.log('[RPC] Could not connect to local node');
      console.log('[RPC] Make sure your Swimchain node is running: sw node start --testnet');

      // Retry every 5 seconds
      retryInterval = setInterval(async () => {
        if (await doConnect()) {
          console.log('[RPC] Connected to local node');
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
        // Clear retry interval if active
        if (retryInterval) {
          clearInterval(retryInterval);
          retryInterval = null;
        }
        // Reconnect with new identity
        doConnect().then(success => {
          if (!success) {
            // Start retry loop
            retryInterval = setInterval(async () => {
              if (await doConnect()) {
                if (retryInterval) clearInterval(retryInterval);
              }
            }, 5000);
          }
        });
      }
    }, 1000);

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
      hmrState.authReady = true;
      console.log('[RPC] Remote signer configured for node identity - auth is now ready');
    } else {
      console.warn('[RPC] Cannot set remote signer - RPC not connected');
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
 * Returns spaces in the format expected by chat-client (with icon, memberCount, etc.)
 */
export function useSpaces(): { spaces: Space[]; loading: boolean; error: string | null; refetch: () => Promise<void> } {
  const { rpc, connected } = useRpc();
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!rpc || !connected) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const result = await rpc.listSpaces();

      // Transform RPC result to chat-client Space format
      const transformedSpaces: Space[] = result.spaces.map(s => ({
        id: s.space_id,
        name: s.name ?? s.space_id.substring(0, 12) + '...', // Use space_id prefix if no name
        icon: getSpaceIcon(s.name ?? s.space_id), // Derive icon from name
        memberCount: s.post_count, // Use post count as proxy for activity
        onlineCount: 0, // Not tracked
        unreadCount: 0, // Not tracked
        category: 'General', // Default category
      }));

      setSpaces(transformedSpaces);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch spaces');
      // Keep existing spaces on error
    } finally {
      setLoading(false);
    }
  }, [rpc, connected]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { spaces, loading, error, refetch };
}

/**
 * Get an icon for a space based on its name
 */
function getSpaceIcon(name: string): string {
  const lowerName = name.toLowerCase();
  if (lowerName.includes('rust')) return '🦀';
  if (lowerName.includes('web') || lowerName.includes('dev')) return '🌐';
  if (lowerName.includes('boston')) return '🏙️';
  if (lowerName.includes('wood')) return '🪵';
  if (lowerName.includes('fish')) return '🎣';
  if (lowerName.includes('test')) return '🧪';
  if (lowerName.includes('general')) return '💬';
  return '📝'; // Default icon
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
  },
  poolData?: {
    has_pool: boolean;
    total_pow: number;
    required_pow: number;
    status: string;
    contributor_count: number;
  }
): RpcThread {
  // Default timestamps with safety for undefined/null/0
  const createdAt = content.created_at || Date.now();
  const lastEngagement = content.last_engagement || createdAt;

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
  const body = content.body ?? '';
  const derivedTitle = content.title ?? (body.split('\n')[0]?.trim().substring(0, 80) || 'Untitled');

  return {
    id: content.content_id,
    spaceId: content.space_id,
    author: content.author_id,
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
  };
}

/**
 * Hook to fetch threads for a space
 */
export function useSpaceThreads(spaceId: string): {
  threads: RpcThread[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
} {
  const { rpc, connected } = useRpc();
  const [threads, setThreads] = useState<RpcThread[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!rpc || !connected) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const result = await rpc.listSpaceContent(spaceId);

      // Filter to only show top-level posts (not replies) and transform to Thread format
      const topLevelPosts = result.items.filter(
        item => item.content_type === 'Post' || (!item.parent_id && item.content_type !== 'Reply')
      );
      const transformedThreads: RpcThread[] = topLevelPosts.map(item => contentToThread(item));

      setThreads(transformedThreads);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch threads');
    } finally {
      setLoading(false);
    }
  }, [rpc, connected, spaceId]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { threads, loading, error, refetch };
}

/**
 * Hook to fetch a single thread
 * Will request content from network if not available locally
 */
export function useThread(contentId: string): {
  thread: RpcThread | null;
  loading: boolean;
  error: string | null;
  fetching: boolean;
  refetch: () => Promise<void>;
} {
  const { rpc, connected } = useRpc();
  const [thread, setThread] = useState<RpcThread | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fetching, setFetching] = useState(false);

  // Refetch function that can be called after pool completion
  const refetch = async () => {
    if (!rpc || !connected || !contentId) return;

    try {
      const content = await rpc.getContent(contentId);
      let poolData;
      try {
        poolData = await rpc.getPoolForContent(contentId);
        console.log('[useThread] Refetch pool data:', poolData);
      } catch { /* Pool data not available */ }
      setThread(contentToThread(content, poolData));
    } catch (err) {
      console.error('[useThread] Refetch error:', err);
    }
  };

  useEffect(() => {
    if (!rpc || !connected || !contentId) {
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
          console.log('[useThread] Pool data:', poolData);
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
          console.log('[useThread] Content not found locally, requesting from network:', contentId);
          setFetching(true);

          try {
            // Request content from network
            const requestResult = await rpc.requestContent(contentId);
            console.log('[useThread] Request result:', requestResult);

            if (requestResult.status === 'found_locally') {
              // Content was already available - retry get
              const content = await rpc.getContent(contentId);
              let poolData;
              try {
                poolData = await rpc.getPoolForContent(contentId);
              } catch { /* Pool data not available */ }
              if (!cancelled) {
                setThread(contentToThread(content, poolData));
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
  }, [rpc, connected, contentId]);

  return { thread, loading, error, fetching, refetch };
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
    signFn: (message: Uint8Array) => Uint8Array,
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
      const { hexToBytes, bytesToHex, computePow, ActionType, TESTNET_DIFFICULTY, TESTNET_CONFIG } = await import('@swimchain/frontend');

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

      console.log('[Engage] Starting Argon2id PoW mining:', { difficulty, timestamp, emoji });

      const startTime = Date.now();
      const solution = await computePow(
        challenge,
        TESTNET_CONFIG,
        (attempts, elapsedMs, _hashRate) => {
          setProgress({ attempts, elapsedMs });
        },
      );

      console.log('[Engage] Mining complete:', {
        nonce: solution.nonce.toString(),
        elapsedMs: Date.now() - startTime,
      });

      // Sign the engagement
      const signMessage = new TextEncoder().encode(
        `engage:${contentId}:${solution.nonce}:${timestamp}${emoji ? `:${emoji}` : ''}`
      );
      const signature = signFn(signMessage);
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

      console.log('[Engage] Submit result:', result);

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
   */
  const submitPost = useCallback(async (
    spaceId: string,
    title: string,
    body: string,
    identityPublicKey: string,
    signFn: (message: Uint8Array) => Uint8Array,
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
      // Sign the post - using the timestamp from the PoW challenge
      const signMessage = new TextEncoder().encode(
        `post:${spaceId}:${title}:${body}:${powParams.timestamp}`
      );
      const signature = signFn(signMessage);
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
      });

      console.log('[Post] Submit result:', result);

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
   * @param mediaRefs - Optional array of media references (images)
   */
  const submitReply = useCallback(async (
    parentId: string,
    body: string,
    identityPublicKey: string,
    signFn: (message: Uint8Array) => Uint8Array,
    powParams: {
      pow_nonce: number;
      pow_difficulty: number;
      pow_nonce_space: string;
      pow_hash: string;
      timestamp: number;
    },
    mediaRefs?: Array<{ mediaHash: string; mediaType: string; sizeBytes: number }>
  ): Promise<{ success: boolean; contentId: string | null }> => {
    if (!rpc || !connected) {
      return { success: false, contentId: null };
    }

    setSubmitting(true);
    setError(null);

    try {
      // Sign the reply - using the timestamp from the PoW challenge
      const signMessage = new TextEncoder().encode(
        `reply:${parentId}:${body}:${powParams.timestamp}`
      );
      const signature = signFn(signMessage);
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
        mediaRefs,
      });

      console.log('[Reply] Submit result:', result);

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
 * Hook for fetching replies to content
 */
export function useReplies(contentId: string) {
  const { rpc, connected } = useRpc();
  const [replies, setReplies] = useState<Reply[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchReplies = useCallback(async () => {
    if (!rpc || !connected || !contentId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await rpc.getReplies(contentId);
      console.log('[Replies] Fetched:', result);

      // Convert flat replies to tree structure
      const replyTree = buildReplyTree(result.replies, contentId);
      setReplies(replyTree);
    } catch (err) {
      console.error('[Replies] Fetch error:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch replies');
      setReplies([]);
    } finally {
      setLoading(false);
    }
  }, [rpc, connected, contentId]);

  // Fetch on mount and when contentId changes
  useEffect(() => {
    fetchReplies();
  }, [fetchReplies]);

  return { replies, loading, error, refetch: fetchReplies };
}

/**
 * Build a nested reply tree from flat reply list
 */
function buildReplyTree(
  flatReplies: Array<{
    content_id: string;
    author_id: string;
    body: string;
    parent_id: string;
    created_at: number;
    last_engagement: number;
    // New decay fields from daemon
    decay_state?: string;
    seconds_until_decay_starts?: number | null;
    seconds_until_pruned?: number | null;
    survival_probability?: number;
    is_protected?: boolean;
    time_since_engagement?: number;
  }>,
  threadId: string
): Reply[] {
  // Create a map of all replies by ID
  const replyMap = new Map<string, Reply>();

  // First pass: create Reply objects for each item
  for (const item of flatReplies) {
    const decayState = (item.decay_state as 'protected' | 'active' | 'stale' | 'decayed') || 'active';
    const reply: Reply = {
      id: item.content_id,
      threadId,
      parentId: item.parent_id === threadId ? null : item.parent_id,
      author: item.author_id, // This is hex pubkey, should be converted to address
      content: item.body,
      createdAt: Math.floor(item.created_at / 1000), // Convert from ms to seconds
      lastEngagement: Math.floor(item.last_engagement / 1000),
      heat: item.survival_probability ?? calculateHeat(Math.floor(item.created_at / 1000), Math.floor(item.last_engagement / 1000)),
      depth: 0,
      children: [],
      decay: {
        state: decayState,
        survivalProbability: item.survival_probability ?? 1.0,
        isProtected: item.is_protected ?? false,
        secondsUntilDecayStarts: item.seconds_until_decay_starts ?? null,
        secondsUntilPruned: item.seconds_until_pruned ?? null,
        timeSinceEngagement: item.time_since_engagement ?? 0,
      },
    };
    replyMap.set(item.content_id, reply);
  }

  // Second pass: build tree structure
  const rootReplies: Reply[] = [];

  for (const reply of replyMap.values()) {
    if (reply.parentId === null) {
      // Direct reply to thread
      reply.depth = 0;
      rootReplies.push(reply);
    } else {
      // Nested reply - find parent and add as child
      const parent = replyMap.get(reply.parentId);
      if (parent) {
        reply.depth = parent.depth + 1;
        parent.children.push(reply);
      } else {
        // Parent not found (might be deleted), treat as root
        reply.depth = 0;
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
  const { rpc, connected } = useRpc();
  const [reactions, setReactions] = useState<{
    reactions: Array<{ emoji: string; reactionType: number; count: number }>;
    total: number;
    userReactions?: number[];
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchReactions = useCallback(async () => {
    if (!rpc || !connected || !contentId) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await rpc.getReactions(contentId);
      console.log('[Reactions] Fetched:', result);

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
  }, [rpc, connected, contentId]);

  // Fetch on mount and when contentId changes
  useEffect(() => {
    fetchReactions();
  }, [fetchReactions]);

  return { reactions, loading, error, refetch: fetchReactions };
}

// =========================================================================
// Message Hooks (for chat-client)
// =========================================================================

/**
 * Hook to fetch messages for a space
 * Returns Message objects formatted for chat-client
 */
export function useSpaceMessages(spaceId: string): {
  messages: Message[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
} {
  const { rpc, connected } = useRpc();
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!rpc || !connected || !spaceId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const result = await rpc.listSpaceContent(spaceId);

      // Transform to chat-client Message format
      const transformedMessages: Message[] = result.items.map(item => contentToMessage(item, spaceId));

      setMessages(transformedMessages);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch messages');
    } finally {
      setLoading(false);
    }
  }, [rpc, connected, spaceId]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { messages, loading, error, refetch };
}

/**
 * Transform RPC content to chat-client Message format
 */
function contentToMessage(
  content: {
    content_id: string;
    space_id: string;
    author_id: string;
    title: string | null;
    body: string | null;
    created_at: number;
    last_engagement: number;
    content_type?: string;
    parent_id?: string | null;
    decay_state?: string;
    survival_probability?: number;
    reply_count?: number;
    pool_progress?: number;
  },
  spaceId: string
): Message {
  const createdAt = Math.floor((content.created_at || Date.now()) / 1000);
  const lastEngagement = Math.floor((content.last_engagement || content.created_at || Date.now()) / 1000);
  const heatPercent = Math.round((content.survival_probability ?? 1.0) * 100);
  const poolProgress = content.pool_progress ?? 0;

  return {
    id: content.content_id,
    authorAddress: content.author_id,
    content: content.body ?? content.title ?? '',
    createdAt,
    lastEngagement,
    heatPercent,
    poolCurrent: Math.round(poolProgress * 60),
    poolTarget: 60,
    replyCount: content.reply_count ?? 0,
    parentId: content.parent_id ?? null,
    spaceId,
    reactions: {
      quickCount: 0, // Not tracked per-type in RPC
      standardCount: 0,
    },
  };
}

// =========================================================================
// Media Upload Hook
// =========================================================================

/** Protocol limit: 1MB max per media file */
const MAX_MEDIA_BYTES = 1024 * 1024;

/** Target size for compression (accounts for base64 overhead) */
const COMPRESSION_TARGET_BYTES = 700 * 1024;

export interface MediaUploadResult {
  mediaHash: string;
  mediaType: string;
  sizeBytes: number;
}

export interface MediaUploadResponse {
  success: boolean;
  result: MediaUploadResult | null;
  /** If true, file is too large and needs compression */
  needsCompression?: boolean;
  /** Original file size in bytes */
  originalSize?: number;
}

/**
 * Compress an image to fit within target size
 * Uses canvas to resize and JPEG compression
 */
async function compressImage(file: File, targetBytes: number): Promise<File> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);

      // Start with original dimensions
      let width = img.width;
      let height = img.height;
      let quality = 0.85;

      // Scale down if very large
      const maxDimension = 2048;
      if (width > maxDimension || height > maxDimension) {
        const scale = maxDimension / Math.max(width, height);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Failed to get canvas context'));
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);

      // Iteratively compress until under target size
      const compress = (currentQuality: number): void => {
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error('Failed to compress image'));
              return;
            }

            if (blob.size <= targetBytes || currentQuality <= 0.1) {
              // Done - create file
              const compressedFile = new File([blob], file.name, {
                type: 'image/jpeg',
                lastModified: Date.now(),
              });
              resolve(compressedFile);
            } else {
              // Try lower quality
              compress(currentQuality - 0.1);
            }
          },
          'image/jpeg',
          currentQuality
        );
      };

      compress(quality);
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image'));
    };

    img.src = url;
  });
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
          const result = reader.result as string;
          // Remove data URL prefix (e.g., "data:image/jpeg;base64,")
          const base64Data = result.split(',')[1];
          if (base64Data) {
            resolve(base64Data);
          } else {
            reject(new Error('Failed to read file as base64'));
          }
        };
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });

      // Upload to node
      const result = await rpc.uploadMedia({
        data: base64,
        mediaType: file.type,
      });

      console.log('[Media] Upload result:', result);

      return {
        success: result.success,
        result: {
          mediaHash: result.media_hash,
          mediaType: file.type,
          sizeBytes: result.size_bytes,
        },
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to upload image';
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
   * @returns MediaUploadResponse with hash, type, and size
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
      console.log(`[Media] Compressed ${(file.size / 1024).toFixed(0)}KB -> ${(compressedFile.size / 1024).toFixed(0)}KB`);

      // Read as base64
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          const base64Data = result.split(',')[1];
          if (base64Data) {
            resolve(base64Data);
          } else {
            reject(new Error('Failed to read file as base64'));
          }
        };
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(compressedFile);
      });

      // Upload to node
      const result = await rpc.uploadMedia({
        data: base64,
        mediaType: compressedFile.type,
      });

      console.log('[Media] Upload result:', result);

      return {
        success: result.success,
        result: {
          mediaHash: result.media_hash,
          mediaType: compressedFile.type,
          sizeBytes: result.size_bytes,
        },
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to upload image';
      setError(errorMessage);
      console.error('[Media] Upload error:', err);
      return { success: false, result: null };
    } finally {
      setUploading(false);
    }
  }, [rpc, connected]);

  /**
   * Get a media URL from its hash
   * Fetches from node and returns as data URL
   */
  const getMediaUrl = useCallback(async (
    mediaHash: string
  ): Promise<string | null> => {
    if (!rpc || !connected) return null;

    try {
      const result = await rpc.getMedia(mediaHash);

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
    getMediaUrl,
    uploading,
    error,
  };
}

// =========================================================================
// Private Channel Creation
// =========================================================================

/**
 * Hook to create a private (encrypted) channel
 */
export function useCreatePrivateChannel() {
  const { rpc, connected } = useRpc();
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createChannel = useCallback(async (params: {
    name: string;
    creator: string;
    creatorEncryptedKey: string;
    signature: string;
    powNonce: number;
    powDifficulty: number;
    powNonceSpace: string;
    powHash: string;
    timestamp: number;
  }): Promise<{ channelId: string; channelIdBech32: string } | null> => {
    if (!rpc || !connected) {
      setError('Not connected');
      return null;
    }

    setCreating(true);
    setError(null);

    try {
      const result = await rpc.createPrivateChannel(params);

      return {
        channelId: result.space_id,
        channelIdBech32: result.space_id_bech32,
      };
    } catch (err) {
      console.error('[CreatePrivateChannel] Failed:', err);
      setError(err instanceof Error ? err.message : 'Failed to create private channel');
      return null;
    } finally {
      setCreating(false);
    }
  }, [rpc, connected]);

  return { createChannel, creating, error };
}

/**
 * Hook to invite someone to a private channel
 */
export function useInviteToChannel() {
  const { rpc, connected } = useRpc();
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
    if (!rpc || !connected) {
      setError('Not connected');
      return null;
    }

    setInviting(true);
    setError(null);

    try {
      const result = await rpc.inviteToChannel(params);

      return {
        inviteHash: result.invite_hash,
      };
    } catch (err) {
      console.error('[InviteToChannel] Failed:', err);
      setError(err instanceof Error ? err.message : 'Failed to send invite');
      return null;
    } finally {
      setInviting(false);
    }
  }, [rpc, connected]);

  return { invite, inviting, error };
}

