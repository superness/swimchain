/**
 * MiningProgress - Full-screen mining progress display
 * Per Step 8: Circular progress, time remaining, cancel button
 */

import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  Easing,
} from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';

import { Button } from './Button';
import { MiningTip } from './MiningTip';
import { MiningProgress as MiningProgressData } from '../native/NativeArgon2';
import { COLORS, SPACING, TYPOGRAPHY, TOUCH_TARGET_MIN } from '../theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CIRCLE_SIZE = Math.min(200, SCREEN_WIDTH * 0.5);
const STROKE_WIDTH = 12;
const RADIUS = (CIRCLE_SIZE - STROKE_WIDTH) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export interface MiningProgressProps {
  /** Progress data from native module */
  progress: MiningProgressData | null;
  /** Estimated total duration (ms) */
  estimatedDuration: number;
  /** Estimated battery usage (%) */
  estimatedBattery: number;
  /** Cancel handler */
  onCancel: () => void;
  /** Continue browsing handler (background mining) */
  onContinueBrowsing?: () => void;
  /** Whether mining is active */
  isActive: boolean;
}

export function MiningProgress({
  progress,
  estimatedDuration,
  estimatedBattery,
  onCancel,
  onContinueBrowsing,
  isActive,
}: MiningProgressProps) {
  // Calculate progress percentage
  const progressPercentage = useMemo(() => {
    if (!progress || !estimatedDuration) return 0;
    return Math.min(100, (progress.elapsedMs / estimatedDuration) * 100);
  }, [progress, estimatedDuration]);

  // Time remaining
  const timeRemaining = useMemo(() => {
    if (!progress) return estimatedDuration / 1000;
    return Math.max(0, progress.estimatedRemainingMs / 1000);
  }, [progress, estimatedDuration]);

  // Format time remaining
  const formattedTime = useMemo(() => {
    const minutes = Math.floor(timeRemaining / 60);
    const seconds = Math.floor(timeRemaining % 60);
    if (minutes > 0) {
      return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }
    return `${seconds}s`;
  }, [timeRemaining]);

  // Hash rate display
  const hashRate = useMemo(() => {
    if (!progress) return '0';
    return (Math.round(progress.hashesPerSecond * 10) / 10).toFixed(1);
  }, [progress]);

  // Stroke dash offset for progress
  const strokeDashoffset = useMemo(() => {
    return CIRCUMFERENCE * (1 - progressPercentage / 100);
  }, [progressPercentage]);

  // Pulse animation for active mining
  const pulseValue = useSharedValue(1);

  React.useEffect(() => {
    if (isActive) {
      pulseValue.value = withRepeat(
        withTiming(1.05, { duration: 1000, easing: Easing.inOut(Easing.ease) }),
        -1,
        true
      );
    } else {
      pulseValue.value = withTiming(1);
    }
  }, [isActive, pulseValue]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseValue.value }],
  }));

  return (
    <View style={styles.container}>
      {/* Circular Progress */}
      <Animated.View style={[styles.progressContainer, animatedStyle]}>
        <Svg width={CIRCLE_SIZE} height={CIRCLE_SIZE}>
          {/* Background circle */}
          <Circle
            cx={CIRCLE_SIZE / 2}
            cy={CIRCLE_SIZE / 2}
            r={RADIUS}
            stroke={COLORS.surface}
            strokeWidth={STROKE_WIDTH}
            fill="none"
          />
          {/* Progress circle */}
          <Circle
            cx={CIRCLE_SIZE / 2}
            cy={CIRCLE_SIZE / 2}
            r={RADIUS}
            stroke={COLORS.mining.progress}
            strokeWidth={STROKE_WIDTH}
            fill="none"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            transform={`rotate(-90 ${CIRCLE_SIZE / 2} ${CIRCLE_SIZE / 2})`}
          />
        </Svg>

        {/* Center content */}
        <View style={styles.centerContent}>
          <Text style={styles.timeText}>{formattedTime}</Text>
          <Text style={styles.percentText}>{Math.round(progressPercentage)}%</Text>
        </View>
      </Animated.View>

      {/* Stats */}
      <View style={styles.statsContainer}>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{hashRate}</Text>
          <Text style={styles.statLabel}>H/s</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.stat}>
          <Text style={styles.statValue}>~{Math.round(estimatedBattery)}%</Text>
          <Text style={styles.statLabel}>Battery</Text>
        </View>
      </View>

      {/* Mining Tip */}
      <View style={styles.tipContainer}>
        <MiningTip active={isActive} />
      </View>

      {/* Buttons */}
      <View style={styles.buttonContainer}>
        <Button
          title="Cancel"
          variant="danger"
          onPress={onCancel}
          haptic="medium"
          style={styles.cancelButton}
        />
        {onContinueBrowsing && (
          <Button
            title="Continue Browsing"
            variant="secondary"
            onPress={onContinueBrowsing}
            style={styles.browseButton}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.mining.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.lg,
  },
  progressContainer: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.xl,
  },
  centerContent: {
    position: 'absolute',
    alignItems: 'center',
  },
  timeText: {
    fontSize: TYPOGRAPHY.fontSize.xxl,
    fontWeight: TYPOGRAPHY.fontWeight.bold,
    color: COLORS.mining.text,
  },
  percentText: {
    fontSize: TYPOGRAPHY.fontSize.base,
    color: COLORS.mining.text,
    opacity: 0.7,
  },
  statsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.lg,
  },
  stat: {
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
  },
  statValue: {
    fontSize: TYPOGRAPHY.fontSize.lg,
    fontWeight: TYPOGRAPHY.fontWeight.semibold,
    color: COLORS.mining.text,
  },
  statLabel: {
    fontSize: TYPOGRAPHY.fontSize.sm,
    color: COLORS.mining.text,
    opacity: 0.7,
  },
  statDivider: {
    width: 1,
    height: 32,
    backgroundColor: COLORS.mining.text,
    opacity: 0.3,
  },
  tipContainer: {
    paddingHorizontal: SPACING.xl,
    marginBottom: SPACING.xl,
    minHeight: 60,
  },
  buttonContainer: {
    width: '100%',
    gap: SPACING.sm,
  },
  cancelButton: {
    minHeight: TOUCH_TARGET_MIN,
  },
  browseButton: {
    minHeight: TOUCH_TARGET_MIN,
  },
});

export default MiningProgress;
