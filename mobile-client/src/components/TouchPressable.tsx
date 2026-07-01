/**
 * TouchPressable - Touch-optimized Pressable wrapper
 * Enforces 44pt minimum touch targets per CLIENT_DESIGN.md §6.1
 * Includes haptic feedback per plan Step 5
 */

import React, { useCallback } from 'react';
import {
  Pressable,
  PressableProps,
  StyleSheet,
  StyleProp,
  ViewStyle,
} from 'react-native';
import ReactNativeHapticFeedback from 'react-native-haptic-feedback';

import { TOUCH_TARGET_MIN, ANIMATION } from '../theme';

// Haptic feedback types
export type HapticType = 'light' | 'medium' | 'heavy' | 'selection' | 'success' | 'error' | 'none';

// Map haptic types to native feedback
const HAPTIC_MAP: Record<HapticType, string | null> = {
  light: 'impactLight',
  medium: 'impactMedium',
  heavy: 'impactHeavy',
  selection: 'selection',
  success: 'notificationSuccess',
  error: 'notificationError',
  none: null,
};

export interface TouchPressableProps extends PressableProps {
  /** Minimum touch target size in points (default: 44) */
  minSize?: number;
  /** Haptic feedback type (default: 'light') */
  haptic?: HapticType;
  /** Custom styles */
  style?: StyleProp<ViewStyle>;
  /** Pressed state styles */
  pressedStyle?: ViewStyle;
  /** Disabled opacity (default: 0.5) */
  disabledOpacity?: number;
}

/**
 * Touch-optimized Pressable component with haptic feedback
 */
export function TouchPressable({
  minSize = TOUCH_TARGET_MIN,
  haptic = 'light',
  style,
  pressedStyle = { opacity: 0.8 },
  disabledOpacity = 0.5,
  onPress,
  disabled,
  children,
  accessibilityRole = 'button',
  ...props
}: TouchPressableProps) {
  // Handle press with haptic feedback
  const handlePress = useCallback(
    (event: any) => {
      // Trigger haptic feedback
      const hapticType = HAPTIC_MAP[haptic];
      if (hapticType && !disabled) {
        ReactNativeHapticFeedback.trigger(hapticType, {
          enableVibrateFallback: true,
          ignoreAndroidSystemSettings: false,
        });
      }

      // Call original onPress
      onPress?.(event);
    },
    [haptic, disabled, onPress]
  );

  // Calculate hitSlop to ensure minimum touch target
  const calculateHitSlop = useCallback(
    (layoutStyle: ViewStyle | undefined): {
      top: number;
      bottom: number;
      left: number;
      right: number;
    } => {
      const height = (layoutStyle?.height as number) || 0;
      const width = (layoutStyle?.width as number) || 0;

      return {
        top: Math.max(0, (minSize - height) / 2),
        bottom: Math.max(0, (minSize - height) / 2),
        left: Math.max(0, (minSize - width) / 2),
        right: Math.max(0, (minSize - width) / 2),
      };
    },
    [minSize]
  );

  // Flatten style to get dimensions for hitSlop calculation
  const flatStyle = StyleSheet.flatten(style) as ViewStyle | undefined;
  const hitSlop = calculateHitSlop(flatStyle);

  return (
    <Pressable
      {...props}
      style={({ pressed }) => [
        styles.base,
        flatStyle,
        pressed && !disabled && pressedStyle,
        disabled && { opacity: disabledOpacity },
      ]}
      onPress={handlePress}
      disabled={disabled}
      hitSlop={hitSlop}
      accessibilityRole={accessibilityRole}
      accessible={true}
    >
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: TOUCH_TARGET_MIN,
    minWidth: TOUCH_TARGET_MIN,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default TouchPressable;
