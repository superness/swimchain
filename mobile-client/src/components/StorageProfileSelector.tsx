/**
 * StorageProfileSelector - Select storage profile
 * Per Step 13: Budget1GB, Standard5GB, Flagship10GB
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

import { TouchPressable } from './TouchPressable';
import { COLORS, SPACING, BORDER_RADIUS, TYPOGRAPHY, TOUCH_TARGET_MIN } from '../theme';

export type StorageProfile = 'Budget1GB' | 'Standard5GB' | 'Flagship10GB';

export interface StorageProfileConfig {
  id: StorageProfile;
  label: string;
  maxBytes: number;
  evictionThreshold: number;
}

export const STORAGE_PROFILES: StorageProfileConfig[] = [
  { id: 'Budget1GB', label: '1 GB', maxBytes: 1_000_000_000, evictionThreshold: 0.85 },
  { id: 'Standard5GB', label: '5 GB', maxBytes: 5_000_000_000, evictionThreshold: 0.90 },
  { id: 'Flagship10GB', label: '10 GB', maxBytes: 10_000_000_000, evictionThreshold: 0.92 },
];

export interface StorageProfileSelectorProps {
  selectedProfile: StorageProfile;
  onSelect: (profile: StorageProfile) => void;
}

export function StorageProfileSelector({
  selectedProfile,
  onSelect,
}: StorageProfileSelectorProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.label}>Storage Limit</Text>
      <View style={styles.options}>
        {STORAGE_PROFILES.map((profile) => (
          <TouchPressable
            key={profile.id}
            style={[
              styles.option,
              selectedProfile === profile.id && styles.optionSelected,
            ]}
            onPress={() => onSelect(profile.id)}
            haptic="selection"
            accessibilityLabel={`${profile.label} storage limit`}
            accessibilityState={{ selected: selectedProfile === profile.id }}
          >
            <Text
              style={[
                styles.optionLabel,
                selectedProfile === profile.id && styles.optionLabelSelected,
              ]}
            >
              {profile.label}
            </Text>
            <Text
              style={[
                styles.optionThreshold,
                selectedProfile === profile.id && styles.optionThresholdSelected,
              ]}
            >
              Evict at {Math.round(profile.evictionThreshold * 100)}%
            </Text>
          </TouchPressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: SPACING.sm,
  },
  label: {
    fontSize: TYPOGRAPHY.fontSize.sm,
    fontWeight: TYPOGRAPHY.fontWeight.medium,
    color: COLORS.textSecondary,
  },
  options: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  option: {
    flex: 1,
    minHeight: TOUCH_TARGET_MIN,
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 2,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.sm,
  },
  optionSelected: {
    backgroundColor: COLORS.primary + '10',
    borderColor: COLORS.primary,
  },
  optionLabel: {
    fontSize: TYPOGRAPHY.fontSize.md,
    fontWeight: TYPOGRAPHY.fontWeight.bold,
    color: COLORS.text,
  },
  optionLabelSelected: {
    color: COLORS.primary,
  },
  optionThreshold: {
    fontSize: TYPOGRAPHY.fontSize.xs,
    color: COLORS.textTertiary,
  },
  optionThresholdSelected: {
    color: COLORS.primary,
    opacity: 0.8,
  },
});

export default StorageProfileSelector;
