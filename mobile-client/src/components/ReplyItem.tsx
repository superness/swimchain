/**
 * ReplyItem - Single reply in a thread
 * Per CLIENT_DESIGN.md §6.7: Threading depth limit of 2
 */

import React, { memo, useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';

import { TouchPressable } from './TouchPressable';
import { HeatIndicator } from './HeatIndicator';
import { COLORS, SPACING, TYPOGRAPHY, TOUCH_TARGET_MIN } from '../theme';
import { calculateDecayPercentage } from '../theme/colors';

export interface ReplyData {
  id: string;
  body: string;
  authorAddress: string;
  createdAt: number;
  lastEngagement: number;
  replyCount: number;
  depth: number;
}

export interface ReplyItemProps {
  reply: ReplyData;
  onPress?: () => void;
  onEngage?: () => void;
  maxDepth?: number;
}

function ReplyItemComponent({
  reply,
  onPress,
  onEngage,
  maxDepth = 2,
}: ReplyItemProps) {
  const decayPercentage = useMemo(
    () => calculateDecayPercentage(reply.createdAt, reply.lastEngagement),
    [reply.createdAt, reply.lastEngagement]
  );

  const truncatedAuthor = useMemo(() => {
    const addr = reply.authorAddress;
    return `${addr.slice(0, 8)}...${addr.slice(-4)}`;
  }, [reply.authorAddress]);

  const timeAgo = useMemo(() => {
    const now = Date.now();
    const diff = now - reply.createdAt;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);

    if (hours > 0) return `${hours}h`;
    return `${minutes}m`;
  }, [reply.createdAt]);

  // Calculate indentation based on depth (capped at maxDepth)
  const indentLevel = Math.min(reply.depth, maxDepth);
  const indentStyle = { marginLeft: indentLevel * SPACING.md };

  return (
    <TouchPressable
      style={[styles.container, indentStyle]}
      onPress={onPress}
      haptic="selection"
      accessibilityLabel={`Reply by ${truncatedAuthor}`}
    >
      {/* Depth indicator line */}
      {reply.depth > 0 && <View style={styles.depthLine} />}

      <View style={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <HeatIndicator decayPercentage={decayPercentage} size="sm" />
          <Text style={styles.author}>{truncatedAuthor}</Text>
          <Text style={styles.dot}>·</Text>
          <Text style={styles.time}>{timeAgo}</Text>
        </View>

        {/* Body */}
        <Text style={styles.body} numberOfLines={6}>
          {reply.body}
        </Text>

        {/* Footer */}
        <View style={styles.footer}>
          {reply.replyCount > 0 && reply.depth < maxDepth && (
            <Text style={styles.replyCount}>
              {reply.replyCount} {reply.replyCount === 1 ? 'reply' : 'replies'}
            </Text>
          )}
          {reply.replyCount > 0 && reply.depth >= maxDepth && (
            <Text style={styles.viewMore}>
              View {reply.replyCount} more {reply.replyCount === 1 ? 'reply' : 'replies'}
            </Text>
          )}
        </View>
      </View>
    </TouchPressable>
  );
}

export const ReplyItem = memo(ReplyItemComponent);

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    minHeight: TOUCH_TARGET_MIN,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
  },
  depthLine: {
    width: 2,
    backgroundColor: COLORS.borderLight,
    marginRight: SPACING.sm,
    borderRadius: 1,
  },
  content: {
    flex: 1,
    gap: SPACING.xs,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  author: {
    fontSize: TYPOGRAPHY.fontSize.sm,
    fontWeight: TYPOGRAPHY.fontWeight.medium,
    color: COLORS.textSecondary,
  },
  dot: {
    fontSize: TYPOGRAPHY.fontSize.sm,
    color: COLORS.textTertiary,
  },
  time: {
    fontSize: TYPOGRAPHY.fontSize.xs,
    color: COLORS.textTertiary,
  },
  body: {
    fontSize: TYPOGRAPHY.fontSize.base,
    color: COLORS.text,
    lineHeight: TYPOGRAPHY.fontSize.base * TYPOGRAPHY.lineHeight.normal,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  replyCount: {
    fontSize: TYPOGRAPHY.fontSize.sm,
    color: COLORS.textSecondary,
  },
  viewMore: {
    fontSize: TYPOGRAPHY.fontSize.sm,
    color: COLORS.primary,
    fontWeight: TYPOGRAPHY.fontWeight.medium,
  },
});

export default ReplyItem;
