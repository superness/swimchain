/**
 * TendGesture - Hold-to-tend interaction
 *
 * Users hold to contribute PoW to content. Visual feedback shows
 * breath being transferred from user to content.
 */

import React, { useState, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  runOnJS,
  Easing,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import ReactNativeHapticFeedback from 'react-native-haptic-feedback';

import { COLORS, SPACING, TYPOGRAPHY, BORDER_RADIUS } from '../../theme';

interface TendGestureProps {
  /** Content ID to tend */
  contentId: string;
  /** Current breath state for visual feedback */
  currentBreaths: number;
  /** Callback when tending starts */
  onTendStart?: () => void;
  /** Callback with progress updates during tend (0-1) */
  onTendProgress?: (progress: number) => void;
  /** Callback when tending completes with seconds contributed */
  onTendComplete?: (seconds: number) => void;
  /** Callback when tending is cancelled */
  onTendCancel?: () => void;
  /** Whether PoW mining is in progress */
  isMining?: boolean;
  /** Disable interaction */
  disabled?: boolean;
}

// Tend durations in seconds
const TEND_TIERS = [5, 15, 30] as const;
type TendTier = typeof TEND_TIERS[number];

// How long to hold for each tier (in ms)
const TIER_THRESHOLDS: Record<TendTier, number> = {
  5: 1000,
  15: 2500,
  30: 5000,
};

export function TendGesture({
  contentId,
  currentBreaths,
  onTendStart,
  onTendProgress,
  onTendComplete,
  onTendCancel,
  isMining = false,
  disabled = false,
}: TendGestureProps) {
  const [isTending, setIsTending] = useState(false);
  const [selectedTier, setSelectedTier] = useState<TendTier | null>(null);
  const holdStartTime = useRef<number>(0);
  const progressInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  // Animation values
  const scale = useSharedValue(1);
  const rippleScale = useSharedValue(0);
  const rippleOpacity = useSharedValue(0);
  const progress = useSharedValue(0);
  const glowOpacity = useSharedValue(0);
  const ringProgress = useSharedValue(0); // Progress ring for continuous feedback

  // Determine which tier based on hold duration
  const getTierForDuration = useCallback((durationMs: number): TendTier => {
    if (durationMs >= TIER_THRESHOLDS[30]) return 30;
    if (durationMs >= TIER_THRESHOLDS[15]) return 15;
    return 5;
  }, []);

  // Start tending
  const handleTendStart = useCallback(() => {
    if (disabled || isMining) return;

    setIsTending(true);
    holdStartTime.current = Date.now();

    // Haptic feedback
    ReactNativeHapticFeedback.trigger('impactLight');

    // Visual feedback
    scale.value = withSpring(0.95);
    rippleScale.value = 0;
    rippleOpacity.value = 0.6;
    rippleScale.value = withTiming(3, { duration: 2000, easing: Easing.out(Easing.ease) });
    rippleOpacity.value = withTiming(0, { duration: 2000 });
    glowOpacity.value = withTiming(0.8, { duration: 300 });

    onTendStart?.();

    // Start continuous ring animation for progressive feedback
    ringProgress.value = withTiming(1, {
      duration: TIER_THRESHOLDS[30],
      easing: Easing.linear,
    });

    // Progress updates
    progressInterval.current = setInterval(() => {
      const elapsed = Date.now() - holdStartTime.current;
      const maxDuration = TIER_THRESHOLDS[30];
      const currentProgress = Math.min(elapsed / maxDuration, 1);
      progress.value = currentProgress;

      const newTier = getTierForDuration(elapsed);
      setSelectedTier(newTier);

      onTendProgress?.(currentProgress);

      // Haptic at tier transitions
      if (elapsed >= TIER_THRESHOLDS[15] && elapsed < TIER_THRESHOLDS[15] + 100) {
        ReactNativeHapticFeedback.trigger('impactMedium');
      }
      if (elapsed >= TIER_THRESHOLDS[30] && elapsed < TIER_THRESHOLDS[30] + 100) {
        ReactNativeHapticFeedback.trigger('impactHeavy');
      }
    }, 50);
  }, [disabled, isMining, onTendStart, onTendProgress, getTierForDuration]);

  // End tending
  const handleTendEnd = useCallback(() => {
    if (!isTending) return;

    const elapsed = Date.now() - holdStartTime.current;
    const tier = getTierForDuration(elapsed);

    // Clear interval
    if (progressInterval.current) {
      clearInterval(progressInterval.current);
      progressInterval.current = null;
    }

    // Reset visuals
    scale.value = withSpring(1);
    glowOpacity.value = withTiming(0, { duration: 300 });
    ringProgress.value = withTiming(0, { duration: 200 }); // Reset ring

    setIsTending(false);

    // Only complete if held long enough for minimum tier
    if (elapsed >= TIER_THRESHOLDS[5]) {
      ReactNativeHapticFeedback.trigger('notificationSuccess');
      onTendComplete?.(tier);
    } else {
      onTendCancel?.();
    }

    setSelectedTier(null);
    progress.value = withTiming(0, { duration: 300 });
  }, [isTending, getTierForDuration, onTendComplete, onTendCancel]);

  // Cancel tending
  const handleTendCancel = useCallback(() => {
    if (!isTending) return;

    if (progressInterval.current) {
      clearInterval(progressInterval.current);
      progressInterval.current = null;
    }

    scale.value = withSpring(1);
    glowOpacity.value = withTiming(0, { duration: 300 });
    progress.value = withTiming(0, { duration: 300 });
    ringProgress.value = withTiming(0, { duration: 200 }); // Reset ring

    setIsTending(false);
    setSelectedTier(null);
    onTendCancel?.();
  }, [isTending, onTendCancel]);

  // Gesture handler
  const longPressGesture = Gesture.LongPress()
    .minDuration(100)
    .onStart(() => {
      runOnJS(handleTendStart)();
    })
    .onEnd(() => {
      runOnJS(handleTendEnd)();
    })
    .onTouchesCancelled(() => {
      runOnJS(handleTendCancel)();
    });

  // Animated styles
  const containerStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const rippleStyle = useAnimatedStyle(() => ({
    transform: [{ scale: rippleScale.value }],
    opacity: rippleOpacity.value,
  }));

  const glowStyle = useAnimatedStyle(() => ({
    opacity: glowOpacity.value,
  }));

  const progressStyle = useAnimatedStyle(() => ({
    width: `${progress.value * 100}%`,
  }));

  // Animated progress ring style for continuous visual feedback
  // Uses rotation to show progress (0 to 360 degrees)
  const ringStyle = useAnimatedStyle(() => {
    // Rotate from -45deg (initial) through 315deg (full) based on progress
    const rotation = -45 + ringProgress.value * 360;
    return {
      transform: [{ rotate: `${rotation}deg` }],
    };
  });

  return (
    <GestureDetector gesture={longPressGesture}>
      <Animated.View style={[styles.container, containerStyle]}>
        {/* Ripple effect */}
        <Animated.View style={[styles.ripple, rippleStyle]} />

        {/* Glow effect when tending */}
        <Animated.View style={[styles.glow, glowStyle]} />

        {/* Main content */}
        <View style={styles.content}>
          {isTending ? (
            <>
              {/* Progress ring for continuous visual feedback */}
              <View style={styles.ringContainer}>
                <View style={styles.ringBackground} />
                <Animated.View
                  style={[styles.ringProgress, ringStyle]}
                />
                <Text style={styles.ringText}>
                  {selectedTier ? `${selectedTier}s` : '...'}
                </Text>
              </View>
              <Text style={styles.tendingText}>Tending...</Text>
              <View style={styles.tierIndicator}>
                {TEND_TIERS.map((tier) => (
                  <View
                    key={tier}
                    style={[
                      styles.tierDot,
                      selectedTier !== null && tier <= selectedTier && styles.tierDotActive,
                    ]}
                  >
                    <Text style={[
                      styles.tierText,
                      selectedTier !== null && tier <= selectedTier && styles.tierTextActive,
                    ]}>
                      {tier}s
                    </Text>
                  </View>
                ))}
              </View>
              <View style={styles.progressBar}>
                <Animated.View style={[styles.progressFill, progressStyle]} />
              </View>
            </>
          ) : (
            <>
              <Text style={styles.holdText}>Hold to Tend</Text>
              <View style={styles.tierPreview}>
                <Text style={styles.tierPreviewText}>5s</Text>
                <Text style={styles.tierPreviewDivider}>|</Text>
                <Text style={styles.tierPreviewText}>15s</Text>
                <Text style={styles.tierPreviewDivider}>|</Text>
                <Text style={styles.tierPreviewText}>30s</Text>
              </View>
            </>
          )}
        </View>

        {/* Disabled overlay */}
        {(disabled || isMining) && (
          <View style={styles.disabledOverlay}>
            <Text style={styles.disabledText}>
              {isMining ? 'Mining...' : 'Unavailable'}
            </Text>
          </View>
        )}
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    borderRadius: BORDER_RADIUS.lg,
    backgroundColor: COLORS.surface,
    overflow: 'hidden',
  },
  ripple: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    width: 50,
    height: 50,
    marginLeft: -25,
    marginTop: -25,
    borderRadius: 25,
    backgroundColor: '#14B8A6',
  },
  glow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#14B8A6',
    opacity: 0.2,
  },
  content: {
    padding: SPACING.md,
    alignItems: 'center',
    gap: SPACING.sm,
  },
  holdText: {
    fontSize: TYPOGRAPHY.fontSize.base,
    fontWeight: '600',
    color: COLORS.text,
  },
  tendingText: {
    fontSize: TYPOGRAPHY.fontSize.base,
    fontWeight: '600',
    color: '#14B8A6',
  },
  tierIndicator: {
    flexDirection: 'row',
    gap: SPACING.md,
  },
  tierDot: {
    alignItems: 'center',
    opacity: 0.4,
  },
  tierDotActive: {
    opacity: 1,
  },
  tierText: {
    fontSize: TYPOGRAPHY.fontSize.sm,
    color: COLORS.textSecondary,
  },
  tierTextActive: {
    color: '#14B8A6',
    fontWeight: '600',
  },
  tierPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  tierPreviewText: {
    fontSize: TYPOGRAPHY.fontSize.xs,
    color: COLORS.textTertiary,
  },
  tierPreviewDivider: {
    fontSize: TYPOGRAPHY.fontSize.xs,
    color: COLORS.border,
  },
  progressBar: {
    width: '100%',
    height: 4,
    backgroundColor: COLORS.border,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#14B8A6',
  },
  ringContainer: {
    width: 64,
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.xs,
  },
  ringBackground: {
    position: 'absolute',
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 4,
    borderColor: 'rgba(20, 184, 166, 0.2)',
  },
  ringProgress: {
    position: 'absolute',
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 4,
    borderColor: '#14B8A6',
    borderLeftColor: 'transparent',
    borderBottomColor: 'transparent',
    transform: [{ rotate: '-45deg' }],
  },
  ringText: {
    fontSize: TYPOGRAPHY.fontSize.lg,
    fontWeight: '700',
    color: '#14B8A6',
  },
  disabledOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  disabledText: {
    fontSize: TYPOGRAPHY.fontSize.sm,
    color: COLORS.textSecondary,
  },
});

export default TendGesture;
