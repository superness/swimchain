/**
 * ProfileScreen - User identity and settings
 * Per Step 14: Identity card with export
 */

import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';

import { IdentityCard } from '../components/IdentityCard';
import { ForkIndicator, ForkStatus } from '../components/ForkIndicator';
import { SyncStatus } from '../components/SyncStatus';
import { TouchPressable } from '../components/TouchPressable';
import { COLORS, SPACING, TYPOGRAPHY, TOUCH_TARGET_MIN } from '../theme';
import type { ProfileStackScreenProps } from '../navigation/types';

// Mock data
const MOCK_ADDRESS = 'cs1q9x7yf8z3k4n5m6p7q8r9s0t1u2v3w4x5y6z7a8b2k4m';
const MOCK_FORK_STATUS: ForkStatus = {
  forkId: 'swimchain-main',
  isMainChain: true,
  participantCount: 1234,
  lastBlockTime: Date.now() - 30000,
  divergenceDetected: false,
};

type Props = ProfileStackScreenProps<'ProfileScreen'>;

interface MenuItem {
  id: string;
  label: string;
  icon: string;
  screen?: string;
  onPress?: () => void;
}

export default function ProfileScreen() {
  const navigation = useNavigation<Props['navigation']>();

  const [address] = useState(MOCK_ADDRESS);
  const [createdAt] = useState(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const [postCount] = useState(15);
  const [forkStatus] = useState<ForkStatus>(MOCK_FORK_STATUS);
  const [queueCount] = useState(2);

  const handleExportIdentity = useCallback(() => {
    Alert.alert(
      'Export Identity',
      'This will create an encrypted backup of your identity. You\'ll need to set a password.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Export',
          onPress: () => {
            // TODO: Implement export flow
            Alert.alert('Coming Soon', 'Identity export will be implemented soon.');
          },
        },
      ]
    );
  }, []);

  const menuItems: MenuItem[] = [
    { id: 'storage', label: 'Storage', icon: '📦', screen: 'StorageScreen' },
    {
      id: 'queue',
      label: `Offline Queue${queueCount > 0 ? ` (${queueCount})` : ''}`,
      icon: '📤',
      screen: 'QueueScreen',
    },
    { id: 'settings', label: 'Settings', icon: '⚙️', screen: 'SettingsScreen' },
  ];

  const handleMenuPress = useCallback(
    (item: MenuItem) => {
      if (item.screen) {
        navigation.navigate(item.screen as any);
      } else if (item.onPress) {
        item.onPress();
      }
    },
    [navigation]
  );

  return (
    <ScrollView style={styles.container}>
      {/* Fork Status */}
      <View style={styles.section}>
        <ForkIndicator status={forkStatus} />
      </View>

      {/* Identity Card */}
      <View style={styles.section}>
        <IdentityCard
          address={address}
          createdAt={createdAt}
          postCount={postCount}
          onExport={handleExportIdentity}
        />
      </View>

      {/* Sync Status */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Network</Text>
        <View style={styles.card}>
          <SyncStatus
            mode="full"
            isOnline={true}
            isWifi={true}
            cellularUsedMb={45}
            cellularBudgetMb={100}
            lastSyncTime={Date.now() - 120000}
          />
        </View>
      </View>

      {/* Menu Items */}
      <View style={styles.section}>
        {menuItems.map((item, index) => (
          <TouchPressable
            key={item.id}
            style={[
              styles.menuItem,
              index === 0 && styles.menuItemFirst,
              index === menuItems.length - 1 && styles.menuItemLast,
            ]}
            onPress={() => handleMenuPress(item)}
            haptic="selection"
          >
            <Text style={styles.menuIcon}>{item.icon}</Text>
            <Text style={styles.menuLabel}>{item.label}</Text>
            <Text style={styles.menuChevron}>›</Text>
          </TouchPressable>
        ))}
      </View>

      {/* Version */}
      <View style={styles.footer}>
        <Text style={styles.version}>Swimchain Mobile v0.1.0</Text>
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
    borderRadius: 8,
    padding: SPACING.md,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: TOUCH_TARGET_MIN,
    backgroundColor: COLORS.surfaceElevated,
    paddingHorizontal: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
    gap: SPACING.sm,
  },
  menuItemFirst: {
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
  },
  menuItemLast: {
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
    borderBottomWidth: 0,
  },
  menuIcon: {
    fontSize: 20,
    width: 28,
    textAlign: 'center',
  },
  menuLabel: {
    flex: 1,
    fontSize: TYPOGRAPHY.fontSize.base,
    color: COLORS.text,
  },
  menuChevron: {
    fontSize: 20,
    color: COLORS.textTertiary,
  },
  footer: {
    padding: SPACING.xl,
    alignItems: 'center',
  },
  version: {
    fontSize: TYPOGRAPHY.fontSize.sm,
    color: COLORS.textTertiary,
  },
});
