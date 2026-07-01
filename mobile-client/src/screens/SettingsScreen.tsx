/**
 * SettingsScreen - App settings
 * Per Step 11: Sync settings including WiFi preference
 */

import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, Switch } from 'react-native';

import { TouchPressable } from '../components/TouchPressable';
import { COLORS, SPACING, BORDER_RADIUS, TYPOGRAPHY, TOUCH_TARGET_MIN } from '../theme';

type CellularBudget = 50 | 100 | 200;

interface SettingsState {
  wifiOnlyFullSync: boolean;
  cellularBudgetMb: CellularBudget;
  backgroundSyncEnabled: boolean;
  hapticFeedback: boolean;
  notifications: boolean;
}

export default function SettingsScreen() {
  const [settings, setSettings] = useState<SettingsState>({
    wifiOnlyFullSync: true,
    cellularBudgetMb: 100,
    backgroundSyncEnabled: true,
    hapticFeedback: true,
    notifications: true,
  });

  const handleToggle = useCallback(
    (key: keyof SettingsState) => {
      setSettings((prev) => ({
        ...prev,
        [key]: !prev[key],
      }));
      // TODO: Persist settings
    },
    []
  );

  const handleCellularBudget = useCallback((budget: CellularBudget) => {
    setSettings((prev) => ({
      ...prev,
      cellularBudgetMb: budget,
    }));
    // TODO: Persist settings
  }, []);

  return (
    <ScrollView style={styles.container}>
      {/* Sync Settings */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Sync</Text>

        <View style={styles.card}>
          <View style={styles.settingRow}>
            <View style={styles.settingText}>
              <Text style={styles.settingLabel}>WiFi Only for Full Sync</Text>
              <Text style={styles.settingDescription}>
                Only download content blobs on WiFi. Headers sync on cellular.
              </Text>
            </View>
            <Switch
              value={settings.wifiOnlyFullSync}
              onValueChange={() => handleToggle('wifiOnlyFullSync')}
              trackColor={{ false: COLORS.border, true: COLORS.primary }}
            />
          </View>

          <View style={styles.settingRow}>
            <View style={styles.settingText}>
              <Text style={styles.settingLabel}>Background Sync</Text>
              <Text style={styles.settingDescription}>
                Sync data in the background when app is closed.
              </Text>
            </View>
            <Switch
              value={settings.backgroundSyncEnabled}
              onValueChange={() => handleToggle('backgroundSyncEnabled')}
              trackColor={{ false: COLORS.border, true: COLORS.primary }}
            />
          </View>

          <View style={styles.settingGroup}>
            <Text style={styles.settingLabel}>Cellular Data Limit</Text>
            <Text style={styles.settingDescription}>
              Maximum data to sync per day on cellular.
            </Text>
            <View style={styles.budgetOptions}>
              {([50, 100, 200] as CellularBudget[]).map((budget) => (
                <TouchPressable
                  key={budget}
                  style={[
                    styles.budgetOption,
                    settings.cellularBudgetMb === budget && styles.budgetOptionSelected,
                  ]}
                  onPress={() => handleCellularBudget(budget)}
                  haptic="selection"
                >
                  <Text
                    style={[
                      styles.budgetText,
                      settings.cellularBudgetMb === budget && styles.budgetTextSelected,
                    ]}
                  >
                    {budget} MB
                  </Text>
                </TouchPressable>
              ))}
            </View>
          </View>
        </View>
      </View>

      {/* Interface Settings */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Interface</Text>

        <View style={styles.card}>
          <View style={styles.settingRow}>
            <View style={styles.settingText}>
              <Text style={styles.settingLabel}>Haptic Feedback</Text>
              <Text style={styles.settingDescription}>
                Vibrate on button presses and actions.
              </Text>
            </View>
            <Switch
              value={settings.hapticFeedback}
              onValueChange={() => handleToggle('hapticFeedback')}
              trackColor={{ false: COLORS.border, true: COLORS.primary }}
            />
          </View>

          <View style={[styles.settingRow, styles.settingRowLast]}>
            <View style={styles.settingText}>
              <Text style={styles.settingLabel}>Notifications</Text>
              <Text style={styles.settingDescription}>
                Show notifications for mining completion and new content.
              </Text>
            </View>
            <Switch
              value={settings.notifications}
              onValueChange={() => handleToggle('notifications')}
              trackColor={{ false: COLORS.border, true: COLORS.primary }}
            />
          </View>
        </View>
      </View>
    </ScrollView>
  );
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
  sectionTitle: {
    fontSize: TYPOGRAPHY.fontSize.sm,
    fontWeight: TYPOGRAPHY.fontWeight.semibold,
    color: COLORS.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  card: {
    backgroundColor: COLORS.surfaceElevated,
    borderRadius: BORDER_RADIUS.md,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: TOUCH_TARGET_MIN * 1.5,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
    gap: SPACING.md,
  },
  settingRowLast: {
    borderBottomWidth: 0,
  },
  settingText: {
    flex: 1,
    gap: 2,
  },
  settingLabel: {
    fontSize: TYPOGRAPHY.fontSize.base,
    color: COLORS.text,
  },
  settingDescription: {
    fontSize: TYPOGRAPHY.fontSize.sm,
    color: COLORS.textSecondary,
  },
  settingGroup: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    gap: SPACING.xs,
  },
  budgetOptions: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginTop: SPACING.sm,
  },
  budgetOption: {
    flex: 1,
    minHeight: TOUCH_TARGET_MIN,
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.sm,
    borderWidth: 2,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  budgetOptionSelected: {
    backgroundColor: COLORS.primary + '10',
    borderColor: COLORS.primary,
  },
  budgetText: {
    fontSize: TYPOGRAPHY.fontSize.base,
    fontWeight: TYPOGRAPHY.fontWeight.medium,
    color: COLORS.text,
  },
  budgetTextSelected: {
    color: COLORS.primary,
  },
});
