/**
 * MobileSwimchainProvider - React Native specific provider
 * Per Step 17: RN compatibility layer for @swimchain/react
 */

import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { useMobilePow } from '../hooks/useMobilePow';
import { networkMonitor, NetworkState } from '../services/NetworkMonitor';
import { offlineQueue } from '../services/OfflineQueue';
import { storageManager, StorageProfile, StorageStats } from '../services/StorageManager';
import { challengeManager } from '../services/ChallengeManager';

// Context value type
interface MobileSwimchainContextValue {
  // Identity
  address: string | null;
  isIdentityLoaded: boolean;

  // Network
  networkState: NetworkState;

  // Storage
  storageProfile: StorageProfile;
  storageStats: StorageStats | null;

  // Queue
  queueCount: number;

  // PoW
  pow: ReturnType<typeof useMobilePow>;

  // Actions
  setStorageProfile: (profile: StorageProfile) => Promise<void>;
}

const MobileSwimchainContext = createContext<MobileSwimchainContextValue | null>(null);

const IDENTITY_KEY = '@swimchain/identity';

interface Props {
  children: ReactNode;
}

export function MobileSwimchainProvider({ children }: Props) {
  // Identity state
  const [address, setAddress] = useState<string | null>(null);
  const [isIdentityLoaded, setIsIdentityLoaded] = useState(false);

  // Network state
  const [networkState, setNetworkState] = useState<NetworkState>({
    isConnected: true,
    isWifi: true,
    isCellular: false,
    syncMode: 'full',
  });

  // Storage state
  const [storageProfile, setStorageProfileState] = useState<StorageProfile>('Standard5GB');
  const [storageStats, setStorageStats] = useState<StorageStats | null>(null);

  // Queue state
  const [queueCount, setQueueCount] = useState(0);

  // PoW hook
  const pow = useMobilePow();

  // Initialize services
  useEffect(() => {
    const init = async () => {
      // Load identity
      try {
        const identityData = await AsyncStorage.getItem(IDENTITY_KEY);
        if (identityData) {
          const identity = JSON.parse(identityData);
          setAddress(identity.address);
        }
      } catch (error) {
        console.error('Failed to load identity:', error);
      }
      setIsIdentityLoaded(true);

      // Initialize network monitor
      await networkMonitor.init();

      // Initialize storage manager
      await storageManager.init();
      setStorageProfileState(storageManager.getProfile());
      const stats = await storageManager.getStats();
      setStorageStats(stats);

      // Load queue count
      const count = await offlineQueue.getPendingCount();
      setQueueCount(count);
    };

    init();

    // Subscribe to network changes
    const unsubNetwork = networkMonitor.subscribe(setNetworkState);

    // Subscribe to queue changes
    const unsubQueue = offlineQueue.subscribe(async () => {
      const count = await offlineQueue.getPendingCount();
      setQueueCount(count);
    });

    return () => {
      unsubNetwork();
      unsubQueue();
    };
  }, []);

  // Set storage profile
  const setStorageProfile = async (profile: StorageProfile) => {
    await storageManager.setProfile(profile);
    setStorageProfileState(profile);
    const stats = await storageManager.getStats();
    setStorageStats(stats);
  };

  const value: MobileSwimchainContextValue = {
    address,
    isIdentityLoaded,
    networkState,
    storageProfile,
    storageStats,
    queueCount,
    pow,
    setStorageProfile,
  };

  return (
    <MobileSwimchainContext.Provider value={value}>
      {children}
    </MobileSwimchainContext.Provider>
  );
}

/**
 * Hook to access mobile Swimchain context
 */
export function useMobileSwimchain(): MobileSwimchainContextValue {
  const context = useContext(MobileSwimchainContext);
  if (!context) {
    throw new Error('useMobileSwimchain must be used within MobileSwimchainProvider');
  }
  return context;
}

export default MobileSwimchainProvider;
