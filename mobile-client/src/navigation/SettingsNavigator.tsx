/**
 * SettingsNavigator - Navigation for Settings Features Group
 * Handles: Profile, Preferences, and Backup navigation
 *
 * Routes:
 * - Profile: User profile viewing and editing
 * - Preferences: App settings and customization
 * - Backup: Key backup, restore, and export functionality
 */

import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { NavigatorScreenParams } from '@react-navigation/native';

import { COLORS } from '../theme';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

/**
 * Settings feature navigation param lists
 */

// Profile-related screens
export type ProfileStackParamList = {
  ProfileOverview: undefined;
  ProfileEdit: undefined;
  ProfileAvatar: undefined;
  ProfileDisplayName: undefined;
  ProfileBio: undefined;
  ProfilePublicKey: { pubkey: string };
};

// Preferences-related screens
export type PreferencesStackParamList = {
  PreferencesOverview: undefined;
  PreferencesTheme: undefined;
  PreferencesNotifications: undefined;
  PreferencesPrivacy: undefined;
  PreferencesNetwork: undefined;
  PreferencesStorage: undefined;
  PreferencesAdvanced: undefined;
};

// Backup-related screens
export type BackupStackParamList = {
  BackupOverview: undefined;
  BackupCreate: undefined;
  BackupRestore: undefined;
  BackupExport: { format: 'json' | 'qr' | 'mnemonic' };
  BackupVerify: { backupId: string };
  BackupHistory: undefined;
};

// Combined Settings navigation param list
export type SettingsStackParamList = {
  // Profile routes
  Profile: NavigatorScreenParams<ProfileStackParamList>;
  ProfileOverview: undefined;
  ProfileEdit: undefined;
  ProfileAvatar: undefined;
  ProfileDisplayName: undefined;
  ProfileBio: undefined;
  ProfilePublicKey: { pubkey: string };

  // Preferences routes
  Preferences: NavigatorScreenParams<PreferencesStackParamList>;
  PreferencesOverview: undefined;
  PreferencesTheme: undefined;
  PreferencesNotifications: undefined;
  PreferencesPrivacy: undefined;
  PreferencesNetwork: undefined;
  PreferencesStorage: undefined;
  PreferencesAdvanced: undefined;

  // Backup routes
  Backup: NavigatorScreenParams<BackupStackParamList>;
  BackupOverview: undefined;
  BackupCreate: undefined;
  BackupRestore: undefined;
  BackupExport: { format: 'json' | 'qr' | 'mnemonic' };
  BackupVerify: { backupId: string };
  BackupHistory: undefined;
};

// ============================================================================
// SCREEN PROPS TYPES
// ============================================================================

export type SettingsStackScreenProps<T extends keyof SettingsStackParamList> =
  NativeStackScreenProps<SettingsStackParamList, T>;

export type ProfileStackScreenProps<T extends keyof ProfileStackParamList> =
  NativeStackScreenProps<ProfileStackParamList, T>;

export type PreferencesStackScreenProps<T extends keyof PreferencesStackParamList> =
  NativeStackScreenProps<PreferencesStackParamList, T>;

export type BackupStackScreenProps<T extends keyof BackupStackParamList> =
  NativeStackScreenProps<BackupStackParamList, T>;

// ============================================================================
// ROUTE DEFINITIONS
// ============================================================================

/**
 * Route configuration for Settings features
 */
export const SETTINGS_ROUTES = {
  // Profile routes
  PROFILE: {
    OVERVIEW: 'ProfileOverview',
    EDIT: 'ProfileEdit',
    AVATAR: 'ProfileAvatar',
    DISPLAY_NAME: 'ProfileDisplayName',
    BIO: 'ProfileBio',
    PUBLIC_KEY: 'ProfilePublicKey',
  },

  // Preferences routes
  PREFERENCES: {
    OVERVIEW: 'PreferencesOverview',
    THEME: 'PreferencesTheme',
    NOTIFICATIONS: 'PreferencesNotifications',
    PRIVACY: 'PreferencesPrivacy',
    NETWORK: 'PreferencesNetwork',
    STORAGE: 'PreferencesStorage',
    ADVANCED: 'PreferencesAdvanced',
  },

  // Backup routes
  BACKUP: {
    OVERVIEW: 'BackupOverview',
    CREATE: 'BackupCreate',
    RESTORE: 'BackupRestore',
    EXPORT: 'BackupExport',
    VERIFY: 'BackupVerify',
    HISTORY: 'BackupHistory',
  },
} as const;

// ============================================================================
// NAVIGATION SELECTORS
// ============================================================================

/**
 * Selectors for extracting route params and state
 */
export const SettingsNavigationSelectors = {
  // Profile selectors
  getProfilePublicKeyParams: (route: SettingsStackScreenProps<'ProfilePublicKey'>['route']) => ({
    pubkey: route.params.pubkey,
  }),

  // Preferences selectors (most have no params)
  isPreferencesScreen: (routeName: string) => routeName.startsWith('Preferences'),

  // Backup selectors
  getBackupExportParams: (route: SettingsStackScreenProps<'BackupExport'>['route']) => ({
    format: route.params.format,
  }),

  getBackupVerifyParams: (route: SettingsStackScreenProps<'BackupVerify'>['route']) => ({
    backupId: route.params.backupId,
  }),

  // General selectors
  isProfileScreen: (routeName: string) => routeName.startsWith('Profile'),
  isBackupScreen: (routeName: string) => routeName.startsWith('Backup'),

  getSettingsGroup: (routeName: string): 'profile' | 'preferences' | 'backup' | null => {
    if (routeName.startsWith('Profile')) return 'profile';
    if (routeName.startsWith('Preferences')) return 'preferences';
    if (routeName.startsWith('Backup')) return 'backup';
    return null;
  },
};

// ============================================================================
// SETUP DEFINITIONS
// ============================================================================

/**
 * Navigator screen options configuration
 */
export const SettingsNavigatorSetup = {
  // Default screen options for Settings navigator
  defaultScreenOptions: {
    headerShown: true,
    headerStyle: { backgroundColor: COLORS.background },
    headerTitleStyle: { color: COLORS.text },
    headerTintColor: COLORS.primary,
    contentStyle: { backgroundColor: COLORS.background },
  },

  // Profile group screen options
  profileScreenOptions: {
    headerShown: true,
    headerStyle: { backgroundColor: COLORS.background },
    headerTitleStyle: { color: COLORS.text },
    headerTintColor: COLORS.primary,
  },

  // Preferences group screen options
  preferencesScreenOptions: {
    headerShown: true,
    headerStyle: { backgroundColor: COLORS.background },
    headerTitleStyle: { color: COLORS.text },
    headerTintColor: COLORS.primary,
  },

  // Backup group screen options (security-sensitive)
  backupScreenOptions: {
    headerShown: true,
    headerStyle: { backgroundColor: COLORS.background },
    headerTitleStyle: { color: COLORS.text },
    headerTintColor: COLORS.primary,
    gestureEnabled: false, // Disable swipe back for security screens
  },

  // Modal presentation options (for edit/export screens)
  modalScreenOptions: {
    presentation: 'modal' as const,
    headerShown: true,
    headerStyle: { backgroundColor: COLORS.background },
    headerTitleStyle: { color: COLORS.text },
    headerTintColor: COLORS.primary,
  },

  // Screen titles configuration
  screenTitles: {
    // Profile
    ProfileOverview: 'Profile',
    ProfileEdit: 'Edit Profile',
    ProfileAvatar: 'Change Avatar',
    ProfileDisplayName: 'Display Name',
    ProfileBio: 'Edit Bio',
    ProfilePublicKey: 'Public Key',
    // Preferences
    PreferencesOverview: 'Preferences',
    PreferencesTheme: 'Theme',
    PreferencesNotifications: 'Notifications',
    PreferencesPrivacy: 'Privacy',
    PreferencesNetwork: 'Network',
    PreferencesStorage: 'Storage',
    PreferencesAdvanced: 'Advanced',
    // Backup
    BackupOverview: 'Backup & Recovery',
    BackupCreate: 'Create Backup',
    BackupRestore: 'Restore Backup',
    BackupExport: 'Export Keys',
    BackupVerify: 'Verify Backup',
    BackupHistory: 'Backup History',
    // Navigators
    Profile: 'Profile',
    Preferences: 'Preferences',
    Backup: 'Backup',
  } as Record<keyof SettingsStackParamList, string>,
};

// ============================================================================
// NAVIGATION HELPERS
// ============================================================================

/**
 * Helper functions for Settings navigation
 */
export const SettingsNavigationHelpers = {
  // Navigate to profile edit
  navigateToProfileEdit: (
    navigation: SettingsStackScreenProps<keyof SettingsStackParamList>['navigation']
  ) => {
    navigation.navigate('ProfileEdit');
  },

  // Navigate to profile with public key display
  navigateToPublicKey: (
    navigation: SettingsStackScreenProps<keyof SettingsStackParamList>['navigation'],
    pubkey: string
  ) => {
    navigation.navigate('ProfilePublicKey', { pubkey });
  },

  // Navigate to theme preferences
  navigateToTheme: (
    navigation: SettingsStackScreenProps<keyof SettingsStackParamList>['navigation']
  ) => {
    navigation.navigate('PreferencesTheme');
  },

  // Navigate to notification preferences
  navigateToNotifications: (
    navigation: SettingsStackScreenProps<keyof SettingsStackParamList>['navigation']
  ) => {
    navigation.navigate('PreferencesNotifications');
  },

  // Navigate to privacy settings
  navigateToPrivacy: (
    navigation: SettingsStackScreenProps<keyof SettingsStackParamList>['navigation']
  ) => {
    navigation.navigate('PreferencesPrivacy');
  },

  // Navigate to create backup
  navigateToCreateBackup: (
    navigation: SettingsStackScreenProps<keyof SettingsStackParamList>['navigation']
  ) => {
    navigation.navigate('BackupCreate');
  },

  // Navigate to restore backup
  navigateToRestoreBackup: (
    navigation: SettingsStackScreenProps<keyof SettingsStackParamList>['navigation']
  ) => {
    navigation.navigate('BackupRestore');
  },

  // Navigate to export with format
  navigateToExport: (
    navigation: SettingsStackScreenProps<keyof SettingsStackParamList>['navigation'],
    format: 'json' | 'qr' | 'mnemonic'
  ) => {
    navigation.navigate('BackupExport', { format });
  },

  // Navigate to verify backup
  navigateToVerifyBackup: (
    navigation: SettingsStackScreenProps<keyof SettingsStackParamList>['navigation'],
    backupId: string
  ) => {
    navigation.navigate('BackupVerify', { backupId });
  },

  // Navigate to backup history
  navigateToBackupHistory: (
    navigation: SettingsStackScreenProps<keyof SettingsStackParamList>['navigation']
  ) => {
    navigation.navigate('BackupHistory');
  },

  // Navigate to advanced settings
  navigateToAdvanced: (
    navigation: SettingsStackScreenProps<keyof SettingsStackParamList>['navigation']
  ) => {
    navigation.navigate('PreferencesAdvanced');
  },
};

// ============================================================================
// PLACEHOLDER SCREENS (to be replaced with actual implementations)
// ============================================================================

// Placeholder components for screens not yet implemented
const PlaceholderScreen = ({ route }: { route: { name: string } }) => {
  const React = require('react');
  const { View, Text, StyleSheet } = require('react-native');

  return (
    <View style={placeholderStyles.container}>
      <Text style={placeholderStyles.text}>
        {route.name} - Coming Soon
      </Text>
    </View>
  );
};

const placeholderStyles = {
  container: {
    flex: 1,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    backgroundColor: COLORS.background,
  },
  text: {
    color: COLORS.textSecondary,
    fontSize: 16,
  },
};

// ============================================================================
// NAVIGATOR COMPONENT
// ============================================================================

const Stack = createNativeStackNavigator<SettingsStackParamList>();

/**
 * Settings Navigator Component
 * Groups Profile, Preferences, and Backup navigation
 */
export function SettingsNavigator() {
  return (
    <Stack.Navigator
      screenOptions={SettingsNavigatorSetup.defaultScreenOptions}
    >
      {/* Profile Group */}
      <Stack.Group screenOptions={SettingsNavigatorSetup.profileScreenOptions}>
        <Stack.Screen
          name="ProfileOverview"
          component={PlaceholderScreen}
          options={{ title: SettingsNavigatorSetup.screenTitles.ProfileOverview }}
        />
        <Stack.Screen
          name="ProfileEdit"
          component={PlaceholderScreen}
          options={{ title: SettingsNavigatorSetup.screenTitles.ProfileEdit }}
        />
        <Stack.Screen
          name="ProfileAvatar"
          component={PlaceholderScreen}
          options={{ title: SettingsNavigatorSetup.screenTitles.ProfileAvatar }}
        />
        <Stack.Screen
          name="ProfileDisplayName"
          component={PlaceholderScreen}
          options={{ title: SettingsNavigatorSetup.screenTitles.ProfileDisplayName }}
        />
        <Stack.Screen
          name="ProfileBio"
          component={PlaceholderScreen}
          options={{ title: SettingsNavigatorSetup.screenTitles.ProfileBio }}
        />
        <Stack.Screen
          name="ProfilePublicKey"
          component={PlaceholderScreen}
          options={{ title: SettingsNavigatorSetup.screenTitles.ProfilePublicKey }}
        />
      </Stack.Group>

      {/* Preferences Group */}
      <Stack.Group screenOptions={SettingsNavigatorSetup.preferencesScreenOptions}>
        <Stack.Screen
          name="PreferencesOverview"
          component={PlaceholderScreen}
          options={{ title: SettingsNavigatorSetup.screenTitles.PreferencesOverview }}
        />
        <Stack.Screen
          name="PreferencesTheme"
          component={PlaceholderScreen}
          options={{ title: SettingsNavigatorSetup.screenTitles.PreferencesTheme }}
        />
        <Stack.Screen
          name="PreferencesNotifications"
          component={PlaceholderScreen}
          options={{ title: SettingsNavigatorSetup.screenTitles.PreferencesNotifications }}
        />
        <Stack.Screen
          name="PreferencesPrivacy"
          component={PlaceholderScreen}
          options={{ title: SettingsNavigatorSetup.screenTitles.PreferencesPrivacy }}
        />
        <Stack.Screen
          name="PreferencesNetwork"
          component={PlaceholderScreen}
          options={{ title: SettingsNavigatorSetup.screenTitles.PreferencesNetwork }}
        />
        <Stack.Screen
          name="PreferencesStorage"
          component={PlaceholderScreen}
          options={{ title: SettingsNavigatorSetup.screenTitles.PreferencesStorage }}
        />
        <Stack.Screen
          name="PreferencesAdvanced"
          component={PlaceholderScreen}
          options={{ title: SettingsNavigatorSetup.screenTitles.PreferencesAdvanced }}
        />
      </Stack.Group>

      {/* Backup Group (security-sensitive) */}
      <Stack.Group screenOptions={SettingsNavigatorSetup.backupScreenOptions}>
        <Stack.Screen
          name="BackupOverview"
          component={PlaceholderScreen}
          options={{ title: SettingsNavigatorSetup.screenTitles.BackupOverview }}
        />
        <Stack.Screen
          name="BackupCreate"
          component={PlaceholderScreen}
          options={{ title: SettingsNavigatorSetup.screenTitles.BackupCreate }}
        />
        <Stack.Screen
          name="BackupRestore"
          component={PlaceholderScreen}
          options={{ title: SettingsNavigatorSetup.screenTitles.BackupRestore }}
        />
        <Stack.Screen
          name="BackupHistory"
          component={PlaceholderScreen}
          options={{ title: SettingsNavigatorSetup.screenTitles.BackupHistory }}
        />
      </Stack.Group>

      {/* Backup Modals */}
      <Stack.Group screenOptions={SettingsNavigatorSetup.modalScreenOptions}>
        <Stack.Screen
          name="BackupExport"
          component={PlaceholderScreen}
          options={({ route }) => ({
            title: `Export (${route.params.format.toUpperCase()})`,
          })}
        />
        <Stack.Screen
          name="BackupVerify"
          component={PlaceholderScreen}
          options={{ title: SettingsNavigatorSetup.screenTitles.BackupVerify }}
        />
      </Stack.Group>
    </Stack.Navigator>
  );
}

export default SettingsNavigator;
