/**
 * BreathIndicator - The heartbeat of Tidal UX
 *
 * Visualizes content vitality through animated breathing dots and wave.
 * Replaces traditional engagement numbers with felt sense of life state.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { View, StyleSheet, AccessibilityInfo, Text } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  Easing,
  interpolate,
  interpolateColor,
} from 'react-native-reanimated';

// Breath states based on survival probability
export type BreathState = 'strong' | 'steady' | 'fading' | 'gasping' | 'final';

interface BreathIndicatorProps {
  /** Survival probability from 0-1 */
  survivalProbability: number;
  /** Size variant */
  size?: 'sm' | 'md' | 'lg';
  /** Show wave animation */
  showWave?: boolean;
}

// Map survival probability to breath state
function getBreathState(probability: number): BreathState {
  if (probability >= 0.8) return 'strong';
  if (probability >= 0.5) return 'steady';
  if (probability >= 0.2) return 'fading';
  if (probability >= 0.05) return 'gasping';
  return 'final';
}

// Get number of active dots (out of 5)
function getActiveDots(state: BreathState): number {
  switch (state) {
    case 'strong': return 5;
    case 'steady': return 3;
    case 'fading': return 2;
    case 'gasping': return 1;
    case 'final': return 0;
  }
}

// Get pulse duration based on state (faster = more alive)
function getPulseDuration(state: BreathState): number {
  switch (state) {
    case 'strong': return 1000;
    case 'steady': return 1500;
    case 'fading': return 2500;
    case 'gasping': return 4000; // Irregular, handled separately
    case 'final': return 6000;
  }
}

// Colors for each state
const STATE_COLORS = {
  strong: '#14B8A6', // Vibrant teal
  steady: '#60A5FA', // Soft blue
  fading: '#A78BFA', // Desaturated lavender
  gasping: '#F59E0B', // Warm amber
  final: '#9CA3AF', // Pale gray
};

const INACTIVE_COLOR = '#374151'; // Dark gray for inactive dots

// State label mapping for accessibility
const STATE_LABELS: Record<BreathState, string> = {
  strong: 'Strong',
  steady: 'Steady',
  fading: 'Fading',
  gasping: 'Gasping',
  final: 'Final',
};

export function BreathIndicator({
  survivalProbability,
  size = 'md',
  showWave = true,
}: BreathIndicatorProps) {
  const [reduceMotionEnabled, setReduceMotionEnabled] = useState(false);

  // Check for reduced motion preference
  useEffect(() => {
    const checkReduceMotion = async () => {
      const isEnabled = await AccessibilityInfo.isReduceMotionEnabled();
      setReduceMotionEnabled(isEnabled);
    };
    checkReduceMotion();

    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setReduceMotionEnabled
    );
    return () => subscription.remove();
  }, []);

  const breathState = useMemo(
    () => getBreathState(survivalProbability),
    [survivalProbability]
  );
  const activeDots = useMemo(() => getActiveDots(breathState), [breathState]);
  const pulseDuration = useMemo(() => getPulseDuration(breathState), [breathState]);
  const color = STATE_COLORS[breathState];
  const accessibilityLabel = `Content health: ${STATE_LABELS[breathState]}, ${Math.round(survivalProbability * 100)}% survival`;

  // Animation values
  const pulseProgress = useSharedValue(0);
  const waveProgress = useSharedValue(0);

  // Set up breathing animation (respects reduced motion preference)
  useEffect(() => {
    if (reduceMotionEnabled) {
      // No animations when reduced motion is enabled
      pulseProgress.value = 0.5; // Static midpoint
      waveProgress.value = 0;
      return;
    }

    if (breathState === 'gasping') {
      // Irregular gasping pattern
      pulseProgress.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 800, easing: Easing.inOut(Easing.ease) }),
          withTiming(0, { duration: 400 }),
          withTiming(0.3, { duration: 200 }),
          withTiming(0, { duration: 2600 }),
        ),
        -1,
        false
      );
    } else {
      // Regular breathing
      pulseProgress.value = withRepeat(
        withTiming(1, { duration: pulseDuration, easing: Easing.inOut(Easing.sin) }),
        -1,
        true
      );
    }

    // Wave animation
    if (showWave) {
      waveProgress.value = withRepeat(
        withTiming(1, { duration: 3000, easing: Easing.linear }),
        -1,
        false
      );
    }
  }, [breathState, pulseDuration, showWave, reduceMotionEnabled]);

  // Dot sizes
  const dotSize = size === 'sm' ? 6 : size === 'md' ? 8 : 10;
  const dotGap = size === 'sm' ? 3 : size === 'md' ? 4 : 5;

  return (
    <View
      style={styles.container}
      accessible={true}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="text"
    >
      {/* Breath Dots */}
      <View
        style={[styles.dotsContainer, { gap: dotGap }]}
        accessibilityElementsHidden={true}
        importantForAccessibility="no-hide-descendants"
      >
        {[0, 1, 2, 3, 4].map((index) => (
          <BreathDot
            key={index}
            isActive={index < activeDots}
            color={color}
            size={dotSize}
            pulseProgress={pulseProgress}
            delay={index * 100}
            reduceMotion={reduceMotionEnabled}
          />
        ))}
      </View>

      {/* State label for non-color indication (accessibility) */}
      <Text style={[styles.stateLabel, { color }]}>{STATE_LABELS[breathState]}</Text>

      {/* Life Wave - hidden from accessibility */}
      {showWave && !reduceMotionEnabled && (
        <View accessibilityElementsHidden={true} importantForAccessibility="no-hide-descendants">
          <LifeWave
            color={color}
            progress={waveProgress}
            amplitude={survivalProbability}
            size={size}
          />
        </View>
      )}
    </View>
  );
}

// Individual breath dot with animation
interface BreathDotProps {
  isActive: boolean;
  color: string;
  size: number;
  pulseProgress: Animated.SharedValue<number>;
  delay: number;
  reduceMotion?: boolean;
}

function BreathDot({ isActive, color, size, pulseProgress, delay, reduceMotion = false }: BreathDotProps) {
  const animatedStyle = useAnimatedStyle(() => {
    if (!isActive) {
      return {
        backgroundColor: INACTIVE_COLOR,
        transform: [{ scale: 0.8 }],
        opacity: 0.4,
      };
    }

    // Static display when reduced motion is enabled
    if (reduceMotion) {
      return {
        backgroundColor: color,
        transform: [{ scale: 1 }],
        opacity: 1,
      };
    }

    const scale = interpolate(
      pulseProgress.value,
      [0, 0.5, 1],
      [0.85, 1.15, 0.85]
    );

    const opacity = interpolate(
      pulseProgress.value,
      [0, 0.5, 1],
      [0.7, 1, 0.7]
    );

    return {
      backgroundColor: color,
      transform: [{ scale }],
      opacity,
    };
  }, [isActive, color, reduceMotion]);

  return (
    <Animated.View
      style={[
        styles.dot,
        { width: size, height: size, borderRadius: size / 2 },
        animatedStyle,
      ]}
    />
  );
}

// Animated life wave
interface LifeWaveProps {
  color: string;
  progress: Animated.SharedValue<number>;
  amplitude: number;
  size: 'sm' | 'md' | 'lg';
}

function LifeWave({ color, progress, amplitude, size }: LifeWaveProps) {
  const height = size === 'sm' ? 8 : size === 'md' ? 12 : 16;
  const width = size === 'sm' ? 60 : size === 'md' ? 100 : 140;

  const animatedStyle = useAnimatedStyle(() => {
    const translateX = interpolate(
      progress.value,
      [0, 1],
      [0, -width / 2]
    );

    return {
      transform: [{ translateX }],
      opacity: Math.max(0.3, amplitude),
    };
  }, [amplitude]);

  // Generate wave path points
  const wavePoints = useMemo(() => {
    const points = [];
    const segments = 20;
    for (let i = 0; i <= segments * 2; i++) {
      const x = (i / segments) * width;
      const y = Math.sin((i / segments) * Math.PI * 2) * (height / 2) * amplitude + height / 2;
      points.push({ x, y });
    }
    return points;
  }, [width, height, amplitude]);

  return (
    <View style={[styles.waveContainer, { width, height, overflow: 'hidden' }]}>
      <Animated.View style={[{ width: width * 2, height }, animatedStyle]}>
        {/* Simple wave representation using dots */}
        <View style={[styles.wavePath, { height }]}>
          {wavePoints.map((point, i) => (
            <View
              key={i}
              style={[
                styles.wavePoint,
                {
                  left: point.x,
                  top: point.y - 1,
                  backgroundColor: color,
                },
              ]}
            />
          ))}
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'flex-start',
    gap: 6,
  },
  dotsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dot: {
    // Size set dynamically
  },
  stateLabel: {
    fontSize: 10,
    fontWeight: '500',
    marginTop: 2,
  },
  waveContainer: {
    // Size set dynamically
  },
  wavePath: {
    position: 'relative',
  },
  wavePoint: {
    position: 'absolute',
    width: 2,
    height: 2,
    borderRadius: 1,
  },
});

export default BreathIndicator;
