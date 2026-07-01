/**
 * ThreadViewScreen - View post with engagement pool and replies
 * Per Step 7: Engagement pool with contributor attribution
 */

import React, { useState, useCallback, useMemo } from 'react';
import { View, ScrollView, StyleSheet, RefreshControl, ActivityIndicator, Text } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';

import { PostContent, PostData } from '../components/PostContent';
import { EngagementPool, Contributor } from '../components/EngagementPool';
import { ReplyList, ReplyData } from '../components/ReplyList';
import { Button } from '../components/Button';
import { useMobilePow } from '../hooks/useMobilePow';
import { useThread } from '../hooks/useRpc';
import type { ReplyItem } from '../services/SwimchainRpc';
import { COLORS, SPACING } from '../theme';
import type { HomeStackScreenProps } from '../navigation/types';

type Props = HomeStackScreenProps<'ThreadViewScreen'>;

export default function ThreadViewScreen() {
  const navigation = useNavigation<Props['navigation']>();
  const route = useRoute<Props['route']>();
  const { postId, spaceId } = route.params;

  const { thread, replies: rpcReplies, loading, refresh: refreshThread } = useThread(postId);
  const [refreshing, setRefreshing] = useState(false);

  // Transform RPC data to component format
  const post: PostData | null = useMemo(() =>
    thread
      ? {
          id: thread.content_id,
          title: thread.title ?? 'Untitled',
          body: thread.body ?? '',
          authorAddress: thread.author_id,
          createdAt: thread.created_at * 1000,
          lastEngagement: thread.last_engagement * 1000,
        }
      : null,
    [thread]
  );

  const poolSeconds = useMemo(() =>
    thread ? Math.round((thread.survival_probability ?? 1) * 60) : 0,
    [thread]
  );

  const contributors: Contributor[] = []; // TODO: Get from pool info

  const replies: ReplyData[] = useMemo(() =>
    rpcReplies.map((r: ReplyItem) => ({
      id: r.content_id,
      body: r.body,
      authorAddress: r.author_id,
      createdAt: r.created_at * 1000,
      lastEngagement: r.last_engagement * 1000,
      replyCount: 0, // TODO: Get nested reply count
      depth: 0,
    })),
    [rpcReplies]
  );

  const { state: powState, progress } = useMobilePow();
  const [isContributing, setIsContributing] = useState(false);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await refreshThread();
    setRefreshing(false);
  }, [refreshThread]);

  const handleContribute = useCallback(
    async (seconds: 5 | 15 | 30) => {
      setIsContributing(true);
      try {
        // TODO: Implement real PoW engagement
        // 1. Fetch challenge from network
        // 2. Mine PoW
        // 3. Submit engagement
        // For now, simulate with delay and refresh
        await new Promise((resolve) => setTimeout(resolve, 2000));
        await refreshThread();
      } finally {
        setIsContributing(false);
      }
    },
    [refreshThread]
  );

  const handleReply = useCallback(() => {
    navigation.getParent()?.navigate('Compose', {
      spaceId,
      replyTo: postId,
    });
  }, [navigation, spaceId, postId]);

  const handleReplyPress = useCallback((reply: ReplyData) => {
    // Show context menu or navigate to reply
  }, []);

  const handleViewMore = useCallback((reply: ReplyData) => {
    // Navigate to nested thread view
  }, []);

  if (loading && !thread) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Loading thread...</Text>
      </View>
    );
  }

  if (!post) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Text style={styles.errorText}>Thread not found</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={handleRefresh}
          tintColor={COLORS.primary}
        />
      }
    >
      {/* Post Content */}
      <View style={styles.postContainer}>
        <PostContent post={post} showAuthor showHeat />
      </View>

      {/* Engagement Pool */}
      <View style={styles.poolContainer}>
        <EngagementPool
          poolId={postId}
          currentSeconds={poolSeconds}
          contributors={contributors}
          onContribute={handleContribute}
          isContributing={isContributing || powState === 'mining'}
          contributionProgress={progress}
          lastEngagement={post.lastEngagement}
        />
      </View>

      {/* Reply Button */}
      <View style={styles.replyButtonContainer}>
        <Button
          title="Reply to Thread"
          variant="outline"
          onPress={handleReply}
        />
      </View>

      {/* Replies */}
      <ReplyList
        replies={replies}
        onReplyPress={handleReplyPress}
        onViewMore={handleViewMore}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: SPACING.md,
    color: COLORS.textSecondary,
  },
  errorText: {
    color: COLORS.textSecondary,
  },
  postContainer: {
    padding: SPACING.md,
  },
  poolContainer: {
    paddingHorizontal: SPACING.md,
    paddingBottom: SPACING.md,
  },
  replyButtonContainer: {
    paddingHorizontal: SPACING.md,
    paddingBottom: SPACING.md,
  },
});
