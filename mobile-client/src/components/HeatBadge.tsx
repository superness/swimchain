/**
 * HeatBadge - Compact heat indicator badge
 * 24pt × 24pt for use in list items
 */

import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';

import { COLORS, TYPOGRAPHY, BORDER_RADIUS } from '../theme';
import { getHeatLevel, getHeatColor, HeatLevel } from '../theme/colors';

export interface HeatBadgeProps {
  /** Decay percentage (0-100) */
  decayPercentage: number;
  /** Current seconds in engagement pool */
  poolSeconds?: number;
  /** Additional style */
  style?: ViewStyle;
}

export function HeatBadge({ decayPercentage, poolSeconds, style }: HeatBadgeProps) {
  const heatColor = useMemo(() => getHeatColor(decayPercentage), [decayPercentage]);
  const heatLevel = useMemo(() => getHeatLevel(decayPercentage), [decayPercentage]);

  // Generate human-readable heat level name for accessibility
  const heatLevelLabel = useMemo(() => {
    const labels: Record<HeatLevel, string> = {
      full: 'Hot',
      warm: 'Warm',
      cooling: 'Cooling',
      fading: 'Fading',
      decayed: 'Cold',
    };
    return labels[heatLevel];
  }, [heatLevel]);

  // Show seconds or heat indicator
  const displayText = useMemo(() => {
    if (poolSeconds !== undefined) {
      return `${poolSeconds}s`;
    }
    // Show heat emoji based on level
    switch (heatLevel) {
      case 'full':
        return '🔥';
      case 'warm':
        return '🟠';
      case 'cooling':
        return '🟡';
      case 'fading':
        return '⚪';
      case 'decayed':
        return '⬛';
    }
  }, [poolSeconds, heatLevel]);

  const accessibilityLabel = poolSeconds !== undefined
    ? `Pool contribution: ${poolSeconds} seconds`
    : `Content heat: ${heatLevelLabel}, ${Math.round(100 - decayPercentage)}% remaining`;

  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={accessibilityLabel}
      style={[styles.container, { backgroundColor: heatColor + '20' }, style]}
    >
      <Text style={[styles.text, { color: heatColor }]}>{displayText}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: 36,
    height: 24,
    borderRadius: BORDER_RADIUS.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    fontSize: TYPOGRAPHY.fontSize.xs,
    fontWeight: TYPOGRAPHY.fontWeight.semibold,
  },
});

export default HeatBadge;
