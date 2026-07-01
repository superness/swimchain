/**
 * StorageManager - Manages local storage with eviction
 * Per Step 13: Storage profiles and eviction priorities
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

export type StorageProfile = 'Budget1GB' | 'Standard5GB' | 'Flagship10GB';

export interface StorageProfileConfig {
  id: StorageProfile;
  maxBytes: number;
  evictionThreshold: number; // Trigger eviction at this percentage
}

export const STORAGE_PROFILES: Record<StorageProfile, StorageProfileConfig> = {
  Budget1GB: { id: 'Budget1GB', maxBytes: 1_000_000_000, evictionThreshold: 0.85 },
  Standard5GB: { id: 'Standard5GB', maxBytes: 5_000_000_000, evictionThreshold: 0.90 },
  Flagship10GB: { id: 'Flagship10GB', maxBytes: 10_000_000_000, evictionThreshold: 0.92 },
};

export enum EvictionPriority {
  OldUnfollowed = 1, // >7 days old, not in subscribed spaces
  OldFollowed = 2,   // >7 days old, in subscribed spaces
  RecentFollowed = 3, // ≤7 days old, in subscribed spaces
  Pinned = 4,        // User-pinned content
  OwnContent = 5,    // Content authored by user (never evict)
}

export interface StorageItem {
  id: string;
  category: 'own' | 'pinned' | 'subscribed' | 'other';
  bytes: number;
  createdAt: number;
  lastAccessed: number;
  priority: EvictionPriority;
}

export interface StorageStats {
  totalBytes: number;
  usedBytes: number;
  categories: {
    own: number;
    pinned: number;
    subscribed: number;
    other: number;
  };
}

const SETTINGS_KEY = '@swimchain/storage_settings';
const ITEMS_KEY = '@swimchain/storage_items';
const AGE_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * StorageManager - Singleton service for storage management
 */
class StorageManagerService {
  private profile: StorageProfile = 'Standard5GB';
  private items: Map<string, StorageItem> = new Map();
  private loaded = false;

  /**
   * Initialize storage manager
   */
  async init(): Promise<void> {
    if (this.loaded) return;

    try {
      // Load profile setting
      const settingsData = await AsyncStorage.getItem(SETTINGS_KEY);
      if (settingsData) {
        const settings = JSON.parse(settingsData);
        this.profile = settings.profile || 'Standard5GB';
      }

      // Load items index
      const itemsData = await AsyncStorage.getItem(ITEMS_KEY);
      if (itemsData) {
        const items = JSON.parse(itemsData) as StorageItem[];
        items.forEach((item) => this.items.set(item.id, item));
      }

      this.loaded = true;
    } catch (error) {
      console.error('Failed to load storage settings:', error);
      this.loaded = true;
    }
  }

  /**
   * Get current profile
   */
  getProfile(): StorageProfile {
    return this.profile;
  }

  /**
   * Get profile config
   */
  getProfileConfig(): StorageProfileConfig {
    return STORAGE_PROFILES[this.profile];
  }

  /**
   * Set storage profile
   */
  async setProfile(profile: StorageProfile): Promise<void> {
    this.profile = profile;
    await this.saveSettings();

    // Check if eviction needed with new profile
    await this.checkEviction();
  }

  /**
   * Calculate eviction priority for item
   */
  private calculatePriority(
    category: 'own' | 'pinned' | 'subscribed' | 'other',
    createdAt: number
  ): EvictionPriority {
    if (category === 'own') return EvictionPriority.OwnContent;
    if (category === 'pinned') return EvictionPriority.Pinned;

    const isOld = Date.now() - createdAt > AGE_THRESHOLD_MS;

    if (category === 'subscribed') {
      return isOld ? EvictionPriority.OldFollowed : EvictionPriority.RecentFollowed;
    }

    return isOld ? EvictionPriority.OldUnfollowed : EvictionPriority.RecentFollowed;
  }

  /**
   * Track stored item
   */
  async trackItem(
    id: string,
    category: 'own' | 'pinned' | 'subscribed' | 'other',
    bytes: number
  ): Promise<void> {
    await this.init();

    const now = Date.now();
    const item: StorageItem = {
      id,
      category,
      bytes,
      createdAt: now,
      lastAccessed: now,
      priority: this.calculatePriority(category, now),
    };

    this.items.set(id, item);
    await this.saveItems();

    // Check if eviction needed
    await this.checkEviction();
  }

  /**
   * Update item access time
   */
  async touchItem(id: string): Promise<void> {
    await this.init();

    const item = this.items.get(id);
    if (item) {
      item.lastAccessed = Date.now();
      await this.saveItems();
    }
  }

  /**
   * Remove tracked item
   */
  async removeItem(id: string): Promise<void> {
    await this.init();
    this.items.delete(id);
    await this.saveItems();
  }

  /**
   * Get storage statistics
   */
  async getStats(): Promise<StorageStats> {
    await this.init();

    const config = this.getProfileConfig();
    const categories = { own: 0, pinned: 0, subscribed: 0, other: 0 };
    let usedBytes = 0;

    this.items.forEach((item) => {
      usedBytes += item.bytes;
      categories[item.category] += item.bytes;
    });

    return {
      totalBytes: config.maxBytes,
      usedBytes,
      categories,
    };
  }

  /**
   * Check if eviction is needed and perform it
   */
  async checkEviction(): Promise<void> {
    await this.init();

    const config = this.getProfileConfig();
    const stats = await this.getStats();
    const usagePercent = stats.usedBytes / config.maxBytes;

    if (usagePercent < config.evictionThreshold) {
      return; // No eviction needed
    }

    // Target: reduce to 75% of max
    const targetBytes = config.maxBytes * 0.75;
    const bytesToEvict = stats.usedBytes - targetBytes;

    if (bytesToEvict <= 0) return;

    // Get evictable items (not own content)
    const evictable = Array.from(this.items.values())
      .filter((item) => item.priority !== EvictionPriority.OwnContent)
      .sort((a, b) => {
        // Sort by priority (lower = evict first), then by last accessed
        if (a.priority !== b.priority) {
          return a.priority - b.priority;
        }
        return a.lastAccessed - b.lastAccessed;
      });

    let evictedBytes = 0;
    const toEvict: string[] = [];

    for (const item of evictable) {
      if (evictedBytes >= bytesToEvict) break;
      toEvict.push(item.id);
      evictedBytes += item.bytes;
    }

    // Remove evicted items from both tracking and AsyncStorage
    for (const id of toEvict) {
      this.items.delete(id);
      // Delete the actual content data from AsyncStorage
      try {
        await AsyncStorage.removeItem(`@swimchain/content/${id}`);
      } catch (deleteError) {
        console.error(`Failed to delete content ${id}:`, deleteError);
      }
    }

    await this.saveItems();

    console.log(`Evicted ${toEvict.length} items, freed ${evictedBytes} bytes`);
  }

  /**
   * Clear category cache
   */
  async clearCategory(category: 'pinned' | 'subscribed' | 'other'): Promise<number> {
    await this.init();

    let freedBytes = 0;
    const toRemove: string[] = [];

    this.items.forEach((item, id) => {
      if (item.category === category) {
        toRemove.push(id);
        freedBytes += item.bytes;
      }
    });

    for (const id of toRemove) {
      this.items.delete(id);
    }

    await this.saveItems();
    return freedBytes;
  }

  /**
   * Save settings to storage
   */
  private async saveSettings(): Promise<void> {
    try {
      await AsyncStorage.setItem(
        SETTINGS_KEY,
        JSON.stringify({ profile: this.profile })
      );
    } catch (error) {
      console.error('Failed to save storage settings:', error);
    }
  }

  /**
   * Save items index to storage
   */
  private async saveItems(): Promise<void> {
    try {
      const items = Array.from(this.items.values());
      await AsyncStorage.setItem(ITEMS_KEY, JSON.stringify(items));
    } catch (error) {
      console.error('Failed to save storage items:', error);
    }
  }
}

export const storageManager = new StorageManagerService();

export default storageManager;
