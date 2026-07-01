/**
 * SyncStatus - Displays sync state and data usage
 * Per Step 11: WiFi preference and cellular budget
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

import { COLORS, SPACING, BORDER_RADIUS, TYPOGRAPHY } from '../theme';

export type SyncMode = 'full' | 'headers' | 'paused';

export interface SyncStatusProps {
  mode: SyncMode;
  isOnline: boolean;
  isWifi: boolean;
  cellularUsedMb: number;
  cellularBudgetMb: number;
  lastSyncTime?: number;
}

export function SyncStatus({
  mode,
  isOnline,
  isWifi,
  cellularUsedMb,
  cellularBudgetMb,
  lastSyncTime,
}: SyncStatusProps) {
  const cellularPercentage = (cellularUsedMb / cellularBudgetMb) * 100;
  const isOverBudget = cellularPercentage >= 100;
  const isNearBudget = cellularPercentage >= 80;

  const modeLabel = {
    full: 'Full Sync',
    headers: 'Headers Only',
    paused: 'Paused',
  }[mode];

  const modeColor = {
    full: COLORS.success,
    headers: COLORS.warning,
    paused: COLORS.textTertiary,
  }[mode];

  const lastSyncText = lastSyncTime
    ? `Last sync: ${formatTimeSince(lastSyncTime)}`
    : 'Never synced';

  return (
    <View style={styles.container}>
      {/* Connection Status */}
      <View style={styles.row}>
        <View style={styles.statusRow}>
          <View
            style={[
              styles.indicator,
              { backgroundColor: isOnline ? COLORS.success : COLORS.error },
            ]}
          />
          <Text style={styles.label}>
            {isOnline ? (isWifi ? 'WiFi' : 'Cellular') : 'Offline'}
          </Text>
        </View>
        <View style={styles.statusRow}>
          <View style={[styles.indicator, { backgroundColor: modeColor }]} />
          <Text style={styles.label}>{modeLabel}</Text>
        </View>
      </View>

      {/* Cellular Budget (only show when on cellular) */}
      {!isWifi && isOnline && (
        <View style={styles.budgetContainer}>
          <View style={styles.budgetHeader}>
            <Text style={styles.budgetLabel}>Cellular Data</Text>
            <Text
              style={[
                styles.budgetValue,
                isNearBudget && styles.budgetWarning,
                isOverBudget && styles.budgetError,
              ]}
            >
              {cellularUsedMb.toFixed(1)} / {cellularBudgetMb} MB
            </Text>
          </View>
          <View style={styles.budgetBar}>
            <View
              style={[
                styles.budgetFill,
                {
                  width: `${Math.min(100, cellularPercentage)}%`,
                  backgroundColor: isOverBudget
                    ? COLORS.error
                    : isNearBudget
                    ? COLORS.warning
                    : COLORS.primary,
                },
              ]}
            />
          </View>
          {isNearBudget && !isOverBudget && (
            <Text style={styles.budgetNote}>
              Approaching daily limit
            </Text>
          )}
          {isOverBudget && (
            <Text style={styles.budgetNote}>
              Sync paused - budget exceeded
            </Text>
          )}
        </View>
      )}

      {/* Last Sync */}
      <Text style={styles.lastSync}>{lastSyncText}</Text>
    </View>
  );
}

function formatTimeSince(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

const styles = StyleSheet.create({
  container: {
    gap: SPACING.sm,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  indicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  label: {
    fontSize: TYPOGRAPHY.fontSize.sm,
    color: COLORS.text,
  },
  budgetContainer: {
    backgroundColor: COLORS.surface,
    padding: SPACING.sm,
    borderRadius: BORDER_RADIUS.sm,
    gap: SPACING.xs,
  },
  budgetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  budgetLabel: {
    fontSize: TYPOGRAPHY.fontSize.sm,
    color: COLORS.textSecondary,
  },
  budgetValue: {
    fontSize: TYPOGRAPHY.fontSize.sm,
    fontWeight: TYPOGRAPHY.fontWeight.medium,
    color: COLORS.text,
  },
  budgetWarning: {
    color: COLORS.warning,
  },
  budgetError: {
    color: COLORS.error,
  },
  budgetBar: {
    height: 4,
    backgroundColor: COLORS.borderLight,
    borderRadius: 2,
    overflow: 'hidden',
  },
  budgetFill: {
    height: '100%',
    borderRadius: 2,
  },
  budgetNote: {
    fontSize: TYPOGRAPHY.fontSize.xs,
    color: COLORS.warning,
  },
  lastSync: {
    fontSize: TYPOGRAPHY.fontSize.xs,
    color: COLORS.textTertiary,
  },
});

export default SyncStatus;
