/**
 * React hook for metrics collection
 */

import { useState, useEffect, useCallback } from 'react';
import { getMetricsCollector } from '../services/MetricsCollector';
import { useRpc } from './useRpc';
import type {
  NetworkHealth,
  SpaceMetrics,
  HealthHistoryPoint,
  Alert,
  RecentPost,
  AnalyticsConfig,
} from '../types';

interface UseMetricsResult {
  // Data
  networkHealth: NetworkHealth | null;
  healthHistory: HealthHistoryPoint[];
  spaceMetrics: SpaceMetrics[];
  recentPosts: RecentPost[];
  alerts: Alert[];
  unacknowledgedAlerts: Alert[];

  // State
  isCollecting: boolean;
  config: AnalyticsConfig;

  // Actions
  start: () => void;
  stop: () => void;
  refresh: () => Promise<void>;
  updateConfig: (updates: Partial<AnalyticsConfig>) => void;
  acknowledgeAlert: (alertId: string) => void;
  clearAcknowledgedAlerts: () => void;
  getSpaceMetrics: (spaceId: string) => SpaceMetrics | undefined;
}

export function useMetrics(): UseMetricsResult {
  const collector = getMetricsCollector();
  const { rpc, connected } = useRpc();

  const [networkHealth, setNetworkHealth] = useState<NetworkHealth | null>(
    collector.getNetworkHealth()
  );
  const [healthHistory, setHealthHistory] = useState<HealthHistoryPoint[]>(
    collector.getHealthHistory()
  );
  const [spaceMetrics, setSpaceMetrics] = useState<SpaceMetrics[]>(
    collector.getAllSpaceMetrics()
  );
  const [recentPosts, setRecentPosts] = useState<RecentPost[]>(
    collector.getRecentPosts()
  );
  const [alerts, setAlerts] = useState<Alert[]>(collector.getAlerts());
  const [isCollecting, setIsCollecting] = useState(collector.isRunning());
  const [config, setConfig] = useState<AnalyticsConfig>(collector.getConfig());

  // Inject RPC client into collector when connected
  useEffect(() => {
    if (connected && rpc) {
      collector.setRpcClient(rpc);
    } else {
      collector.setRpcClient(null);
    }
  }, [rpc, connected]);

  // Set up callbacks for real-time updates
  useEffect(() => {
    collector.setCallbacks({
      onNetworkHealth: (health) => {
        setNetworkHealth(health);
        setHealthHistory(collector.getHealthHistory());
      },
      onSpaceMetrics: () => {
        setSpaceMetrics(collector.getAllSpaceMetrics());
        setRecentPosts(collector.getRecentPosts());
      },
      onAlert: () => {
        setAlerts(collector.getAlerts());
      },
      onError: (error) => {
        console.error('Metrics collection error:', error);
      },
    });

    // Auto-start if enabled
    if (config.enabled && !collector.isRunning()) {
      collector.start();
      setIsCollecting(true);
    }

    return () => {
      collector.setCallbacks({});
    };
  }, []);

  const start = useCallback(() => {
    collector.start();
    setIsCollecting(true);
  }, []);

  const stop = useCallback(() => {
    collector.stop();
    setIsCollecting(false);
  }, []);

  const refresh = useCallback(async () => {
    await collector.refresh();
    setNetworkHealth(collector.getNetworkHealth());
    setHealthHistory(collector.getHealthHistory());
    setSpaceMetrics(collector.getAllSpaceMetrics());
    setRecentPosts(collector.getRecentPosts());
    setAlerts(collector.getAlerts());
  }, []);

  const updateConfig = useCallback((updates: Partial<AnalyticsConfig>) => {
    collector.updateConfig(updates);
    setConfig(collector.getConfig());
    setIsCollecting(collector.isRunning());
  }, []);

  const acknowledgeAlert = useCallback((alertId: string) => {
    collector.acknowledgeAlert(alertId);
    setAlerts(collector.getAlerts());
  }, []);

  const clearAcknowledgedAlerts = useCallback(() => {
    collector.clearAcknowledgedAlerts();
    setAlerts(collector.getAlerts());
  }, []);

  const getSpaceMetricsById = useCallback((spaceId: string) => {
    return collector.getSpaceMetrics(spaceId);
  }, []);

  return {
    networkHealth,
    healthHistory,
    spaceMetrics,
    recentPosts,
    alerts,
    unacknowledgedAlerts: alerts.filter(a => !a.acknowledged),
    isCollecting,
    config,
    start,
    stop,
    refresh,
    updateConfig,
    acknowledgeAlert,
    clearAcknowledgedAlerts,
    getSpaceMetrics: getSpaceMetricsById,
  };
}
