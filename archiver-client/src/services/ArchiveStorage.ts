/**
 * Archive Storage Service
 *
 * Manages local storage of archived content using IndexedDB.
 * Implements storage quota management and search functionality.
 */

import type { ArchiveEntry, SpaceId, ContentHash } from '../types';
import {
  DB_NAME,
  DB_VERSION,
  DB_STORES,
  DEFAULT_STORAGE_BUDGET_GB,
  STORAGE_KEYS,
} from '../types/constants';

/**
 * Storage statistics.
 */
export interface StorageStats {
  /** Total bytes used */
  bytesUsed: number;
  /** Total entries stored */
  entryCount: number;
  /** Budget in bytes */
  budgetBytes: number;
  /** Percentage of budget used */
  usagePercent: number;
}

/**
 * Service for managing archived content in IndexedDB.
 */
export class ArchiveStorage {
  private db: IDBDatabase | null = null;
  private storageBudgetGB: number = DEFAULT_STORAGE_BUDGET_GB;

  /**
   * Initialize the IndexedDB database.
   */
  async init(): Promise<void> {
    // Load storage budget from config
    this.loadStorageBudget();

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        reject(new Error('Failed to open IndexedDB'));
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Create archives store
        if (!db.objectStoreNames.contains(DB_STORES.ARCHIVES)) {
          const store = db.createObjectStore(DB_STORES.ARCHIVES, {
            keyPath: 'postHash',
          });
          store.createIndex('spaceId', 'spaceId', { unique: false });
          store.createIndex('archivedAt', 'archivedAt', { unique: false });
          store.createIndex('title', 'title', { unique: false });
          store.createIndex('author', 'author', { unique: false });
        }

        // Create metadata store
        if (!db.objectStoreNames.contains(DB_STORES.METADATA)) {
          db.createObjectStore(DB_STORES.METADATA, { keyPath: 'key' });
        }
      };

      request.onsuccess = (event) => {
        this.db = (event.target as IDBOpenDBRequest).result;
        console.log('[ArchiveStorage] Database initialized');
        resolve();
      };
    });
  }

  /**
   * Check if database is initialized.
   */
  isInitialized(): boolean {
    return this.db !== null;
  }

  /**
   * Archive content to IndexedDB.
   * Enforces storage budget.
   *
   * @param content - Content to archive
   * @throws Error if storage budget would be exceeded
   */
  async archiveContent(content: ArchiveEntry): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    // Calculate size of content
    const sizeBytes = new Blob([JSON.stringify(content)]).size;

    // Check quota
    const currentUsage = await this.getStorageUsed();
    const budgetBytes = this.storageBudgetGB * 1024 * 1024 * 1024;

    if (currentUsage + sizeBytes > budgetBytes) {
      throw new Error(
        `Storage budget exceeded. Current: ${this.formatBytes(currentUsage)}, ` +
          `Budget: ${this.formatBytes(budgetBytes)}, ` +
          `Requested: ${this.formatBytes(sizeBytes)}`
      );
    }

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(
        [DB_STORES.ARCHIVES, DB_STORES.METADATA],
        'readwrite'
      );
      const archivesStore = tx.objectStore(DB_STORES.ARCHIVES);
      const metadataStore = tx.objectStore(DB_STORES.METADATA);

      // Store the content
      archivesStore.put(content);

      // Update storage metadata
      metadataStore.put({
        key: 'storage_bytes',
        value: currentUsage + sizeBytes,
      });

      // Update entry count
      const countRequest = archivesStore.count();
      countRequest.onsuccess = () => {
        metadataStore.put({
          key: 'entry_count',
          value: countRequest.result,
        });
      };

      tx.oncomplete = () => {
        console.log(`[ArchiveStorage] Archived: ${content.postHash}`);
        resolve();
      };

      tx.onerror = () => {
        reject(new Error('Failed to archive content'));
      };
    });
  }

  /**
   * Get a specific archived entry by hash.
   *
   * @param postHash - Hash of the post to retrieve
   * @returns The archived entry or null if not found
   */
  async getEntry(postHash: ContentHash): Promise<ArchiveEntry | null> {
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(DB_STORES.ARCHIVES, 'readonly');
      const store = tx.objectStore(DB_STORES.ARCHIVES);
      const request = store.get(postHash);

      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () => reject(new Error('Failed to retrieve entry'));
    });
  }

  /**
   * Get all archived content, optionally filtered by space.
   *
   * @param spaceId - Optional space ID to filter by
   * @returns Array of archived entries
   */
  async getArchivedContent(spaceId?: SpaceId): Promise<ArchiveEntry[]> {
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(DB_STORES.ARCHIVES, 'readonly');
      const store = tx.objectStore(DB_STORES.ARCHIVES);

      let request: IDBRequest<ArchiveEntry[]>;

      if (spaceId) {
        const index = store.index('spaceId');
        request = index.getAll(spaceId);
      } else {
        request = store.getAll();
      }

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(new Error('Failed to retrieve archives'));
    });
  }

  /**
   * Search archived content by title and body.
   *
   * @param query - Search query
   * @returns Matching entries
   */
  async searchArchive(query: string): Promise<ArchiveEntry[]> {
    const all = await this.getArchivedContent();
    const lowerQuery = query.toLowerCase().trim();

    if (!lowerQuery) return all;

    return all.filter(
      (entry) =>
        entry.title.toLowerCase().includes(lowerQuery) ||
        entry.body.toLowerCase().includes(lowerQuery)
    );
  }

  /**
   * Delete an archived entry.
   *
   * @param postHash - Hash of the entry to delete
   */
  async deleteEntry(postHash: ContentHash): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    // Get the entry size first
    const entry = await this.getEntry(postHash);
    if (!entry) return;

    const entrySize = new Blob([JSON.stringify(entry)]).size;

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(
        [DB_STORES.ARCHIVES, DB_STORES.METADATA],
        'readwrite'
      );
      const archivesStore = tx.objectStore(DB_STORES.ARCHIVES);
      const metadataStore = tx.objectStore(DB_STORES.METADATA);

      archivesStore.delete(postHash);

      // Update storage bytes
      this.getStorageUsed().then((currentUsage) => {
        metadataStore.put({
          key: 'storage_bytes',
          value: Math.max(0, currentUsage - entrySize),
        });
      });

      tx.oncomplete = () => {
        console.log(`[ArchiveStorage] Deleted: ${postHash}`);
        resolve();
      };

      tx.onerror = () => reject(new Error('Failed to delete entry'));
    });
  }

  /**
   * Clear all archived content.
   */
  async clearAll(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(
        [DB_STORES.ARCHIVES, DB_STORES.METADATA],
        'readwrite'
      );
      const archivesStore = tx.objectStore(DB_STORES.ARCHIVES);
      const metadataStore = tx.objectStore(DB_STORES.METADATA);

      archivesStore.clear();
      metadataStore.put({ key: 'storage_bytes', value: 0 });
      metadataStore.put({ key: 'entry_count', value: 0 });

      tx.oncomplete = () => {
        console.log('[ArchiveStorage] All archives cleared');
        resolve();
      };

      tx.onerror = () => reject(new Error('Failed to clear archives'));
    });
  }

  /**
   * Get storage usage in bytes.
   */
  async getStorageUsed(): Promise<number> {
    if (!this.db) return 0;

    return new Promise((resolve) => {
      const tx = this.db!.transaction(DB_STORES.METADATA, 'readonly');
      const store = tx.objectStore(DB_STORES.METADATA);
      const request = store.get('storage_bytes');

      request.onsuccess = () => resolve(request.result?.value ?? 0);
      request.onerror = () => resolve(0);
    });
  }

  /**
   * Get entry count.
   */
  async getEntryCount(): Promise<number> {
    if (!this.db) return 0;

    return new Promise((resolve) => {
      const tx = this.db!.transaction(DB_STORES.ARCHIVES, 'readonly');
      const store = tx.objectStore(DB_STORES.ARCHIVES);
      const request = store.count();

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(0);
    });
  }

  /**
   * Get storage statistics.
   */
  async getStats(): Promise<StorageStats> {
    const bytesUsed = await this.getStorageUsed();
    const entryCount = await this.getEntryCount();
    const budgetBytes = this.storageBudgetGB * 1024 * 1024 * 1024;
    const usagePercent = budgetBytes > 0 ? (bytesUsed / budgetBytes) * 100 : 0;

    return {
      bytesUsed,
      entryCount,
      budgetBytes,
      usagePercent,
    };
  }

  /**
   * Set storage budget in GB.
   */
  setStorageBudget(gb: number): void {
    this.storageBudgetGB = Math.max(1, Math.min(1000, gb));
    this.saveStorageBudget();
  }

  /**
   * Get storage budget in GB.
   */
  getStorageBudget(): number {
    return this.storageBudgetGB;
  }

  /**
   * Format bytes to human-readable string.
   */
  formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';

    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Load storage budget from config.
   */
  private loadStorageBudget(): void {
    try {
      const config = localStorage.getItem(STORAGE_KEYS.CONFIG);
      if (config) {
        const parsed = JSON.parse(config);
        if (typeof parsed.storageBudgetGB === 'number') {
          this.storageBudgetGB = parsed.storageBudgetGB;
        }
      }
    } catch {
      // Use default
    }
  }

  /**
   * Save storage budget to config.
   */
  private saveStorageBudget(): void {
    try {
      const existingConfig = localStorage.getItem(STORAGE_KEYS.CONFIG);
      const config = existingConfig ? JSON.parse(existingConfig) : {};
      config.storageBudgetGB = this.storageBudgetGB;
      localStorage.setItem(STORAGE_KEYS.CONFIG, JSON.stringify(config));
    } catch (error) {
      console.error('[ArchiveStorage] Error saving config:', error);
    }
  }

  /**
   * Close the database connection.
   */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}

/**
 * Singleton instance for shared use.
 * Uses promise-based initialization to prevent race conditions.
 */
let _instance: ArchiveStorage | null = null;
let _initPromise: Promise<ArchiveStorage> | null = null;

export async function getArchiveStorage(): Promise<ArchiveStorage> {
  // If already initialized, return immediately
  if (_instance?.isInitialized()) {
    return _instance;
  }

  // If initialization is in progress, wait for it
  if (_initPromise) {
    return _initPromise;
  }

  // Start initialization with a promise lock to prevent race conditions
  _initPromise = (async () => {
    _instance = new ArchiveStorage();
    await _instance.init();
    return _instance;
  })();

  return _initPromise;
}
