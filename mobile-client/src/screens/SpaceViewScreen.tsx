/**
 * SpaceViewScreen - View threads in a specific space
 */

import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';

import { ThreadList, ThreadData } from '../components/ThreadList';
import { Button } from '../components/Button';
import { COLORS, SPACING, TYPOGRAPHY } from '../theme';
import type { HomeStackScreenProps } from '../navigation/types';
import { useSpaceThreads } from '../hooks/useRpc';
import type { ContentItem } from '../services/SwimchainRpc';

type Props = HomeStackScreenProps<'SpaceViewScreen'>;

export default function SpaceViewScreen() {
  const navigation = useNavigation<Props['navigation']>();
  const route = useRoute<Props['route']>();
  const { spaceId } = route.params;

  const { threads: rpcThreads, refresh: refreshThreads } = useSpaceThreads(spaceId);
  const [refreshing, setRefreshing] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(true);

  // Transform RPC data to component format
  const threads: ThreadData[] = useMemo(() =>
    rpcThreads.map((item: ContentItem) => ({
      id: item.content_id,
      title: item.title ?? item.body?.substring(0, 60) ?? 'Untitled',
      authorAddress: item.author_id,
      createdAt: item.created_at * 1000,
      lastEngagement: item.last_engagement * 1000,
      replyCount: item.reply_count ?? 0,
      engagementPoolSeconds: Math.round((item.survival_probability ?? 1) * 60),
    })),
    [rpcThreads]
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await refreshThreads();
    setRefreshing(false);
  }, [refreshThreads]);

  const handleThreadPress = useCallback(
    (thread: ThreadData) => {
      navigation.navigate('ThreadViewScreen', {
        postId: thread.id,
        spaceId,
      });
    },
    [navigation, spaceId]
  );

  const handleNewPost = useCallback(() => {
    navigation.getParent()?.navigate('Compose', { spaceId });
  }, [navigation, spaceId]);

  const handleSubscribe = useCallback(() => {
    setIsSubscribed((prev: boolean) => !prev);
    // TODO: Actually subscribe/unsubscribe
  }, []);

  const ListHeader = useCallback(
    () => (
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View>
            <Text style={styles.spaceName}>s/{spaceId}</Text>
            <Text style={styles.threadCount}>{threads.length} threads</Text>
          </View>
          <Button
            title={isSubscribed ? 'Subscribed' : 'Subscribe'}
            variant={isSubscribed ? 'secondary' : 'primary'}
            size="sm"
            onPress={handleSubscribe}
          />
        </View>
        <Button
          title="New Thread"
          variant="primary"
          onPress={handleNewPost}
          style={styles.newButton}
        />
      </View>
    ),
    [spaceId, threads.length, isSubscribed, handleSubscribe, handleNewPost]
  );

  return (
    <View style={styles.container}>
      <ThreadList
        threads={threads}
        onThreadPress={handleThreadPress}
        onRefresh={handleRefresh}
        refreshing={refreshing}
        ListHeaderComponent={ListHeader}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    padding: SPACING.md,
    gap: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  spaceName: {
    fontSize: TYPOGRAPHY.fontSize.xl,
    fontWeight: TYPOGRAPHY.fontWeight.bold,
    color: COLORS.text,
  },
  threadCount: {
    fontSize: TYPOGRAPHY.fontSize.sm,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  newButton: {
    alignSelf: 'stretch',
  },
});
