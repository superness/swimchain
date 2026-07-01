/**
 * PostContent - Displays post title and body content
 */

import React, { memo, useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';

import { HeatIndicator } from './HeatIndicator';
import { COLORS, SPACING, TYPOGRAPHY } from '../theme';
import { calculateDecayPercentage } from '../theme/colors';

export interface PostData {
  id: string;
  title?: string;
  body: string;
  authorAddress: string;
  createdAt: number;
  lastEngagement: number;
}

export interface PostContentProps {
  post: PostData;
  showAuthor?: boolean;
  showHeat?: boolean;
}

function PostContentComponent({
  post,
  showAuthor = true,
  showHeat = true,
}: PostContentProps) {
  const decayPercentage = useMemo(
    () => calculateDecayPercentage(post.createdAt, post.lastEngagement),
    [post.createdAt, post.lastEngagement]
  );

  const truncatedAuthor = useMemo(() => {
    const addr = post.authorAddress;
    return `${addr.slice(0, 8)}...${addr.slice(-4)}`;
  }, [post.authorAddress]);

  const formattedDate = useMemo(() => {
    const date = new Date(post.createdAt);
    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }, [post.createdAt]);

  return (
    <View style={styles.container}>
      {/* Header: Author and heat */}
      {showAuthor && (
        <View style={styles.header}>
          <View style={styles.authorRow}>
            {showHeat && (
              <HeatIndicator decayPercentage={decayPercentage} size="sm" />
            )}
            <Text style={styles.author}>{truncatedAuthor}</Text>
          </View>
          <Text style={styles.date}>{formattedDate}</Text>
        </View>
      )}

      {/* Title */}
      {post.title && <Text style={styles.title}>{post.title}</Text>}

      {/* Body */}
      <Text style={styles.body}>{post.body}</Text>
    </View>
  );
}

export const PostContent = memo(PostContentComponent);

const styles = StyleSheet.create({
  container: {
    gap: SPACING.sm,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  author: {
    fontSize: TYPOGRAPHY.fontSize.sm,
    fontWeight: TYPOGRAPHY.fontWeight.medium,
    color: COLORS.textSecondary,
  },
  date: {
    fontSize: TYPOGRAPHY.fontSize.xs,
    color: COLORS.textTertiary,
  },
  title: {
    fontSize: TYPOGRAPHY.fontSize.lg,
    fontWeight: TYPOGRAPHY.fontWeight.bold,
    color: COLORS.text,
    lineHeight: TYPOGRAPHY.fontSize.lg * TYPOGRAPHY.lineHeight.tight,
  },
  body: {
    fontSize: TYPOGRAPHY.fontSize.base,
    color: COLORS.text,
    lineHeight: TYPOGRAPHY.fontSize.base * TYPOGRAPHY.lineHeight.normal,
  },
});

export default PostContent;
