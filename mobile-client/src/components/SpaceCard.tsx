/**
 * SpaceCard - Space list item component
 */

import React, { memo, useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';

import { TouchPressable } from './TouchPressable';
import { HeatIndicator } from './HeatIndicator';
import { COLORS, SPACING, BORDER_RADIUS, TYPOGRAPHY, TOUCH_TARGET_MIN } from '../theme';

export interface SpaceData {
  id: string;
  name: string;
  description?: string;
  threadCount: number;
  lastActivity: number;
  isSubscribed: boolean;
}

export interface SpaceCardProps {
  space: SpaceData;
  onPress: () => void;
}

function SpaceCardComponent({ space, onPress }: SpaceCardProps) {
  const timeAgo = useMemo(() => {
    const now = Date.now();
    const diff = now - space.lastActivity;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    return `${minutes}m ago`;
  }, [space.lastActivity]);

  // Calculate rough activity level for heat indicator
  const activityDecay = useMemo(() => {
    const now = Date.now();
    const hoursSinceActivity = (now - space.lastActivity) / 3600000;
    return Math.min(100, hoursSinceActivity * 4); // Full decay at 25 hours
  }, [space.lastActivity]);

  return (
    <TouchPressable
      style={styles.container}
      onPress={onPress}
      haptic="selection"
      accessibilityLabel={`Space: ${space.name}`}
      accessibilityHint={`${space.threadCount} threads, last activity ${timeAgo}`}
    >
      <View style={styles.content}>
        {/* Left: Activity indicator */}
        <View style={styles.indicatorContainer}>
          <HeatIndicator decayPercentage={activityDecay} size="md" />
        </View>

        {/* Center: Name and description */}
        <View style={styles.textContent}>
          <View style={styles.nameRow}>
            <Text style={styles.name}>s/{space.name}</Text>
            {space.isSubscribed && (
              <View style={styles.subscribedBadge}>
                <Text style={styles.subscribedText}>✓</Text>
              </View>
            )}
          </View>
          {space.description && (
            <Text style={styles.description} numberOfLines={1}>
              {space.description}
            </Text>
          )}
          <View style={styles.meta}>
            <Text style={styles.metaText}>{space.threadCount} threads</Text>
            <Text style={styles.metaDot}>·</Text>
            <Text style={styles.metaText}>{timeAgo}</Text>
          </View>
        </View>

        {/* Right: Chevron */}
        <Text style={styles.chevron}>›</Text>
      </View>
    </TouchPressable>
  );
}

export const SpaceCard = memo(SpaceCardComponent);

const styles = StyleSheet.create({
  container: {
    minHeight: TOUCH_TARGET_MIN * 1.5,
    backgroundColor: COLORS.background,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
    justifyContent: 'center',
    paddingVertical: SPACING.sm,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    gap: SPACING.sm,
  },
  indicatorContainer: {
    width: 24,
    alignItems: 'center',
  },
  textContent: {
    flex: 1,
    gap: 2,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  name: {
    fontSize: TYPOGRAPHY.fontSize.md,
    fontWeight: TYPOGRAPHY.fontWeight.semibold,
    color: COLORS.text,
  },
  subscribedBadge: {
    backgroundColor: COLORS.primary + '20',
    borderRadius: BORDER_RADIUS.sm,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  subscribedText: {
    fontSize: TYPOGRAPHY.fontSize.xs,
    color: COLORS.primary,
    fontWeight: TYPOGRAPHY.fontWeight.bold,
  },
  description: {
    fontSize: TYPOGRAPHY.fontSize.sm,
    color: COLORS.textSecondary,
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  metaText: {
    fontSize: TYPOGRAPHY.fontSize.xs,
    color: COLORS.textTertiary,
  },
  metaDot: {
    fontSize: TYPOGRAPHY.fontSize.xs,
    color: COLORS.textTertiary,
    marginHorizontal: SPACING.xs,
  },
  chevron: {
    fontSize: 24,
    color: COLORS.textTertiary,
    fontWeight: TYPOGRAPHY.fontWeight.regular,
  },
});

export default SpaceCard;
