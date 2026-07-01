/**
 * SwipeableThreadCard - Thread card with swipe actions
 * Per Step 9: Swipe right to engage, swipe left to expand
 */

import React, { useCallback } from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  runOnJS,
} from 'react-native-reanimated';
import ReactNativeHapticFeedback from 'react-native-haptic-feedback';

import { ThreadCard, ThreadData } from './ThreadCard';
import { COLORS, SPACING, LAYOUT } from '../theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const SWIPE_THRESHOLD = 50;
const ACTION_WIDTH = 80;

export interface SwipeableThreadCardProps {
  thread: ThreadData;
  onPress: () => void;
  onSwipeRight?: () => void; // Engage
  onSwipeLeft?: () => void; // Expand
}

export function SwipeableThreadCard({
  thread,
  onPress,
  onSwipeRight,
  onSwipeLeft,
}: SwipeableThreadCardProps) {
  const translateX = useSharedValue(0);

  const triggerHaptic = useCallback(() => {
    ReactNativeHapticFeedback.trigger('impactMedium', {
      enableVibrateFallback: true,
      ignoreAndroidSystemSettings: false,
    });
  }, []);

  const panGesture = Gesture.Pan()
    .activeOffsetX([-10, 10])
    .onUpdate((event) => {
      // Limit translation
      const clampedX = Math.max(-ACTION_WIDTH, Math.min(ACTION_WIDTH, event.translationX));
      translateX.value = clampedX;
    })
    .onEnd((event) => {
      if (event.translationX > SWIPE_THRESHOLD && onSwipeRight) {
        // Swipe right - engage
        runOnJS(triggerHaptic)();
        runOnJS(onSwipeRight)();
      } else if (event.translationX < -SWIPE_THRESHOLD && onSwipeLeft) {
        // Swipe left - expand
        runOnJS(triggerHaptic)();
        runOnJS(onSwipeLeft)();
      }

      // Snap back
      translateX.value = withSpring(0, { damping: 20, stiffness: 200 });
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const leftActionStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, translateX.value / SWIPE_THRESHOLD),
    transform: [{ scale: Math.min(1, 0.5 + translateX.value / (SWIPE_THRESHOLD * 2)) }],
  }));

  const rightActionStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, -translateX.value / SWIPE_THRESHOLD),
    transform: [{ scale: Math.min(1, 0.5 + -translateX.value / (SWIPE_THRESHOLD * 2)) }],
  }));

  return (
    <View style={styles.container}>
      {/* Left action (swipe right reveals) */}
      <Animated.View style={[styles.leftAction, leftActionStyle]}>
        <Text style={styles.actionText}>+5s</Text>
        <Text style={styles.actionLabel}>Engage</Text>
      </Animated.View>

      {/* Right action (swipe left reveals) */}
      <Animated.View style={[styles.rightAction, rightActionStyle]}>
        <Text style={styles.actionText}>→</Text>
        <Text style={styles.actionLabel}>Expand</Text>
      </Animated.View>

      {/* Card */}
      <GestureDetector gesture={panGesture}>
        <Animated.View style={animatedStyle}>
          <ThreadCard thread={thread} onPress={onPress} />
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: LAYOUT.threadCardHeight,
  },
  leftAction: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: ACTION_WIDTH,
    backgroundColor: COLORS.success,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rightAction: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: ACTION_WIDTH,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionText: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.textInverse,
  },
  actionLabel: {
    fontSize: 12,
    color: COLORS.textInverse,
    opacity: 0.8,
  },
});

export default SwipeableThreadCard;
