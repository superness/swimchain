/**
 * Multi-layer caching for Swimchain React applications
 *
 * - IndexedDB: Media blobs (permanent, content-addressable)
 * - IndexedDB: Content with TTL (5 min default)
 * - Memory: Fast access with configurable TTL
 * - localStorage: Persistent small data
 *
 * @packageDocumentation
 */
export interface CachedMedia {
    hash: string;
    data: string;
    mediaType: string;
    timestamp: number;
}
export declare function getMediaFromCache(hash: string): Promise<CachedMedia | null>;
export declare function setMediaInCache(hash: string, data: string, mediaType: string): Promise<void>;
export interface CachedContent<T> {
    id: string;
    data: T;
    timestamp: number;
}
export declare function getContentFromCache<T>(id: string): Promise<T | null>;
export declare function setContentInCache<T>(id: string, data: T): Promise<void>;
export declare function deleteContentFromCache(id: string): Promise<void>;
export declare function getFromMemory<T>(key: string): T | null;
export declare function setInMemory<T>(key: string, data: T, ttlMs?: number): void;
export declare function invalidateMemory(keyPrefix: string): void;
export declare function getFromStorage<T>(key: string): T | null;
export declare function setInStorage<T>(key: string, data: T, ttlMs?: number): void;
export declare function removeFromStorage(key: string): void;
export declare function getCacheStats(): Promise<{
    mediaCount: number;
    contentCount: number;
    memoryCount: number;
}>;
/**
 * Clear all cached decrypted media (images/videos that were decrypted with a passphrase).
 * Called when user clears passphrases to ensure decrypted content doesn't persist.
 */
export declare function clearDecryptedMediaCache(): Promise<void>;
export declare function clearAllCaches(): Promise<void>;
//# sourceMappingURL=cache.d.ts.map