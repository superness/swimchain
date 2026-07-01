/**
 * Multi-layer caching for forum-client
 *
 * - IndexedDB: Media blobs (permanent, content-addressable)
 * - Memory: RPC responses with TTL
 * - localStorage: Spaces, user preferences
 */

// ============================================
// IndexedDB Media Cache
// ============================================

const DB_NAME = 'swimchain-cache';
const DB_VERSION = 1;
const MEDIA_STORE = 'media';
const CONTENT_STORE = 'content';

let dbPromise: Promise<IDBDatabase> | null = null;

function getDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // Media store: key = mediaHash, value = { data, mediaType, timestamp }
      if (!db.objectStoreNames.contains(MEDIA_STORE)) {
        db.createObjectStore(MEDIA_STORE, { keyPath: 'hash' });
      }

      // Content store: key = contentId, value = { data, timestamp }
      if (!db.objectStoreNames.contains(CONTENT_STORE)) {
        const store = db.createObjectStore(CONTENT_STORE, { keyPath: 'id' });
        store.createIndex('timestamp', 'timestamp');
      }
    };
  });

  return dbPromise;
}

// ============================================
// Media Cache (IndexedDB - permanent)
// ============================================

export interface CachedMedia {
  hash: string;
  data: string; // base64
  mediaType: string;
  timestamp: number;
}

export async function getMediaFromCache(hash: string): Promise<CachedMedia | null> {
  try {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(MEDIA_STORE, 'readonly');
      const store = tx.objectStore(MEDIA_STORE);
      const request = store.get(hash);

      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.warn('[Cache] IndexedDB error:', err);
    return null;
  }
}

export async function setMediaInCache(hash: string, data: string, mediaType: string): Promise<void> {
  try {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(MEDIA_STORE, 'readwrite');
      const store = tx.objectStore(MEDIA_STORE);
      const request = store.put({
        hash,
        data,
        mediaType,
        timestamp: Date.now(),
      });

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.warn('[Cache] IndexedDB write error:', err);
  }
}

// ============================================
// Content Cache (IndexedDB with TTL)
// ============================================

const CONTENT_TTL_MS = 5 * 60 * 1000; // 5 minutes

export interface CachedContent<T> {
  id: string;
  data: T;
  timestamp: number;
}

export async function getContentFromCache<T>(id: string): Promise<T | null> {
  try {
    const db = await getDB();
    const cached = await new Promise<CachedContent<T> | null>((resolve, reject) => {
      const tx = db.transaction(CONTENT_STORE, 'readonly');
      const store = tx.objectStore(CONTENT_STORE);
      const request = store.get(id);

      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });

    if (!cached) return null;

    // Check TTL
    if (Date.now() - cached.timestamp > CONTENT_TTL_MS) {
      // Expired - delete and return null
      deleteContentFromCache(id);
      return null;
    }

    return cached.data;
  } catch (err) {
    console.warn('[Cache] Content read error:', err);
    return null;
  }
}

export async function setContentInCache<T>(id: string, data: T): Promise<void> {
  try {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(CONTENT_STORE, 'readwrite');
      const store = tx.objectStore(CONTENT_STORE);
      const request = store.put({
        id,
        data,
        timestamp: Date.now(),
      });

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.warn('[Cache] Content write error:', err);
  }
}

export async function deleteContentFromCache(id: string): Promise<void> {
  try {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(CONTENT_STORE, 'readwrite');
      const store = tx.objectStore(CONTENT_STORE);
      const request = store.delete(id);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.warn('[Cache] Content delete error:', err);
  }
}

// ============================================
// Memory Cache (for fast repeated access)
// ============================================

interface MemoryCacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
  lastAccess: number;
}

const memoryCache = new Map<string, MemoryCacheEntry<unknown>>();
const MEMORY_CACHE_MAX_SIZE = 500;

export function getFromMemory<T>(key: string): T | null {
  const entry = memoryCache.get(key) as MemoryCacheEntry<T> | undefined;
  if (!entry) return null;

  if (Date.now() - entry.timestamp > entry.ttl) {
    memoryCache.delete(key);
    return null;
  }

  // Update last access time for LRU tracking
  entry.lastAccess = Date.now();
  return entry.data;
}

export function setInMemory<T>(key: string, data: T, ttlMs: number = 60000): void {
  const now = Date.now();

  // LRU eviction: remove oldest entries if at capacity
  if (memoryCache.size >= MEMORY_CACHE_MAX_SIZE && !memoryCache.has(key)) {
    // Find and remove the least recently used entry
    let oldestKey: string | null = null;
    let oldestAccess = Infinity;

    for (const [k, entry] of memoryCache.entries()) {
      if (entry.lastAccess < oldestAccess) {
        oldestAccess = entry.lastAccess;
        oldestKey = k;
      }
    }

    if (oldestKey) {
      memoryCache.delete(oldestKey);
    }
  }

  memoryCache.set(key, {
    data,
    timestamp: now,
    ttl: ttlMs,
    lastAccess: now,
  });
}

export function invalidateMemory(keyPrefix: string): void {
  for (const key of memoryCache.keys()) {
    if (key.startsWith(keyPrefix)) {
      memoryCache.delete(key);
    }
  }
}

// ============================================
// localStorage Cache (for persistent small data)
// ============================================

const LS_PREFIX = 'sc:';

export function getFromStorage<T>(key: string): T | null {
  try {
    const item = localStorage.getItem(LS_PREFIX + key);
    if (!item) return null;

    const { data, timestamp, ttl } = JSON.parse(item);

    // Check TTL if set
    if (ttl && Date.now() - timestamp > ttl) {
      localStorage.removeItem(LS_PREFIX + key);
      return null;
    }

    return data;
  } catch {
    return null;
  }
}

export function setInStorage<T>(key: string, data: T, ttlMs?: number): void {
  try {
    localStorage.setItem(LS_PREFIX + key, JSON.stringify({
      data,
      timestamp: Date.now(),
      ttl: ttlMs,
    }));
  } catch (err) {
    console.warn('[Cache] localStorage write error:', err);
  }
}

export function removeFromStorage(key: string): void {
  localStorage.removeItem(LS_PREFIX + key);
}

// ============================================
// Cache Statistics (for debugging)
// ============================================

export async function getCacheStats(): Promise<{
  mediaCount: number;
  contentCount: number;
  memoryCount: number;
}> {
  try {
    const db = await getDB();

    const mediaCount = await new Promise<number>((resolve, reject) => {
      const tx = db.transaction(MEDIA_STORE, 'readonly');
      const store = tx.objectStore(MEDIA_STORE);
      const request = store.count();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    const contentCount = await new Promise<number>((resolve, reject) => {
      const tx = db.transaction(CONTENT_STORE, 'readonly');
      const store = tx.objectStore(CONTENT_STORE);
      const request = store.count();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    return {
      mediaCount,
      contentCount,
      memoryCount: memoryCache.size,
    };
  } catch {
    return { mediaCount: 0, contentCount: 0, memoryCount: 0 };
  }
}

// ============================================
// Clear decrypted media cache
// ============================================

/**
 * Clear all cached decrypted media (images/videos that were decrypted with a passphrase).
 * Called when user clears passphrases to ensure decrypted content doesn't persist.
 */
export async function clearDecryptedMediaCache(): Promise<void> {
  try {
    const db = await getDB();
    const keysToDelete: string[] = [];

    // Find all entries with ':decrypted' suffix
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(MEDIA_STORE, 'readonly');
      const store = tx.objectStore(MEDIA_STORE);
      const request = store.openCursor();

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
        if (cursor) {
          if (cursor.key.toString().includes(':decrypted')) {
            keysToDelete.push(cursor.key.toString());
          }
          cursor.continue();
        } else {
          resolve();
        }
      };
      request.onerror = () => reject(request.error);
    });

    // Delete all decrypted entries
    if (keysToDelete.length > 0) {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(MEDIA_STORE, 'readwrite');
        const store = tx.objectStore(MEDIA_STORE);
        let completed = 0;

        for (const key of keysToDelete) {
          const request = store.delete(key);
          request.onsuccess = () => {
            completed++;
            if (completed === keysToDelete.length) resolve();
          };
          request.onerror = () => reject(request.error);
        }
      });
      console.log(`[Cache] Cleared ${keysToDelete.length} decrypted media entries`);
    }
  } catch (err) {
    console.warn('[Cache] Failed to clear decrypted media:', err);
  }
}

// ============================================
// Clear all caches
// ============================================

export async function clearAllCaches(): Promise<void> {
  memoryCache.clear();

  // Clear localStorage
  const keys = Object.keys(localStorage).filter(k => k.startsWith(LS_PREFIX));
  keys.forEach(k => localStorage.removeItem(k));

  // Clear IndexedDB
  try {
    const db = await getDB();
    await Promise.all([
      new Promise<void>((resolve, reject) => {
        const tx = db.transaction(MEDIA_STORE, 'readwrite');
        const request = tx.objectStore(MEDIA_STORE).clear();
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      }),
      new Promise<void>((resolve, reject) => {
        const tx = db.transaction(CONTENT_STORE, 'readwrite');
        const request = tx.objectStore(CONTENT_STORE).clear();
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      }),
    ]);
  } catch (err) {
    console.warn('[Cache] Clear error:', err);
  }
}
