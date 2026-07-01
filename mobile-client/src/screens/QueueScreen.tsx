/**
 * QueueScreen - Offline queue management
 * Per Step 10: View and manage queued actions
 */

import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, Alert } from 'react-native';

import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { TouchPressable } from '../components/TouchPressable';
import { COLORS, SPACING, BORDER_RADIUS, TYPOGRAPHY, TOUCH_TARGET_MIN } from '../theme';

export type QueuedActionType = 'post' | 'reply' | 'engage';
export type QueuedActionStatus = 'pending' | 'processing' | 'failed';

export interface QueuedAction {
  id: string;
  type: QueuedActionType;
  spaceId: string;
  content?: { title?: string; body: string };
  replyToId?: string;
  engageSeconds?: number;
  status: QueuedActionStatus;
  retryCount: number;
  createdAt: number;
  lastAttemptAt?: number;
  error?: string;
}

// Mock data
const MOCK_QUEUE: QueuedAction[] = [
  {
    id: '1',
    type: 'post',
    spaceId: 'general',
    content: { title: 'My new post', body: 'This is the content of my post...' },
    status: 'pending',
    retryCount: 0,
    createdAt: Date.now() - 300000,
  },
  {
    id: '2',
    type: 'engage',
    spaceId: 'tech',
    engageSeconds: 15,
    status: 'failed',
    retryCount: 2,
    createdAt: Date.now() - 600000,
    lastAttemptAt: Date.now() - 120000,
    error: 'Network unavailable',
  },
];

function QueueItem({
  item,
  onRetry,
  onDelete,
}: {
  item: QueuedAction;
  onRetry: () => void;
  onDelete: () => void;
}) {
  const typeLabel = {
    post: 'New Post',
    reply: 'Reply',
    engage: `Engage +${item.engageSeconds}s`,
  }[item.type];

  const statusColor = {
    pending: COLORS.primary,
    processing: COLORS.warning,
    failed: COLORS.error,
  }[item.status];

  const timeAgo = formatTimeAgo(item.createdAt);

  return (
    <Card style={styles.itemCard}>
      <View style={styles.itemHeader}>
        <View style={styles.itemType}>
          <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
          <Text style={styles.typeLabel}>{typeLabel}</Text>
        </View>
        <Text style={styles.space}>s/{item.spaceId}</Text>
      </View>

      {item.content && (
        <Text style={styles.content} numberOfLines={2}>
          {item.content.title || item.content.body}
        </Text>
      )}

      <View style={styles.itemMeta}>
        <Text style={styles.metaText}>
          {item.status === 'failed'
            ? `Failed after ${item.retryCount} attempts`
            : item.status === 'processing'
            ? 'Processing...'
            : 'Waiting...'}
        </Text>
        <Text style={styles.metaDot}>·</Text>
        <Text style={styles.metaText}>{timeAgo}</Text>
      </View>

      {item.error && (
        <Text style={styles.errorText}>{item.error}</Text>
      )}

      {item.status === 'failed' && (
        <View style={styles.itemActions}>
          <Button
            title="Retry"
            variant="outline"
            size="sm"
            onPress={onRetry}
          />
          <Button
            title="Delete"
            variant="ghost"
            size="sm"
            onPress={onDelete}
          />
        </View>
      )}
    </Card>
  );
}

export default function QueueScreen() {
  const [queue, setQueue] = useState<QueuedAction[]>(MOCK_QUEUE);

  const handleRetry = useCallback((itemId: string) => {
    setQueue((prev) =>
      prev.map((item) =>
        item.id === itemId
          ? { ...item, status: 'pending' as QueuedActionStatus, retryCount: 0 }
          : item
      )
    );
    // TODO: Actually retry the action
  }, []);

  const handleDelete = useCallback((itemId: string) => {
    Alert.alert(
      'Delete Queued Action?',
      'This action will be permanently removed from the queue.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            setQueue((prev) => prev.filter((item) => item.id !== itemId));
          },
        },
      ]
    );
  }, []);

  const handleProcessAll = useCallback(() => {
    Alert.alert(
      'Process Queue',
      'This will attempt to send all pending items. Make sure you have an internet connection.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Process',
          onPress: () => {
            // TODO: Actually process queue
            Alert.alert('Processing', 'Queue processing started.');
          },
        },
      ]
    );
  }, []);

  const pendingCount = queue.filter((item) => item.status === 'pending').length;
  const failedCount = queue.filter((item) => item.status === 'failed').length;

  return (
    <View style={styles.container}>
      {/* Summary */}
      <View style={styles.summary}>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryValue}>{pendingCount}</Text>
          <Text style={styles.summaryLabel}>Pending</Text>
        </View>
        <View style={styles.summaryItem}>
          <Text style={[styles.summaryValue, { color: COLORS.error }]}>
            {failedCount}
          </Text>
          <Text style={styles.summaryLabel}>Failed</Text>
        </View>
      </View>

      {/* Process Button */}
      {pendingCount > 0 && (
        <View style={styles.processContainer}>
          <Button
            title="Process Queue"
            variant="primary"
            onPress={handleProcessAll}
          />
        </View>
      )}

      {/* Queue List */}
      <FlatList
        data={queue}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <QueueItem
            item={item}
            onRetry={() => handleRetry(item.id)}
            onDelete={() => handleDelete(item.id)}
          />
        )}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>Queue is empty</Text>
            <Text style={styles.emptySubtext}>
              Actions created offline will appear here
            </Text>
          </View>
        }
      />
    </View>
  );
}

function formatTimeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  summary: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  summaryItem: {
    alignItems: 'center',
  },
  summaryValue: {
    fontSize: TYPOGRAPHY.fontSize.xxl,
    fontWeight: TYPOGRAPHY.fontWeight.bold,
    color: COLORS.text,
  },
  summaryLabel: {
    fontSize: TYPOGRAPHY.fontSize.sm,
    color: COLORS.textSecondary,
  },
  processContainer: {
    padding: SPACING.md,
  },
  list: {
    padding: SPACING.md,
    gap: SPACING.sm,
  },
  itemCard: {
    gap: SPACING.sm,
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  itemType: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  typeLabel: {
    fontSize: TYPOGRAPHY.fontSize.base,
    fontWeight: TYPOGRAPHY.fontWeight.semibold,
    color: COLORS.text,
  },
  space: {
    fontSize: TYPOGRAPHY.fontSize.sm,
    color: COLORS.textSecondary,
  },
  content: {
    fontSize: TYPOGRAPHY.fontSize.sm,
    color: COLORS.text,
  },
  itemMeta: {
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
    marginHorizontal: 4,
  },
  errorText: {
    fontSize: TYPOGRAPHY.fontSize.xs,
    color: COLORS.error,
  },
  itemActions: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginTop: SPACING.xs,
  },
  empty: {
    alignItems: 'center',
    padding: SPACING.xl,
  },
  emptyText: {
    fontSize: TYPOGRAPHY.fontSize.lg,
    fontWeight: TYPOGRAPHY.fontWeight.semibold,
    color: COLORS.text,
  },
  emptySubtext: {
    fontSize: TYPOGRAPHY.fontSize.sm,
    color: COLORS.textSecondary,
    marginTop: SPACING.xs,
  },
});
