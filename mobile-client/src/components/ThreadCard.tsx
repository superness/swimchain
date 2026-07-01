/**
 * ThreadCard - Thread list item component
 * Fixed height for FlatList getItemLayout optimization
 * Per CLIENT_DESIGN.md §6.7: Threading depth limit of 2
 */

import React, { memo, useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';

import { TouchPressable } from './TouchPressable';
import { HeatBadge } from './HeatBadge';
import { COLORS, SPACING, BORDER_RADIUS, TYPOGRAPHY, LAYOUT } from '../theme';
import { calculateDecayPercentage } from '../theme/colors';
import { ADDRESS } from '../constants/protocol';

export interface ThreadData {
  id: string;
  title: string;
  authorAddress: string;
  createdAt: number;
  lastEngagement: number;
  replyCount: number;
  engagementPoolSeconds: number;
}

export interface ThreadCardProps {
  thread: ThreadData;
  onPress: () => void;
  onSwipeRight?: () => void;
  onSwipeLeft?: () => void;
}

function ThreadCardComponent({ thread, onPress }: ThreadCardProps) {
  const decayPercentage = useMemo(
    () => calculateDecayPercentage(thread.createdAt, thread.lastEngagement),
    [thread.createdAt, thread.lastEngagement]
  );

  const truncatedAuthor = useMemo(() => {
    const addr = thread.authorAddress;
    return `${addr.slice(0, 8)}...${addr.slice(-4)}`;
  }, [thread.authorAddress]);

  const timeAgo = useMemo(() => {
    const now = Date.now();
    const diff = now - thread.createdAt;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (days > 0) return `${days}d`;
    if (hours > 0) return `${hours}h`;
    return `${minutes}m`;
  }, [thread.createdAt]);

  return (
    <TouchPressable
      style={styles.container}
      onPress={onPress}
      haptic="selection"
      accessibilityLabel={`Thread: ${thread.title}`}
      accessibilityHint={`By ${truncatedAuthor}, ${thread.replyCount} replies`}
    >
      <View style={styles.content}>
        {/* Left side: Heat badge */}
        <HeatBadge
          decayPercentage={decayPercentage}
          poolSeconds={thread.engagementPoolSeconds}
          style={styles.heatBadge}
        />

        {/* Center: Title and meta */}
        <View style={styles.textContent}>
          <Text style={styles.title} numberOfLines={2}>
            {thread.title}
          </Text>
          <View style={styles.meta}>
            <Text style={styles.metaText}>{truncatedAuthor}</Text>
            <Text style={styles.metaDot}>·</Text>
            <Text style={styles.metaText}>{timeAgo}</Text>
            <Text style={styles.metaDot}>·</Text>
            <Text style={styles.metaText}>{thread.replyCount} replies</Text>
          </View>
        </View>

        {/* Right side: Chevron */}
        <Text style={styles.chevron}>›</Text>
      </View>
    </TouchPressable>
  );
}

// Memoize for FlatList performance
export const ThreadCard = memo(ThreadCardComponent);

const styles = StyleSheet.create({
  container: {
    height: LAYOUT.threadCardHeight,
    backgroundColor: COLORS.background,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
    justifyContent: 'center',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    gap: SPACING.sm,
  },
  heatBadge: {
    flexShrink: 0,
  },
  textContent: {
    flex: 1,
    gap: SPACING.xs,
  },
  title: {
    fontSize: TYPOGRAPHY.fontSize.base,
    fontWeight: TYPOGRAPHY.fontWeight.medium,
    color: COLORS.text,
    lineHeight: TYPOGRAPHY.fontSize.base * TYPOGRAPHY.lineHeight.tight,
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  metaText: {
    fontSize: TYPOGRAPHY.fontSize.sm,
    color: COLORS.textSecondary,
  },
  metaDot: {
    fontSize: TYPOGRAPHY.fontSize.sm,
    color: COLORS.textTertiary,
    marginHorizontal: SPACING.xs,
  },
  chevron: {
    fontSize: 24,
    color: COLORS.textTertiary,
    fontWeight: TYPOGRAPHY.fontWeight.regular,
  },
});

export default ThreadCard;
