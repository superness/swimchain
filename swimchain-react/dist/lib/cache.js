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
// ============================================
// IndexedDB Setup
// ============================================
const DB_NAME = 'swimchain-cache';
const DB_VERSION = 1;
const MEDIA_STORE = 'media';
const CONTENT_STORE = 'content';
let dbPromise = null;
function getDB() {
    if (dbPromise)
        return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
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
export async function getMediaFromCache(hash) {
    try {
        const db = await getDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(MEDIA_STORE, 'readonly');
            const store = tx.objectStore(MEDIA_STORE);
            const request = store.get(hash);
            request.onsuccess = () => resolve(request.result || null);
            request.onerror = () => reject(request.error);
        });
    }
    catch (err) {
        console.warn('[Cache] IndexedDB error:', err);
        return null;
    }
}
export async function setMediaInCache(hash, data, mediaType) {
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
    }
    catch (err) {
        console.warn('[Cache] IndexedDB write error:', err);
    }
}
// ============================================
// Content Cache (IndexedDB with TTL)
// ============================================
const CONTENT_TTL_MS = 5 * 60 * 1000; // 5 minutes
export async function getContentFromCache(id) {
    try {
        const db = await getDB();
        const cached = await new Promise((resolve, reject) => {
            const tx = db.transaction(CONTENT_STORE, 'readonly');
            const store = tx.objectStore(CONTENT_STORE);
            const request = store.get(id);
            request.onsuccess = () => resolve(request.result || null);
            request.onerror = () => reject(request.error);
        });
        if (!cached)
            return null;
        // Check TTL
        if (Date.now() - cached.timestamp > CONTENT_TTL_MS) {
            // Expired - delete and return null
            deleteContentFromCache(id);
            return null;
        }
        return cached.data;
    }
    catch (err) {
        console.warn('[Cache] Content read error:', err);
        return null;
    }
}
export async function setContentInCache(id, data) {
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
    }
    catch (err) {
        console.warn('[Cache] Content write error:', err);
    }
}
export async function deleteContentFromCache(id) {
    try {
        const db = await getDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(CONTENT_STORE, 'readwrite');
            const store = tx.objectStore(CONTENT_STORE);
            const request = store.delete(id);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }
    catch (err) {
        console.warn('[Cache] Content delete error:', err);
    }
}
const memoryCache = new Map();
export function getFromMemory(key) {
    const entry = memoryCache.get(key);
    if (!entry)
        return null;
    if (Date.now() - entry.timestamp > entry.ttl) {
        memoryCache.delete(key);
        return null;
    }
    return entry.data;
}
export function setInMemory(key, data, ttlMs = 60000) {
    memoryCache.set(key, {
        data,
        timestamp: Date.now(),
        ttl: ttlMs,
    });
}
export function invalidateMemory(keyPrefix) {
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
export function getFromStorage(key) {
    try {
        const item = localStorage.getItem(LS_PREFIX + key);
        if (!item)
            return null;
        const { data, timestamp, ttl } = JSON.parse(item);
        // Check TTL if set
        if (ttl && Date.now() - timestamp > ttl) {
            localStorage.removeItem(LS_PREFIX + key);
            return null;
        }
        return data;
    }
    catch {
        return null;
    }
}
export function setInStorage(key, data, ttlMs) {
    try {
        localStorage.setItem(LS_PREFIX + key, JSON.stringify({
            data,
            timestamp: Date.now(),
            ttl: ttlMs,
        }));
    }
    catch (err) {
        console.warn('[Cache] localStorage write error:', err);
    }
}
export function removeFromStorage(key) {
    localStorage.removeItem(LS_PREFIX + key);
}
// ============================================
// Cache Statistics (for debugging)
// ============================================
export async function getCacheStats() {
    try {
        const db = await getDB();
        const mediaCount = await new Promise((resolve, reject) => {
            const tx = db.transaction(MEDIA_STORE, 'readonly');
            const store = tx.objectStore(MEDIA_STORE);
            const request = store.count();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
        const contentCount = await new Promise((resolve, reject) => {
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
    }
    catch {
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
export async function clearDecryptedMediaCache() {
    try {
        const db = await getDB();
        const keysToDelete = [];
        // Find all entries with ':decrypted' suffix
        await new Promise((resolve, reject) => {
            const tx = db.transaction(MEDIA_STORE, 'readonly');
            const store = tx.objectStore(MEDIA_STORE);
            const request = store.openCursor();
            request.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor) {
                    if (cursor.key.toString().includes(':decrypted')) {
                        keysToDelete.push(cursor.key.toString());
                    }
                    cursor.continue();
                }
                else {
                    resolve();
                }
            };
            request.onerror = () => reject(request.error);
        });
        // Delete all decrypted entries
        if (keysToDelete.length > 0) {
            await new Promise((resolve, reject) => {
                const tx = db.transaction(MEDIA_STORE, 'readwrite');
                const store = tx.objectStore(MEDIA_STORE);
                let completed = 0;
                for (const key of keysToDelete) {
                    const request = store.delete(key);
                    request.onsuccess = () => {
                        completed++;
                        if (completed === keysToDelete.length)
                            resolve();
                    };
                    request.onerror = () => reject(request.error);
                }
            });
            console.log(`[Cache] Cleared ${keysToDelete.length} decrypted media entries`);
        }
    }
    catch (err) {
        console.warn('[Cache] Failed to clear decrypted media:', err);
    }
}
// ============================================
// Clear all caches
// ============================================
export async function clearAllCaches() {
    memoryCache.clear();
    // Clear localStorage
    const keys = Object.keys(localStorage).filter(k => k.startsWith(LS_PREFIX));
    keys.forEach(k => localStorage.removeItem(k));
    // Clear IndexedDB
    try {
        const db = await getDB();
        await Promise.all([
            new Promise((resolve, reject) => {
                const tx = db.transaction(MEDIA_STORE, 'readwrite');
                const request = tx.objectStore(MEDIA_STORE).clear();
                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            }),
            new Promise((resolve, reject) => {
                const tx = db.transaction(CONTENT_STORE, 'readwrite');
                const request = tx.objectStore(CONTENT_STORE).clear();
                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            }),
        ]);
    }
    catch (err) {
        console.warn('[Cache] Clear error:', err);
    }
}
//# sourceMappingURL=cache.js.map