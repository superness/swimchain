/**
 * Card - Container component for content cards
 */

import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';

import { COLORS, SPACING, BORDER_RADIUS, SHADOWS } from '../theme';

export interface CardProps {
  children: React.ReactNode;
  /** Card elevation level */
  elevation?: 'none' | 'sm' | 'md' | 'lg';
  /** Additional style */
  style?: ViewStyle;
  /** Padding inside card */
  padding?: keyof typeof SPACING | 'none';
}

export function Card({
  children,
  elevation = 'sm',
  style,
  padding = 'md',
}: CardProps) {
  const shadowStyle = elevation !== 'none' ? SHADOWS[elevation] : {};
  const paddingStyle = padding !== 'none' ? { padding: SPACING[padding] } : {};

  return (
    <View style={[styles.container, shadowStyle, paddingStyle, style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.surfaceElevated,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
});

export default Card;
