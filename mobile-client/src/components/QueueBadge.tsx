/**
 * QueueBadge - Shows pending offline queue count
 * Per Step 10: Badge on Profile tab icon
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

import { COLORS, TYPOGRAPHY } from '../theme';

export interface QueueBadgeProps {
  count: number;
  max?: number;
}

export function QueueBadge({ count, max = 99 }: QueueBadgeProps) {
  if (count <= 0) return null;

  const displayCount = count > max ? `${max}+` : count.toString();

  return (
    <View style={styles.badge}>
      <Text style={styles.text}>{displayCount}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    position: 'absolute',
    top: -4,
    right: -8,
    backgroundColor: COLORS.error,
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderWidth: 2,
    borderColor: COLORS.background,
  },
  text: {
    color: COLORS.textInverse,
    fontSize: TYPOGRAPHY.fontSize.xs,
    fontWeight: TYPOGRAPHY.fontWeight.bold,
    lineHeight: 14,
  },
});

export default QueueBadge;
