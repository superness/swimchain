/**
 * ReplyList - List of replies with threading
 * Per CLIENT_DESIGN.md §6.7: Threading depth limit of 2
 */

import React, { useCallback } from 'react';
import { View, Text, StyleSheet } from 'react-native';

import { ReplyItem, ReplyData } from './ReplyItem';
import { COLORS, SPACING, TYPOGRAPHY, LAYOUT } from '../theme';

// Re-export ReplyData for convenience
export type { ReplyData };

export interface ReplyListProps {
  replies: ReplyData[];
  onReplyPress?: (reply: ReplyData) => void;
  onViewMore?: (reply: ReplyData) => void;
  maxDepth?: number;
}

export function ReplyList({
  replies,
  onReplyPress,
  onViewMore,
  maxDepth = LAYOUT.maxThreadingDepth,
}: ReplyListProps) {
  const handleReplyPress = useCallback(
    (reply: ReplyData) => {
      if (reply.depth >= maxDepth && reply.replyCount > 0) {
        // Deep reply with children - navigate to view more
        onViewMore?.(reply);
      } else {
        onReplyPress?.(reply);
      }
    },
    [maxDepth, onReplyPress, onViewMore]
  );

  if (replies.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>No replies yet</Text>
        <Text style={styles.emptySubtext}>Be the first to reply</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.header}>
        {replies.length} {replies.length === 1 ? 'Reply' : 'Replies'}
      </Text>
      {replies.map((reply) => (
        <ReplyItem
          key={reply.id}
          reply={reply}
          onPress={() => handleReplyPress(reply)}
          maxDepth={maxDepth}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  header: {
    fontSize: TYPOGRAPHY.fontSize.base,
    fontWeight: TYPOGRAPHY.fontWeight.semibold,
    color: COLORS.text,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    backgroundColor: COLORS.backgroundSecondary,
  },
  emptyContainer: {
    paddingVertical: SPACING.xl,
    paddingHorizontal: SPACING.md,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  emptyText: {
    fontSize: TYPOGRAPHY.fontSize.base,
    fontWeight: TYPOGRAPHY.fontWeight.medium,
    color: COLORS.textSecondary,
  },
  emptySubtext: {
    fontSize: TYPOGRAPHY.fontSize.sm,
    color: COLORS.textTertiary,
    marginTop: SPACING.xs,
  },
});

export default ReplyList;
