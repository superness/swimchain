/**
 * Hook to resolve display names for identities
 *
 * This hook provides a unified way to get display names for any identity,
 * using multiple sources:
 * 1. Inline display_name from content (if provided with the action)
 * 2. User profile (via useUserProfile)
 * 3. Fallback to truncated address
 *
 * The hook caches results and batches profile fetches for efficiency.
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useRpc } from './useRpc';
import { decode_address, isWasmLoaded } from '../wasm/loader';

// Note: We now use get_user_profile RPC which is more efficient than
// fetching profile space posts. The RPC already handles profile parsing.

/**
 * Convert a bech32m address (cs1...) to hex public key (64 chars)
 * Returns null if conversion fails or WASM is not loaded
 */
function bech32mToHex(address: string): string | null {
  // If already hex (64 chars, valid hex), return as-is
  if (/^[0-9a-fA-F]{64}$/.test(address)) {
    return address.toLowerCase();
  }

  // If not a bech32m address, return null
  if (!address.startsWith('cs1') && !address.startsWith('sw1')) {
    // Try to return as-is if it looks like a short hex (for legacy compatibility)
    if (/^[0-9a-fA-F]+$/.test(address)) {
      return address.toLowerCase();
    }
    return null;
  }

  // Decode bech32m to public key bytes using WASM
  if (!isWasmLoaded()) {
    console.warn('[useDisplayName] WASM not loaded, cannot decode bech32m address');
    return null;
  }

  try {
    const pubkeyBytes = decode_address(address);
    // Convert bytes to hex
    return Array.from(pubkeyBytes)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  } catch (error) {
    console.error('[useDisplayName] Failed to decode bech32m address:', error);
    return null;
  }
}

/** Display name resolution result */
export interface DisplayNameResult {
  /** The resolved display name (or truncated address if none) */
  displayName: string;
  /** Whether this is a resolved name (true) or fallback address (false) */
  isResolved: boolean;
  /** Whether the profile fetch is still loading */
  loading: boolean;
}

/** Cache entry for display names */
interface CacheEntry {
  displayName: string | null;
  isResolved: boolean;
  timestamp: number;
}

/** Global cache for display names (survives component remounts) */
const displayNameCache = new Map<string, CacheEntry>();

/** Cache TTL in milliseconds (5 minutes) */
const CACHE_TTL = 5 * 60 * 1000;

/** Pending fetches to avoid duplicate requests */
const pendingFetches = new Map<string, Promise<string | null>>();

/**
 * Truncate a public key for display
 */
function truncatePk(pk: string): string {
  if (pk.length <= 12) return pk;
  return `${pk.slice(0, 6)}...${pk.slice(-4)}`;
}

/**
 * Hook to resolve a single display name
 *
 * @param userPk - User's public key (hex)
 * @param inlineDisplayName - Display name provided inline with content (optional)
 * @returns Display name resolution result
 */
export function useDisplayName(
  userPk: string | undefined,
  inlineDisplayName?: string
): DisplayNameResult {
  const { rpc, connected } = useRpc();
  const [displayName, setDisplayName] = useState<string | null>(inlineDisplayName ?? null);
  const [loading, setLoading] = useState(false);
  const fetchingRef = useRef(false);

  // If inline display name is provided, use it immediately
  const hasInline = !!inlineDisplayName;

  const fetchDisplayName = useCallback(async (pk: string): Promise<string | null> => {
    if (!rpc || !connected) return null;

    // Convert bech32m to hex if needed (RPC expects hex public key)
    const hexPk = bech32mToHex(pk);
    if (!hexPk) {
      console.warn('[useDisplayName] Could not convert address to hex:', pk);
      return null;
    }

    // Use original pk for cache key (preserve the format caller used)
    // Check cache first
    const cached = displayNameCache.get(pk);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return cached.displayName;
    }

    // Check if already fetching
    const pending = pendingFetches.get(pk);
    if (pending) {
      return pending;
    }

    // Create fetch promise - use get_user_profile RPC for efficiency
    const fetchPromise = (async () => {
      try {
        // get_user_profile returns { display_name, bio, website, avatar_url, updated_at } or null
        // Use hexPk for RPC call (server expects hex format)
        const result = await rpc.call('get_user_profile', { user_id: hexPk }) as {
          display_name?: string | null;
          bio?: string | null;
          website?: string | null;
          avatar_url?: string | null;
          updated_at?: number | null;
        } | null;

        const name = result?.display_name ?? null;

        displayNameCache.set(pk, {
          displayName: name,
          isResolved: !!name,
          timestamp: Date.now(),
        });

        return name;
      } catch (error) {
        console.error('[useDisplayName] Failed to fetch profile:', error);
        // Cache the failure to avoid repeated lookups
        displayNameCache.set(pk, {
          displayName: null,
          isResolved: false,
          timestamp: Date.now(),
        });
        return null;
      } finally {
        pendingFetches.delete(pk);
      }
    })();

    pendingFetches.set(pk, fetchPromise);
    return fetchPromise;
  }, [rpc, connected]);

  useEffect(() => {
    // If we have an inline name, use it and don't fetch
    if (hasInline) {
      setDisplayName(inlineDisplayName!);
      setLoading(false);
      return;
    }

    // No public key, nothing to fetch
    if (!userPk) {
      setDisplayName(null);
      setLoading(false);
      return;
    }

    // Check cache immediately
    const cached = displayNameCache.get(userPk);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      setDisplayName(cached.displayName);
      setLoading(false);
      return;
    }

    // Fetch from profile
    if (!connected || fetchingRef.current) return;

    fetchingRef.current = true;
    setLoading(true);

    fetchDisplayName(userPk)
      .then((name) => {
        setDisplayName(name);
      })
      .finally(() => {
        setLoading(false);
        fetchingRef.current = false;
      });
  }, [userPk, inlineDisplayName, hasInline, connected, fetchDisplayName]);

  // Compute result
  const result = useMemo((): DisplayNameResult => {
    if (displayName) {
      return {
        displayName,
        isResolved: true,
        loading,
      };
    }

    return {
      displayName: userPk ? truncatePk(userPk) : '',
      isResolved: false,
      loading,
    };
  }, [displayName, loading, userPk]);

  return result;
}

/**
 * Hook to resolve multiple display names at once (batched)
 *
 * @param userPks - Array of public keys to resolve
 * @param inlineNames - Map of pk -> inline display name (optional)
 * @returns Map of pk -> DisplayNameResult
 */
export function useDisplayNames(
  userPks: string[],
  inlineNames?: Map<string, string>
): Map<string, DisplayNameResult> {
  const { rpc, connected } = useRpc();
  const [results, setResults] = useState<Map<string, DisplayNameResult>>(new Map());

  // Deduplicate public keys
  const uniquePks = useMemo(() => [...new Set(userPks)], [userPks.join(',')]);

  const fetchAllNames = useCallback(async () => {
    if (!rpc || !connected || uniquePks.length === 0) return;

    const newResults = new Map<string, DisplayNameResult>();

    // First pass: populate from cache and inline names
    const toFetch: string[] = [];
    for (const pk of uniquePks) {
      // Check inline name first
      const inlineName = inlineNames?.get(pk);
      if (inlineName) {
        newResults.set(pk, {
          displayName: inlineName,
          isResolved: true,
          loading: false,
        });
        continue;
      }

      // Check cache
      const cached = displayNameCache.get(pk);
      if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        newResults.set(pk, {
          displayName: cached.displayName ?? truncatePk(pk),
          isResolved: cached.isResolved,
          loading: false,
        });
        continue;
      }

      // Need to fetch
      toFetch.push(pk);
      newResults.set(pk, {
        displayName: truncatePk(pk),
        isResolved: false,
        loading: true,
      });
    }

    setResults(new Map(newResults));

    // Second pass: fetch missing names in batches
    const batchSize = 5;
    for (let i = 0; i < toFetch.length; i += batchSize) {
      const batch = toFetch.slice(i, i + batchSize);

      await Promise.all(batch.map(async (pk) => {
        try {
          // Convert bech32m to hex if needed (RPC expects hex public key)
          const hexPk = bech32mToHex(pk);
          if (!hexPk) {
            console.warn('[useDisplayName] Could not convert address to hex:', pk);
            newResults.set(pk, {
              displayName: truncatePk(pk),
              isResolved: false,
              loading: false,
            });
            return;
          }

          // Use efficient get_user_profile RPC (with hex format)
          const result = await rpc.call('get_user_profile', { user_id: hexPk }) as {
            display_name?: string | null;
          } | null;

          const foundName = result?.display_name ?? null;

          // Update cache
          displayNameCache.set(pk, {
            displayName: foundName,
            isResolved: !!foundName,
            timestamp: Date.now(),
          });

          // Update results
          newResults.set(pk, {
            displayName: foundName ?? truncatePk(pk),
            isResolved: !!foundName,
            loading: false,
          });
        } catch {
          // Cache failure to avoid repeated lookups
          displayNameCache.set(pk, {
            displayName: null,
            isResolved: false,
            timestamp: Date.now(),
          });
          newResults.set(pk, {
            displayName: truncatePk(pk),
            isResolved: false,
            loading: false,
          });
        }
      }));

      // Update state after each batch
      setResults(new Map(newResults));
    }
  }, [rpc, connected, uniquePks, inlineNames]);

  useEffect(() => {
    fetchAllNames();
  }, [fetchAllNames]);

  return results;
}

/**
 * Clear the display name cache (useful after updating own profile)
 */
export function clearDisplayNameCache(userPk?: string): void {
  if (userPk) {
    displayNameCache.delete(userPk);
  } else {
    displayNameCache.clear();
  }
}

/**
 * Pre-populate the cache with known display names
 * (useful when receiving data with inline display_name)
 */
export function cacheDisplayName(userPk: string, displayName: string): void {
  displayNameCache.set(userPk, {
    displayName,
    isResolved: true,
    timestamp: Date.now(),
  });
}
