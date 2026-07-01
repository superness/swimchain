/**
 * StorageScreen - Storage management UI
 * Per Step 13: Storage breakdown and profile selection
 */

import React, { useState, useCallback } from 'react';
import { View, ScrollView, StyleSheet, Alert } from 'react-native';

import { StorageBreakdown, StorageCategory } from '../components/StorageBreakdown';
import { StorageProfileSelector, StorageProfile, STORAGE_PROFILES } from '../components/StorageProfileSelector';
import { Button } from '../components/Button';
import { COLORS, SPACING } from '../theme';

// Mock data
const MOCK_CATEGORIES: StorageCategory[] = [
  { id: 'own', label: 'Your Content', bytes: 52_000_000, color: COLORS.primary, canClear: false },
  { id: 'pinned', label: 'Pinned', bytes: 120_000_000, color: COLORS.success, canClear: true },
  { id: 'subscribed', label: 'Subscribed Spaces', bytes: 350_000_000, color: COLORS.heat.warm, canClear: true },
  { id: 'other', label: 'Other', bytes: 180_000_000, color: COLORS.textTertiary, canClear: true },
];

export default function StorageScreen() {
  const [profile, setProfile] = useState<StorageProfile>('Standard5GB');
  const [categories] = useState<StorageCategory[]>(MOCK_CATEGORIES);

  const totalBytes = categories.reduce((sum, cat) => sum + cat.bytes, 0);
  const limitBytes = STORAGE_PROFILES.find((p) => p.id === profile)?.maxBytes ?? 5_000_000_000;

  const handleProfileChange = useCallback((newProfile: StorageProfile) => {
    setProfile(newProfile);
    // TODO: Persist setting
  }, []);

  const handleClearCategory = useCallback((categoryId: string) => {
    const category = categories.find((c) => c.id === categoryId);
    if (!category || !category.canClear) return;

    Alert.alert(
      `Clear ${category.label}?`,
      `This will remove ${formatBytes(category.bytes)} of cached data. Your content and pinned items will not be affected.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: () => {
            // TODO: Actually clear cache
            Alert.alert('Cleared', `${category.label} cache cleared.`);
          },
        },
      ]
    );
  }, [categories]);

  const handleClearAll = useCallback(() => {
    const clearableBytes = categories
      .filter((c) => c.canClear)
      .reduce((sum, c) => sum + c.bytes, 0);

    Alert.alert(
      'Clear All Cache?',
      `This will remove ${formatBytes(clearableBytes)} of cached data. Your content will not be affected.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear All',
          style: 'destructive',
          onPress: () => {
            // TODO: Actually clear cache
            Alert.alert('Cleared', 'All cache cleared.');
          },
        },
      ]
    );
  }, [categories]);

  return (
    <ScrollView style={styles.container}>
      {/* Storage Breakdown */}
      <View style={styles.section}>
        <StorageBreakdown
          categories={categories}
          totalBytes={totalBytes}
          limitBytes={limitBytes}
        />
      </View>

      {/* Profile Selector */}
      <View style={styles.section}>
        <StorageProfileSelector
          selectedProfile={profile}
          onSelect={handleProfileChange}
        />
      </View>

      {/* Clear Actions */}
      <View style={styles.section}>
        {categories
          .filter((c) => c.canClear)
          .map((category) => (
            <Button
              key={category.id}
              title={`Clear ${category.label}`}
              variant="outline"
              size="sm"
              onPress={() => handleClearCategory(category.id)}
              style={styles.clearButton}
            />
          ))}

        <Button
          title="Clear All Cache"
          variant="danger"
          onPress={handleClearAll}
          style={styles.clearAllButton}
        />
      </View>
    </ScrollView>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  section: {
    padding: SPACING.md,
    gap: SPACING.sm,
  },
  clearButton: {
    marginBottom: SPACING.xs,
  },
  clearAllButton: {
    marginTop: SPACING.sm,
  },
});
