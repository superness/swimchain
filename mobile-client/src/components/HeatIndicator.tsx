/**
 * HeatIndicator - Displays content heat/decay status
 * Port from forum-client with mobile optimizations
 * Per SPEC_09: Engagement pool decay visualization
 */

import React, { useMemo } from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
} from 'react-native-reanimated';

import { COLORS, BORDER_RADIUS, ANIMATION } from '../theme';
import { getHeatLevel, getHeatColor, HeatLevel } from '../theme/colors';

export interface HeatIndicatorProps {
  /** Decay percentage (0-100) */
  decayPercentage: number;
  /** Size variant */
  size?: 'sm' | 'md' | 'lg';
  /** Show pulse animation for hot content */
  animated?: boolean;
  /** Additional style */
  style?: ViewStyle;
}

const SIZE_MAP = {
  sm: { width: 8, height: 8 },
  md: { width: 12, height: 12 },
  lg: { width: 16, height: 16 },
};

export function HeatIndicator({
  decayPercentage,
  size = 'md',
  animated = true,
  style,
}: HeatIndicatorProps) {
  const heatLevel = useMemo(() => getHeatLevel(decayPercentage), [decayPercentage]);
  const heatColor = useMemo(() => getHeatColor(decayPercentage), [decayPercentage]);
  const sizeStyle = SIZE_MAP[size];

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

  const accessibilityLabel = `Content heat: ${heatLevelLabel}, ${Math.round(100 - decayPercentage)}% remaining`;

  // Pulse animation for hot content
  const pulseValue = useSharedValue(1);

  React.useEffect(() => {
    if (animated && heatLevel === 'full') {
      pulseValue.value = withRepeat(
        withTiming(1.2, { duration: 500 }),
        -1,
        true
      );
    } else {
      pulseValue.value = withTiming(1, { duration: ANIMATION.fast });
    }
  }, [animated, heatLevel, pulseValue]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseValue.value }],
  }));

  return (
    <Animated.View
      accessible
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}
      style={[
        styles.container,
        sizeStyle,
        { backgroundColor: heatColor },
        animatedStyle,
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: BORDER_RADIUS.full,
  },
});

export default HeatIndicator;
