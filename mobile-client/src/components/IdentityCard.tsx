/**
 * IdentityCard - Displays user identity information
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

import { Card } from './Card';
import { AddressDisplay } from './AddressDisplay';
import { Button } from './Button';
import { COLORS, SPACING, TYPOGRAPHY } from '../theme';

export interface IdentityCardProps {
  address: string;
  createdAt: number;
  postCount: number;
  onExport?: () => void;
}

export function IdentityCard({
  address,
  createdAt,
  postCount,
  onExport,
}: IdentityCardProps) {
  const createdDate = new Date(createdAt).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <Card style={styles.container}>
      <Text style={styles.title}>Your Identity</Text>

      <AddressDisplay
        address={address}
        format="truncated"
        label="Address"
        copyable
      />

      <View style={styles.stats}>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{postCount}</Text>
          <Text style={styles.statLabel}>Posts</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{createdDate}</Text>
          <Text style={styles.statLabel}>Created</Text>
        </View>
      </View>

      {onExport && (
        <Button
          title="Export Identity"
          variant="outline"
          size="sm"
          onPress={onExport}
          style={styles.exportButton}
        />
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: SPACING.md,
  },
  title: {
    fontSize: TYPOGRAPHY.fontSize.lg,
    fontWeight: TYPOGRAPHY.fontWeight.bold,
    color: COLORS.text,
  },
  stats: {
    flexDirection: 'row',
    gap: SPACING.xl,
  },
  stat: {
    gap: 2,
  },
  statValue: {
    fontSize: TYPOGRAPHY.fontSize.md,
    fontWeight: TYPOGRAPHY.fontWeight.semibold,
    color: COLORS.text,
  },
  statLabel: {
    fontSize: TYPOGRAPHY.fontSize.xs,
    color: COLORS.textSecondary,
  },
  exportButton: {
    alignSelf: 'flex-start',
  },
});

export default IdentityCard;
