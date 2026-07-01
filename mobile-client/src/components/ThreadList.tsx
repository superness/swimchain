/**
 * ThreadList - Virtualized list of threads
 * Per Step 6: FlatList with getItemLayout for 60fps scrolling
 */

import React, { useCallback, useMemo } from 'react';
import {
  FlatList,
  RefreshControl,
  View,
  Text,
  StyleSheet,
  ListRenderItem,
} from 'react-native';

import { ThreadCard, ThreadData } from './ThreadCard';
import { COLORS, SPACING, TYPOGRAPHY, LAYOUT } from '../theme';

// Re-export ThreadData for convenience
export type { ThreadData };

// Virtualization configuration for optimal performance
const VIRTUALIZATION_CONFIG = {
  initialNumToRender: 10,
  maxToRenderPerBatch: 5,
  windowSize: 5,
  removeClippedSubviews: true,
};

export interface ThreadListProps {
  threads: ThreadData[];
  onThreadPress: (thread: ThreadData) => void;
  onRefresh?: () => void;
  refreshing?: boolean;
  onEndReached?: () => void;
  ListHeaderComponent?: React.ComponentType<any> | React.ReactElement | null;
  ListEmptyComponent?: React.ComponentType<any> | React.ReactElement | null;
}

export function ThreadList({
  threads,
  onThreadPress,
  onRefresh,
  refreshing = false,
  onEndReached,
  ListHeaderComponent,
  ListEmptyComponent,
}: ThreadListProps) {
  // Key extractor
  const keyExtractor = useCallback((item: ThreadData) => item.id, []);

  // Get item layout for optimal scrolling (fixed height items)
  const getItemLayout = useCallback(
    (_: any, index: number) => ({
      length: LAYOUT.threadCardHeight,
      offset: LAYOUT.threadCardHeight * index,
      index,
    }),
    []
  );

  // Render item
  const renderItem: ListRenderItem<ThreadData> = useCallback(
    ({ item }: { item: ThreadData }) => (
      <ThreadCard
        thread={item}
        onPress={() => onThreadPress(item)}
      />
    ),
    [onThreadPress]
  );

  // Default empty component
  const defaultEmptyComponent = useMemo(
    () => (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>No threads yet</Text>
        <Text style={styles.emptySubtext}>
          Be the first to start a conversation
        </Text>
      </View>
    ),
    []
  );

  // Item separator
  const ItemSeparator = useCallback(
    () => <View style={styles.separator} />,
    []
  );

  return (
    <FlatList
      data={threads}
      keyExtractor={keyExtractor}
      getItemLayout={getItemLayout}
      renderItem={renderItem}
      ItemSeparatorComponent={ItemSeparator}
      ListHeaderComponent={ListHeaderComponent}
      ListEmptyComponent={ListEmptyComponent ?? defaultEmptyComponent}
      refreshControl={
        onRefresh ? (
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={COLORS.primary}
            colors={[COLORS.primary]}
          />
        ) : undefined
      }
      onEndReached={onEndReached}
      onEndReachedThreshold={0.5}
      showsVerticalScrollIndicator={true}
      // Virtualization settings
      {...VIRTUALIZATION_CONFIG}
      // Performance optimizations
      maintainVisibleContentPosition={{
        minIndexForVisible: 0,
      }}
    />
  );
}

const styles = StyleSheet.create({
  separator: {
    height: 0, // Cards have bottom border, no extra separator needed
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.xl * 2,
    paddingHorizontal: SPACING.lg,
  },
  emptyText: {
    fontSize: TYPOGRAPHY.fontSize.lg,
    fontWeight: TYPOGRAPHY.fontWeight.semibold,
    color: COLORS.text,
    marginBottom: SPACING.sm,
  },
  emptySubtext: {
    fontSize: TYPOGRAPHY.fontSize.base,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
});

export default ThreadList;
