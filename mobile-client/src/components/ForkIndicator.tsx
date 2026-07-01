/**
 * ForkIndicator - Shows current fork status
 * Per Step 12: Display fork name and warn on minority fork
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

import { COLORS, SPACING, BORDER_RADIUS, TYPOGRAPHY } from '../theme';

export interface ForkStatus {
  forkId: string;
  isMainChain: boolean;
  participantCount: number;
  lastBlockTime: number;
  divergenceDetected: boolean;
}

export interface ForkIndicatorProps {
  status: ForkStatus;
  compact?: boolean;
}

export function ForkIndicator({ status, compact = false }: ForkIndicatorProps) {
  const statusLabel = status.isMainChain ? 'Main Chain' : 'Minority Fork';

  if (compact) {
    return (
      <View
        style={[
          styles.badge,
          status.isMainChain ? styles.badgeMain : styles.badgeMinority,
        ]}
        accessibilityRole="status"
        accessibilityLabel={`Fork status: ${statusLabel}, ID: ${status.forkId}`}
      >
        <Text style={styles.badgeText}>{status.forkId}</Text>
      </View>
    );
  }

  return (
    <View
      style={styles.container}
      accessibilityRole="status"
      accessibilityLabel={`Fork status: ${statusLabel}, ${status.participantCount} participants`}
    >
      <View style={styles.header}>
        <View
          style={[
            styles.indicator,
            status.isMainChain ? styles.indicatorMain : styles.indicatorMinority,
          ]}
          accessibilityElementsHidden={true}
        />
        <Text style={styles.forkId}>{status.forkId}</Text>
        <Text style={styles.statusLabel}>{statusLabel}</Text>
      </View>

      {!status.isMainChain && (
        <View style={styles.warning}>
          <Text style={styles.warningIcon}>⚠️</Text>
          <Text style={styles.warningText}>
            You may be on a minority fork
          </Text>
        </View>
      )}

      <View style={styles.stats}>
        <Text style={styles.stat}>
          {status.participantCount} participants
        </Text>
        <Text style={styles.statDot}>·</Text>
        <Text style={styles.stat}>
          Block {formatTimeSince(status.lastBlockTime)}
        </Text>
      </View>
    </View>
  );
}

function formatTimeSince(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  return `${Math.floor(seconds / 3600)}h ago`;
}

const styles = StyleSheet.create({
  container: {
    gap: SPACING.xs,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  indicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  indicatorMain: {
    backgroundColor: COLORS.success,
  },
  indicatorMinority: {
    backgroundColor: COLORS.warning,
  },
  forkId: {
    fontSize: TYPOGRAPHY.fontSize.sm,
    fontWeight: TYPOGRAPHY.fontWeight.medium,
    color: COLORS.text,
  },
  statusLabel: {
    fontSize: TYPOGRAPHY.fontSize.xs,
    fontWeight: TYPOGRAPHY.fontWeight.medium,
    color: COLORS.textSecondary,
    marginLeft: SPACING.xs,
  },
  warning: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    backgroundColor: COLORS.warning + '20',
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderRadius: BORDER_RADIUS.sm,
  },
  warningIcon: {
    fontSize: 14,
  },
  warningText: {
    fontSize: TYPOGRAPHY.fontSize.sm,
    color: COLORS.warning,
  },
  stats: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  stat: {
    fontSize: TYPOGRAPHY.fontSize.xs,
    color: COLORS.textTertiary,
  },
  statDot: {
    fontSize: TYPOGRAPHY.fontSize.xs,
    color: COLORS.textTertiary,
    marginHorizontal: SPACING.xs,
  },
  badge: {
    paddingHorizontal: SPACING.xs,
    paddingVertical: 2,
    borderRadius: BORDER_RADIUS.sm,
  },
  badgeMain: {
    backgroundColor: COLORS.success + '20',
  },
  badgeMinority: {
    backgroundColor: COLORS.warning + '20',
  },
  badgeText: {
    fontSize: TYPOGRAPHY.fontSize.xs,
    fontWeight: TYPOGRAPHY.fontWeight.medium,
    color: COLORS.text,
  },
});

export default ForkIndicator;
