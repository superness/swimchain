/**
 * MiningTip - Rotating educational tips during mining
 */

import React, { useState, useEffect } from 'react';
import { Text, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSequence,
} from 'react-native-reanimated';

import { COLORS, TYPOGRAPHY, ANIMATION } from '../theme';
import { MINING_TIPS, TIP_ROTATION_INTERVAL_MS, createTipSequence } from '../constants/miningTips';

export interface MiningTipProps {
  /** Whether tip rotation is active */
  active?: boolean;
}

export function MiningTip({ active = true }: MiningTipProps) {
  const [tip, setTip] = useState(MINING_TIPS[0]);
  const [getTip] = useState(() => createTipSequence());

  const opacity = useSharedValue(1);

  // Rotate tips when active
  useEffect(() => {
    if (!active) return;

    const interval = setInterval(() => {
      // Fade out
      opacity.value = withSequence(
        withTiming(0, { duration: ANIMATION.fast }),
        withTiming(1, { duration: ANIMATION.fast })
      );

      // Change tip after fade out
      setTimeout(() => {
        setTip(getTip());
      }, ANIMATION.fast);
    }, TIP_ROTATION_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [active, getTip, opacity]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return (
    <Animated.View style={animatedStyle}>
      <Text style={styles.tip}>{tip}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  tip: {
    fontSize: TYPOGRAPHY.fontSize.sm,
    color: COLORS.mining.text,
    textAlign: 'center',
    fontStyle: 'italic',
    opacity: 0.9,
    lineHeight: TYPOGRAPHY.fontSize.sm * TYPOGRAPHY.lineHeight.relaxed,
  },
});

export default MiningTip;
