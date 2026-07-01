/**
 * NetworkMonitor - Monitors network connectivity and type
 * Per Step 11: WiFi preference for sync
 */

import NetInfo, { NetInfoState, NetInfoStateType } from '@react-native-community/netinfo';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type SyncMode = 'full' | 'headers' | 'paused';

export interface NetworkState {
  isConnected: boolean;
  isWifi: boolean;
  isCellular: boolean;
  syncMode: SyncMode;
}

export interface SyncSettings {
  wifiOnlyFullSync: boolean;
  cellularBudgetMb: 50 | 100 | 200;
  backgroundSyncEnabled: boolean;
}

const SETTINGS_KEY = '@swimchain/sync_settings';
const CELLULAR_USAGE_KEY = '@swimchain/cellular_usage';

const DEFAULT_SETTINGS: SyncSettings = {
  wifiOnlyFullSync: true,
  cellularBudgetMb: 100,
  backgroundSyncEnabled: true,
};

/**
 * NetworkMonitor - Singleton service for network state
 */
class NetworkMonitorService {
  private listeners: Set<(state: NetworkState) => void> = new Set();
  private currentState: NetworkState = {
    isConnected: true,
    isWifi: true,
    isCellular: false,
    syncMode: 'full',
  };
  private settings: SyncSettings = DEFAULT_SETTINGS;
  private cellularUsageBytes = 0;
  private cellularUsageDate: string | null = null;
  private unsubscribe: (() => void) | null = null;

  /**
   * Initialize network monitoring
   */
  async init(): Promise<void> {
    // Load settings
    await this.loadSettings();
    await this.loadCellularUsage();

    // Subscribe to network changes
    this.unsubscribe = NetInfo.addEventListener(this.handleNetworkChange);

    // Get initial state
    const initialState = await NetInfo.fetch();
    this.handleNetworkChange(initialState);
  }

  /**
   * Load sync settings from storage
   */
  private async loadSettings(): Promise<void> {
    try {
      const data = await AsyncStorage.getItem(SETTINGS_KEY);
      if (data) {
        this.settings = { ...DEFAULT_SETTINGS, ...JSON.parse(data) };
      }
    } catch (error) {
      console.error('Failed to load sync settings:', error);
    }
  }

  /**
   * Save sync settings
   */
  async saveSettings(settings: Partial<SyncSettings>): Promise<void> {
    this.settings = { ...this.settings, ...settings };
    try {
      await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings));
      // Recalculate sync mode
      this.updateSyncMode();
    } catch (error) {
      console.error('Failed to save sync settings:', error);
    }
  }

  /**
   * Get current settings
   */
  getSettings(): SyncSettings {
    return { ...this.settings };
  }

  /**
   * Load cellular usage tracking
   */
  private async loadCellularUsage(): Promise<void> {
    try {
      const data = await AsyncStorage.getItem(CELLULAR_USAGE_KEY);
      if (data) {
        const parsed = JSON.parse(data);
        const today = new Date().toISOString().split('T')[0];

        if (parsed.date === today) {
          this.cellularUsageBytes = parsed.bytes;
          this.cellularUsageDate = today;
        } else {
          // Reset for new day
          this.cellularUsageBytes = 0;
          this.cellularUsageDate = today;
        }
      }
    } catch (error) {
      console.error('Failed to load cellular usage:', error);
    }
  }

  /**
   * Track cellular data usage
   */
  async trackCellularUsage(bytes: number): Promise<void> {
    const today = new Date().toISOString().split('T')[0];

    if (this.cellularUsageDate !== today) {
      this.cellularUsageBytes = 0;
      this.cellularUsageDate = today;
    }

    this.cellularUsageBytes += bytes;

    try {
      await AsyncStorage.setItem(
        CELLULAR_USAGE_KEY,
        JSON.stringify({
          date: today,
          bytes: this.cellularUsageBytes,
        })
      );
    } catch (error) {
      console.error('Failed to save cellular usage:', error);
    }

    // Check if over budget
    this.updateSyncMode();
  }

  /**
   * Get cellular usage for today
   */
  getCellularUsage(): { usedMb: number; budgetMb: number; percentage: number } {
    const usedMb = this.cellularUsageBytes / (1024 * 1024);
    const budgetMb = this.settings.cellularBudgetMb;
    return {
      usedMb,
      budgetMb,
      percentage: (usedMb / budgetMb) * 100,
    };
  }

  /**
   * Handle network state change
   */
  private handleNetworkChange = (state: NetInfoState): void => {
    const isConnected = state.isConnected ?? false;
    const isWifi = state.type === NetInfoStateType.wifi;
    const isCellular = state.type === NetInfoStateType.cellular;

    this.currentState = {
      isConnected,
      isWifi,
      isCellular,
      syncMode: this.calculateSyncMode(isConnected, isWifi),
    };

    this.notifyListeners();
  };

  /**
   * Calculate sync mode based on network and settings
   */
  private calculateSyncMode(isConnected: boolean, isWifi: boolean): SyncMode {
    if (!isConnected) {
      return 'paused';
    }

    if (isWifi) {
      return 'full';
    }

    // On cellular
    if (this.settings.wifiOnlyFullSync) {
      // Check cellular budget
      const usage = this.getCellularUsage();
      if (usage.percentage >= 100) {
        return 'paused';
      }
      return 'headers';
    }

    return 'full';
  }

  /**
   * Update sync mode (after settings change)
   */
  private updateSyncMode(): void {
    this.currentState = {
      ...this.currentState,
      syncMode: this.calculateSyncMode(
        this.currentState.isConnected,
        this.currentState.isWifi
      ),
    };
    this.notifyListeners();
  }

  /**
   * Get current network state
   */
  getState(): NetworkState {
    return { ...this.currentState };
  }

  /**
   * Subscribe to network changes
   */
  subscribe(listener: (state: NetworkState) => void): () => void {
    this.listeners.add(listener);
    // Immediately notify with current state
    listener(this.currentState);
    return () => this.listeners.delete(listener);
  }

  /**
   * Notify all listeners
   */
  private notifyListeners(): void {
    this.listeners.forEach((listener) => listener(this.currentState));
  }

  /**
   * Cleanup
   */
  destroy(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    this.listeners.clear();
  }
}

export const networkMonitor = new NetworkMonitorService();

export default networkMonitor;
