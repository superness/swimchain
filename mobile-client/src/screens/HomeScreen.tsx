/**
 * HomeScreen - Main feed with spaces and threads
 * Per Step 6: Space list with virtualization
 */

import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, RefreshControl, ScrollView } from 'react-native';
import { useNavigation } from '@react-navigation/native';

import { ThreadList, ThreadData } from '../components/ThreadList';
import { SpaceCard, SpaceData } from '../components/SpaceCard';
import { PoolsNeedingHelp, PoolAtRisk } from '../components/PoolsNeedingHelp';
import { SyncStatus } from '../components/SyncStatus';
import { COLORS, SPACING, TYPOGRAPHY } from '../theme';
import type { HomeStackScreenProps } from '../navigation/types';
import {
  useRpcConnection,
  useSpaces,
  useRecentContent,
  usePoolsAtRisk,
} from '../hooks/useRpc';
import type { SpaceInfo, ContentItem } from '../services/SwimchainRpc';

type Props = HomeStackScreenProps<'HomeScreen'>;

export default function HomeScreen() {
  const navigation = useNavigation<Props['navigation']>();
  const [refreshing, setRefreshing] = useState(false);

  // RPC data
  const { connected } = useRpcConnection();
  const { spaces: rpcSpaces, refresh: refreshSpaces } = useSpaces();
  const { content: recentContent, refresh: refreshContent } = useRecentContent(20);
  const { pools: atRiskContent, refresh: refreshPools } = usePoolsAtRisk(0.1);

  // Transform RPC data to component format
  const spaces: SpaceData[] = useMemo(() =>
    rpcSpaces.map((s: SpaceInfo) => ({
      id: s.space_id,
      name: s.name ?? s.space_id,
      description: '',
      threadCount: s.post_count,
      lastActivity: s.last_activity ? s.last_activity * 1000 : Date.now(),
      isSubscribed: true, // TODO: Track subscriptions
    })),
    [rpcSpaces]
  );

  const threads: ThreadData[] = useMemo(() =>
    recentContent
      .filter((item: ContentItem) => item.parent_id === null) // Top-level posts only
      .map((item: ContentItem) => ({
        id: item.content_id,
        title: item.title ?? item.body?.substring(0, 60) ?? 'Untitled',
        authorAddress: item.author_id,
        createdAt: item.created_at * 1000,
        lastEngagement: item.last_engagement * 1000,
        replyCount: item.reply_count ?? 0,
        engagementPoolSeconds: Math.round((item.survival_probability ?? 1) * 60),
      })),
    [recentContent]
  );

  const poolsAtRisk: PoolAtRisk[] = useMemo(() =>
    atRiskContent.map((item: ContentItem) => ({
      id: item.content_id,
      title: item.title ?? item.body?.substring(0, 40) ?? 'Untitled',
      spaceId: item.space_id,
      poolSeconds: Math.round((item.survival_probability ?? 0) * 60),
      lastEngagement: item.last_engagement * 1000,
    })),
    [atRiskContent]
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refreshSpaces(), refreshContent(), refreshPools()]);
    setRefreshing(false);
  }, [refreshSpaces, refreshContent, refreshPools]);

  const handleSpacePress = useCallback(
    (space: SpaceData) => {
      navigation.navigate('SpaceViewScreen', { spaceId: space.id });
    },
    [navigation]
  );

  const handleThreadPress = useCallback(
    (thread: ThreadData) => {
      navigation.navigate('ThreadViewScreen', {
        postId: thread.id,
        spaceId: 'general', // TODO: Get from thread
      });
    },
    [navigation]
  );

  const handlePoolPress = useCallback(
    (pool: PoolAtRisk) => {
      navigation.navigate('ThreadViewScreen', {
        postId: pool.id,
        spaceId: pool.spaceId,
      });
    },
    [navigation]
  );

  // Header with sync status
  const ListHeader = useCallback(
    () => (
      <View style={styles.header}>
        {/* Sync Status */}
        <SyncStatus
          mode={connected ? 'full' : 'paused'}
          isOnline={connected}
          isWifi={true}
          cellularUsedMb={0}
          cellularBudgetMb={100}
          lastSyncTime={Date.now() - 60000}
        />

        {/* Pools Needing Help */}
        {poolsAtRisk.length > 0 && (
          <PoolsNeedingHelp pools={poolsAtRisk} onPoolPress={handlePoolPress} />
        )}

        {/* Subscribed Spaces */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Your Spaces</Text>
          {spaces
            .filter((s) => s.isSubscribed)
            .map((space) => (
              <SpaceCard
                key={space.id}
                space={space}
                onPress={() => handleSpacePress(space)}
              />
            ))}
        </View>

        {/* Recent Threads Header */}
        <Text style={[styles.sectionTitle, { paddingHorizontal: SPACING.md }]}>
          Recent Threads
        </Text>
      </View>
    ),
    [spaces, poolsAtRisk, handleSpacePress, handlePoolPress, connected]
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
    gap: SPACING.md,
    paddingBottom: SPACING.md,
  },
  section: {
    gap: 0,
  },
  sectionTitle: {
    fontSize: TYPOGRAPHY.fontSize.base,
    fontWeight: TYPOGRAPHY.fontWeight.semibold,
    color: COLORS.text,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    backgroundColor: COLORS.backgroundSecondary,
  },
});
