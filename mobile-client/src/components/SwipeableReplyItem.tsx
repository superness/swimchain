/**
 * SwipeableReplyItem - Reply item with swipe actions
 */

import React, { useCallback } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  runOnJS,
} from 'react-native-reanimated';
import ReactNativeHapticFeedback from 'react-native-haptic-feedback';

import { ReplyItem, ReplyData } from './ReplyItem';
import { COLORS, TOUCH_TARGET_MIN } from '../theme';

const SWIPE_THRESHOLD = 50;
const ACTION_WIDTH = 70;

export interface SwipeableReplyItemProps {
  reply: ReplyData;
  onPress?: () => void;
  onEngage?: () => void;
  onReply?: () => void;
  maxDepth?: number;
}

export function SwipeableReplyItem({
  reply,
  onPress,
  onEngage,
  onReply,
  maxDepth,
}: SwipeableReplyItemProps) {
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
      const clampedX = Math.max(-ACTION_WIDTH, Math.min(ACTION_WIDTH, event.translationX));
      translateX.value = clampedX;
    })
    .onEnd((event) => {
      if (event.translationX > SWIPE_THRESHOLD && onEngage) {
        runOnJS(triggerHaptic)();
        runOnJS(onEngage)();
      } else if (event.translationX < -SWIPE_THRESHOLD && onReply) {
        runOnJS(triggerHaptic)();
        runOnJS(onReply)();
      }
      translateX.value = withSpring(0, { damping: 20, stiffness: 200 });
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const leftActionStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, translateX.value / SWIPE_THRESHOLD),
  }));

  const rightActionStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, -translateX.value / SWIPE_THRESHOLD),
  }));

  return (
    <View style={styles.container}>
      <Animated.View style={[styles.leftAction, leftActionStyle]}>
        <Text style={styles.actionText}>+5s</Text>
      </Animated.View>

      <Animated.View style={[styles.rightAction, rightActionStyle]}>
        <Text style={styles.actionText}>↩</Text>
      </Animated.View>

      <GestureDetector gesture={panGesture}>
        <Animated.View style={animatedStyle}>
          <ReplyItem reply={reply} onPress={onPress} maxDepth={maxDepth} />
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    minHeight: TOUCH_TARGET_MIN,
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
    backgroundColor: COLORS.info,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionText: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.textInverse,
  },
});

export default SwipeableReplyItem;
