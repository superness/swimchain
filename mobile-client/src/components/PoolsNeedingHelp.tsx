/**
 * PoolsNeedingHelp - Shows posts at risk of decay
 * Per Step 15: Posts with <60s engagement
 */

import React from 'react';
import { View, Text, StyleSheet, FlatList } from 'react-native';

import { TouchPressable } from './TouchPressable';
import { HeatBadge } from './HeatBadge';
import { COLORS, SPACING, BORDER_RADIUS, TYPOGRAPHY, TOUCH_TARGET_MIN } from '../theme';
import { getTimeUntilDecay } from '../theme/colors';

export interface PoolAtRisk {
  id: string;
  title: string;
  spaceId: string;
  poolSeconds: number;
  lastEngagement: number;
}

export interface PoolsNeedingHelpProps {
  pools: PoolAtRisk[];
  onPoolPress: (pool: PoolAtRisk) => void;
}

function PoolItem({
  pool,
  onPress,
}: {
  pool: PoolAtRisk;
  onPress: () => void;
}) {
  const timeUntilDecay = getTimeUntilDecay(pool.lastEngagement);
  const urgency =
    pool.poolSeconds < 30 ? 'urgent' : pool.poolSeconds < 45 ? 'warning' : 'normal';

  return (
    <TouchPressable
      style={[
        styles.poolItem,
        urgency === 'urgent' && styles.poolItemUrgent,
      ]}
      onPress={onPress}
      haptic="selection"
    >
      <View style={styles.poolContent}>
        <Text style={styles.poolTitle} numberOfLines={1}>
          {pool.title}
        </Text>
        <View style={styles.poolMeta}>
          <Text style={styles.poolSpace}>s/{pool.spaceId}</Text>
          <Text style={styles.poolDot}>·</Text>
          <Text
            style={[
              styles.poolTime,
              urgency === 'urgent' && styles.poolTimeUrgent,
            ]}
          >
            {timeUntilDecay}
          </Text>
        </View>
      </View>
      <HeatBadge
        decayPercentage={100 - (pool.poolSeconds / 60) * 100}
        poolSeconds={pool.poolSeconds}
      />
    </TouchPressable>
  );
}

export function PoolsNeedingHelp({ pools, onPoolPress }: PoolsNeedingHelpProps) {
  if (pools.length === 0) {
    return null;
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Posts at risk</Text>
        <Text style={styles.headerEmoji}>🔥</Text>
      </View>

      <FlatList
        horizontal
        data={pools}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <PoolItem pool={item} onPress={() => onPoolPress(item)} />
        )}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.list}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: SPACING.sm,
    paddingVertical: SPACING.md,
    backgroundColor: COLORS.backgroundSecondary,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    paddingHorizontal: SPACING.md,
  },
  headerTitle: {
    fontSize: TYPOGRAPHY.fontSize.base,
    fontWeight: TYPOGRAPHY.fontWeight.semibold,
    color: COLORS.text,
  },
  headerEmoji: {
    fontSize: 16,
  },
  list: {
    paddingHorizontal: SPACING.md,
    gap: SPACING.sm,
  },
  poolItem: {
    minHeight: TOUCH_TARGET_MIN,
    backgroundColor: COLORS.surfaceElevated,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    minWidth: 200,
    maxWidth: 280,
    marginRight: SPACING.sm,
  },
  poolItemUrgent: {
    backgroundColor: COLORS.heat.full + '10',
    borderWidth: 1,
    borderColor: COLORS.heat.full + '40',
  },
  poolContent: {
    flex: 1,
    gap: 2,
  },
  poolTitle: {
    fontSize: TYPOGRAPHY.fontSize.sm,
    fontWeight: TYPOGRAPHY.fontWeight.medium,
    color: COLORS.text,
  },
  poolMeta: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  poolSpace: {
    fontSize: TYPOGRAPHY.fontSize.xs,
    color: COLORS.textSecondary,
  },
  poolDot: {
    fontSize: TYPOGRAPHY.fontSize.xs,
    color: COLORS.textTertiary,
    marginHorizontal: 4,
  },
  poolTime: {
    fontSize: TYPOGRAPHY.fontSize.xs,
    color: COLORS.textSecondary,
  },
  poolTimeUrgent: {
    color: COLORS.heat.full,
    fontWeight: TYPOGRAPHY.fontWeight.medium,
  },
});

export default PoolsNeedingHelp;
