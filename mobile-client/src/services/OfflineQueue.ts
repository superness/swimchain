/**
 * OfflineQueue - Manages queued actions for offline operation
 * Per Step 10: Persist queue to AsyncStorage
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { v4 as uuidv4 } from 'uuid';

export type QueuedActionType = 'post' | 'reply' | 'engage';
export type QueuedActionStatus = 'pending' | 'processing' | 'failed';

export interface QueuedAction {
  id: string;
  type: QueuedActionType;
  spaceId: string;
  content?: { title?: string; body: string };
  replyToId?: string;
  engageSeconds?: number;
  status: QueuedActionStatus;
  retryCount: number;
  createdAt: number;
  lastAttemptAt?: number;
  error?: string;
}

const STORAGE_KEY = '@swimchain/offline_queue';
const MAX_RETRIES = 3;
const MAX_QUEUE_SIZE = 100; // Cap queue to prevent unbounded growth
const SAVE_DEBOUNCE_MS = 300; // Debounce writes to reduce I/O

/**
 * OfflineQueue - Singleton service for managing offline actions
 */
class OfflineQueueService {
  private queue: QueuedAction[] = [];
  private listeners: Set<() => void> = new Set();
  private loadPromise: Promise<void> | null = null; // For atomic initialization
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingSave = false;

  /**
   * Load queue from storage (atomic initialization with promise caching)
   */
  async load(): Promise<void> {
    // Return existing promise if load is in progress (prevents race condition)
    if (this.loadPromise) {
      return this.loadPromise;
    }

    this.loadPromise = this.doLoad();
    return this.loadPromise;
  }

  private async doLoad(): Promise<void> {
    try {
      const data = await AsyncStorage.getItem(STORAGE_KEY);
      if (data) {
        this.queue = JSON.parse(data);
      }
    } catch (error) {
      console.error('Failed to load offline queue:', error);
      this.queue = [];
    }
  }

  /**
   * Save queue to storage (debounced to reduce I/O)
   */
  private scheduleSave(): void {
    this.pendingSave = true;

    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
    }

    this.saveTimer = setTimeout(() => {
      this.doSave();
    }, SAVE_DEBOUNCE_MS);
  }

  private async doSave(): Promise<void> {
    if (!this.pendingSave) return;
    this.pendingSave = false;

    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(this.queue));
    } catch (error) {
      console.error('Failed to save offline queue:', error);
    }
  }

  /**
   * Force immediate save (for critical operations)
   */
  private async saveImmediate(): Promise<void> {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    this.pendingSave = true;
    await this.doSave();
  }

  /**
   * Add action to queue
   */
  async add(action: Omit<QueuedAction, 'id' | 'status' | 'retryCount' | 'createdAt'>): Promise<string> {
    await this.load();

    // Enforce queue size cap - remove oldest failed/completed items first
    if (this.queue.length >= MAX_QUEUE_SIZE) {
      const oldestFailed = this.queue.findIndex((a) => a.status === 'failed');
      if (oldestFailed !== -1) {
        this.queue.splice(oldestFailed, 1);
      } else {
        // Remove oldest item if no failed items
        this.queue.shift();
      }
      console.warn(`Offline queue at capacity (${MAX_QUEUE_SIZE}), removed oldest item`);
    }

    const id = uuidv4();
    const queuedAction: QueuedAction = {
      ...action,
      id,
      status: 'pending',
      retryCount: 0,
      createdAt: Date.now(),
    };

    this.queue.push(queuedAction);
    this.scheduleSave(); // Use debounced save
    this.notifyListeners();

    return id;
  }

  /**
   * Get all queued actions
   */
  async getAll(): Promise<QueuedAction[]> {
    await this.load();
    return [...this.queue];
  }

  /**
   * Get pending actions
   */
  async getPending(): Promise<QueuedAction[]> {
    await this.load();
    return this.queue.filter((a) => a.status === 'pending');
  }

  /**
   * Get oldest pending action
   */
  async getNext(): Promise<QueuedAction | null> {
    await this.load();
    const pending = this.queue
      .filter((a) => a.status === 'pending')
      .sort((a, b) => a.createdAt - b.createdAt);
    return pending[0] || null;
  }

  /**
   * Update action status
   */
  async updateStatus(
    id: string,
    status: QueuedActionStatus,
    error?: string
  ): Promise<void> {
    await this.load();

    const index = this.queue.findIndex((a) => a.id === id);
    if (index === -1) return;

    this.queue[index] = {
      ...this.queue[index],
      status,
      lastAttemptAt: Date.now(),
      error,
      retryCount:
        status === 'failed'
          ? this.queue[index].retryCount + 1
          : this.queue[index].retryCount,
    };

    this.scheduleSave(); // Use debounced save
    this.notifyListeners();
  }

  /**
   * Remove action from queue
   */
  async remove(id: string): Promise<void> {
    await this.load();
    this.queue = this.queue.filter((a) => a.id !== id);
    this.scheduleSave(); // Use debounced save
    this.notifyListeners();
  }

  /**
   * Retry failed action
   */
  async retry(id: string): Promise<void> {
    await this.load();

    const index = this.queue.findIndex((a) => a.id === id);
    if (index === -1) return;

    if (this.queue[index].retryCount >= MAX_RETRIES) {
      // Too many retries, keep as failed
      return;
    }

    this.queue[index] = {
      ...this.queue[index],
      status: 'pending',
    };

    this.scheduleSave(); // Use debounced save
    this.notifyListeners();
  }

  /**
   * Get pending count
   */
  async getPendingCount(): Promise<number> {
    await this.load();
    return this.queue.filter((a) => a.status === 'pending').length;
  }

  /**
   * Subscribe to queue changes
   */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Notify listeners of changes
   */
  private notifyListeners(): void {
    this.listeners.forEach((listener) => listener());
  }

  /**
   * Clear all actions
   */
  async clear(): Promise<void> {
    this.queue = [];
    await this.saveImmediate(); // Use immediate save for clear
    this.notifyListeners();
  }

  /**
   * Flush pending saves (call before app backgrounding)
   */
  async flush(): Promise<void> {
    await this.saveImmediate();
  }
}

export const offlineQueue = new OfflineQueueService();

export default offlineQueue;
