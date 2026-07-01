/**
 * Button - Touch-optimized button component
 * Enforces 44pt minimum touch targets
 */

import React from 'react';
import { StyleSheet, Text, ViewStyle, TextStyle, ActivityIndicator } from 'react-native';

import { TouchPressable, HapticType } from './TouchPressable';
import { COLORS, SPACING, BORDER_RADIUS, TYPOGRAPHY, TOUCH_TARGET_MIN } from '../theme';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps {
  /** Button text */
  title: string;
  /** Button variant (default: 'primary') */
  variant?: ButtonVariant;
  /** Button size (default: 'md') */
  size?: ButtonSize;
  /** Disabled state */
  disabled?: boolean;
  /** Loading state */
  loading?: boolean;
  /** Press handler */
  onPress?: () => void;
  /** Haptic feedback type (default based on variant) */
  haptic?: HapticType;
  /** Additional container style */
  style?: ViewStyle;
  /** Additional text style */
  textStyle?: TextStyle;
  /** Accessibility label */
  accessibilityLabel?: string;
}

const VARIANT_STYLES: Record<ButtonVariant, { container: ViewStyle; text: TextStyle }> = {
  primary: {
    container: { backgroundColor: COLORS.primary },
    text: { color: COLORS.textInverse },
  },
  secondary: {
    container: { backgroundColor: COLORS.surface },
    text: { color: COLORS.text },
  },
  outline: {
    container: { backgroundColor: 'transparent', borderWidth: 1, borderColor: COLORS.primary },
    text: { color: COLORS.primary },
  },
  ghost: {
    container: { backgroundColor: 'transparent' },
    text: { color: COLORS.primary },
  },
  danger: {
    container: { backgroundColor: COLORS.error },
    text: { color: COLORS.textInverse },
  },
};

const SIZE_STYLES: Record<ButtonSize, { container: ViewStyle; text: TextStyle }> = {
  sm: {
    container: { paddingVertical: SPACING.xs, paddingHorizontal: SPACING.md },
    text: { fontSize: TYPOGRAPHY.fontSize.sm },
  },
  md: {
    container: { paddingVertical: SPACING.sm, paddingHorizontal: SPACING.lg },
    text: { fontSize: TYPOGRAPHY.fontSize.base },
  },
  lg: {
    container: { paddingVertical: SPACING.md, paddingHorizontal: SPACING.xl },
    text: { fontSize: TYPOGRAPHY.fontSize.md },
  },
};

export function Button({
  title,
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  onPress,
  haptic,
  style,
  textStyle,
  accessibilityLabel,
}: ButtonProps) {
  const variantStyle = VARIANT_STYLES[variant];
  const sizeStyle = SIZE_STYLES[size];

  // Default haptic based on variant
  const defaultHaptic: HapticType = variant === 'danger' ? 'medium' : 'light';

  return (
    <TouchPressable
      style={[styles.container, variantStyle.container, sizeStyle.container, style]}
      onPress={onPress}
      disabled={disabled || loading}
      haptic={haptic ?? defaultHaptic}
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || loading }}
    >
      {loading ? (
        <ActivityIndicator
          color={variantStyle.text.color}
          size={size === 'lg' ? 'small' : 'small'}
        />
      ) : (
        <Text style={[styles.text, variantStyle.text, sizeStyle.text, textStyle]}>
          {title}
        </Text>
      )}
    </TouchPressable>
  );
}

const styles = StyleSheet.create({
  container: {
    minHeight: TOUCH_TARGET_MIN,
    borderRadius: BORDER_RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  text: {
    fontWeight: TYPOGRAPHY.fontWeight.semibold,
    textAlign: 'center',
  },
});

export default Button;
