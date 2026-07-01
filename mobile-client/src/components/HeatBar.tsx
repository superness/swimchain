/**
 * HeatBar - Progress bar showing engagement pool status
 * Per SPEC_09: Engagement pool with 60s total requirement
 */

import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated';

import { COLORS, SPACING, BORDER_RADIUS, TYPOGRAPHY, TOUCH_TARGET_MIN, ANIMATION } from '../theme';
import { getHeatColor, getTimeUntilDecay } from '../theme/colors';
import { ENGAGEMENT_POOL } from '../constants/protocol';

export interface HeatBarProps {
  /** Current seconds in pool */
  currentSeconds: number;
  /** Required seconds for full pool (default: 60) */
  requiredSeconds?: number;
  /** Last engagement timestamp for decay calculation */
  lastEngagement?: number;
  /** Show time remaining label */
  showTimeRemaining?: boolean;
  /** Additional style */
  style?: ViewStyle;
}

export function HeatBar({
  currentSeconds,
  requiredSeconds = ENGAGEMENT_POOL.requiredSeconds,
  lastEngagement,
  showTimeRemaining = false,
  style,
}: HeatBarProps) {
  const fillPercentage = useMemo(
    () => Math.min(100, (currentSeconds / requiredSeconds) * 100),
    [currentSeconds, requiredSeconds]
  );

  const decayPercentage = useMemo(() => {
    if (!lastEngagement) return 0;
    const now = Date.now();
    const decayPeriodMs = 24 * 60 * 60 * 1000; // 24 hours
    return Math.min(100, ((now - lastEngagement) / decayPeriodMs) * 100);
  }, [lastEngagement]);

  const fillColor = useMemo(() => getHeatColor(decayPercentage), [decayPercentage]);

  const timeRemaining = useMemo(() => {
    if (!lastEngagement) return null;
    return getTimeUntilDecay(lastEngagement);
  }, [lastEngagement]);

  // Animate fill width
  const fillWidth = useSharedValue(0);

  React.useEffect(() => {
    fillWidth.value = withTiming(fillPercentage, { duration: ANIMATION.normal });
  }, [fillPercentage, fillWidth]);

  const animatedFillStyle = useAnimatedStyle(() => ({
    width: `${fillWidth.value}%`,
  }));

  return (
    <View style={[styles.container, style]}>
      <View style={styles.barContainer}>
        <View style={styles.barBackground}>
          <Animated.View
            style={[styles.barFill, { backgroundColor: fillColor }, animatedFillStyle]}
          />
        </View>
        <Text style={styles.label}>
          {currentSeconds}s / {requiredSeconds}s
        </Text>
      </View>
      {showTimeRemaining && timeRemaining && (
        <Text style={styles.timeRemaining}>{timeRemaining} until decay</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    minHeight: TOUCH_TARGET_MIN,
    justifyContent: 'center',
  },
  barContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  barBackground: {
    flex: 1,
    height: 8,
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.full,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: BORDER_RADIUS.full,
  },
  label: {
    fontSize: TYPOGRAPHY.fontSize.sm,
    color: COLORS.textSecondary,
    minWidth: 70,
    textAlign: 'right',
  },
  timeRemaining: {
    fontSize: TYPOGRAPHY.fontSize.xs,
    color: COLORS.textTertiary,
    marginTop: SPACING.xs,
  },
});

export default HeatBar;
