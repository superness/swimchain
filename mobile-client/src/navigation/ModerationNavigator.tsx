/**
 * ModerationNavigator - Navigation for Moderation Features Group
 * Handles: Reports, Blocklist, Spam Attestation navigation
 *
 * Routes:
 * - Reports: Report submission, report queue, report detail, resolution
 * - Blocklist: Blocked users/content management, block settings
 * - SpamAttestation: Spam flagging, attestation aggregation, appeals
 */

import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { View, Text } from 'react-native';

import { COLORS } from '../theme';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

/**
 * Moderation feature navigation param lists
 */

// Reports-related screens
export type ReportsStackParamList = {
  ReportsOverview: undefined;
  ReportCreate: { contentId: string; contentType: 'post' | 'comment' | 'user' | 'space' };
  ReportDetail: { reportId: string };
  ReportQueue: { spaceId?: string };
  ReportResolution: { reportId: string };
  ReportHistory: { userId?: string };
  ReportCategories: undefined;
};

// Blocklist-related screens
export type BlocklistStackParamList = {
  BlocklistOverview: undefined;
  BlockedUsers: undefined;
  BlockedContent: undefined;
  BlockUser: { userId: string; reason?: string };
  BlockContent: { contentId: string; contentType: 'post' | 'comment' };
  BlockSettings: undefined;
  BlockHistory: undefined;
};

// SpamAttestation-related screens
export type SpamAttestationStackParamList = {
  SpamOverview: undefined;
  SpamFlag: { contentId: string; contentType: 'post' | 'comment' };
  SpamQueue: { spaceId?: string };
  SpamDetail: { attestationId: string };
  SpamAppeal: { contentId: string };
  SpamAppealDetail: { appealId: string };
  AttestationHistory: { userId?: string };
  AttestationAggregation: { contentId: string };
};

// Combined Moderation navigation param list
export type ModerationStackParamList = {
  // Reports routes
  ReportsOverview: undefined;
  ReportCreate: { contentId: string; contentType: 'post' | 'comment' | 'user' | 'space' };
  ReportDetail: { reportId: string };
  ReportQueue: { spaceId?: string };
  ReportResolution: { reportId: string };
  ReportHistory: { userId?: string };
  ReportCategories: undefined;

  // Blocklist routes
  BlocklistOverview: undefined;
  BlockedUsers: undefined;
  BlockedContent: undefined;
  BlockUser: { userId: string; reason?: string };
  BlockContent: { contentId: string; contentType: 'post' | 'comment' };
  BlockSettings: undefined;
  BlockHistory: undefined;

  // SpamAttestation routes
  SpamOverview: undefined;
  SpamFlag: { contentId: string; contentType: 'post' | 'comment' };
  SpamQueue: { spaceId?: string };
  SpamDetail: { attestationId: string };
  SpamAppeal: { contentId: string };
  SpamAppealDetail: { appealId: string };
  AttestationHistory: { userId?: string };
  AttestationAggregation: { contentId: string };
};

// ============================================================================
// SCREEN PROPS TYPES
// ============================================================================

export type ModerationStackScreenProps<T extends keyof ModerationStackParamList> =
  NativeStackScreenProps<ModerationStackParamList, T>;

export type ReportsStackScreenProps<T extends keyof ReportsStackParamList> =
  NativeStackScreenProps<ReportsStackParamList, T>;

export type BlocklistStackScreenProps<T extends keyof BlocklistStackParamList> =
  NativeStackScreenProps<BlocklistStackParamList, T>;

export type SpamAttestationStackScreenProps<T extends keyof SpamAttestationStackParamList> =
  NativeStackScreenProps<SpamAttestationStackParamList, T>;

// ============================================================================
// ROUTE DEFINITIONS
// ============================================================================

/**
 * Route configuration for Moderation features
 */
export const MODERATION_ROUTES = {
  // Reports routes
  REPORTS: {
    OVERVIEW: 'ReportsOverview',
    CREATE: 'ReportCreate',
    DETAIL: 'ReportDetail',
    QUEUE: 'ReportQueue',
    RESOLUTION: 'ReportResolution',
    HISTORY: 'ReportHistory',
    CATEGORIES: 'ReportCategories',
  },

  // Blocklist routes
  BLOCKLIST: {
    OVERVIEW: 'BlocklistOverview',
    USERS: 'BlockedUsers',
    CONTENT: 'BlockedContent',
    BLOCK_USER: 'BlockUser',
    BLOCK_CONTENT: 'BlockContent',
    SETTINGS: 'BlockSettings',
    HISTORY: 'BlockHistory',
  },

  // SpamAttestation routes
  SPAM: {
    OVERVIEW: 'SpamOverview',
    FLAG: 'SpamFlag',
    QUEUE: 'SpamQueue',
    DETAIL: 'SpamDetail',
    APPEAL: 'SpamAppeal',
    APPEAL_DETAIL: 'SpamAppealDetail',
    ATTESTATION_HISTORY: 'AttestationHistory',
    AGGREGATION: 'AttestationAggregation',
  },
} as const;

// ============================================================================
// NAVIGATION SELECTORS
// ============================================================================

/**
 * Selectors for extracting route params and state
 */
export const ModerationNavigationSelectors = {
  // Reports selectors
  getReportCreateParams: (route: ModerationStackScreenProps<'ReportCreate'>['route']) => ({
    contentId: route.params.contentId,
    contentType: route.params.contentType,
  }),

  getReportDetailParams: (route: ModerationStackScreenProps<'ReportDetail'>['route']) => ({
    reportId: route.params.reportId,
  }),

  getReportQueueParams: (route: ModerationStackScreenProps<'ReportQueue'>['route']) => ({
    spaceId: route.params?.spaceId,
  }),

  getReportResolutionParams: (route: ModerationStackScreenProps<'ReportResolution'>['route']) => ({
    reportId: route.params.reportId,
  }),

  getReportHistoryParams: (route: ModerationStackScreenProps<'ReportHistory'>['route']) => ({
    userId: route.params?.userId,
  }),

  // Blocklist selectors
  getBlockUserParams: (route: ModerationStackScreenProps<'BlockUser'>['route']) => ({
    userId: route.params.userId,
    reason: route.params?.reason,
  }),

  getBlockContentParams: (route: ModerationStackScreenProps<'BlockContent'>['route']) => ({
    contentId: route.params.contentId,
    contentType: route.params.contentType,
  }),

  // SpamAttestation selectors
  getSpamFlagParams: (route: ModerationStackScreenProps<'SpamFlag'>['route']) => ({
    contentId: route.params.contentId,
    contentType: route.params.contentType,
  }),

  getSpamQueueParams: (route: ModerationStackScreenProps<'SpamQueue'>['route']) => ({
    spaceId: route.params?.spaceId,
  }),

  getSpamDetailParams: (route: ModerationStackScreenProps<'SpamDetail'>['route']) => ({
    attestationId: route.params.attestationId,
  }),

  getSpamAppealParams: (route: ModerationStackScreenProps<'SpamAppeal'>['route']) => ({
    contentId: route.params.contentId,
  }),

  getSpamAppealDetailParams: (route: ModerationStackScreenProps<'SpamAppealDetail'>['route']) => ({
    appealId: route.params.appealId,
  }),

  getAttestationHistoryParams: (route: ModerationStackScreenProps<'AttestationHistory'>['route']) => ({
    userId: route.params?.userId,
  }),

  getAttestationAggregationParams: (route: ModerationStackScreenProps<'AttestationAggregation'>['route']) => ({
    contentId: route.params.contentId,
  }),
};

// ============================================================================
// SETUP DEFINITIONS
// ============================================================================

/**
 * Navigator screen options configuration
 */
export const ModerationNavigatorSetup = {
  // Default screen options for Moderation navigator
  defaultScreenOptions: {
    headerShown: true,
    headerStyle: { backgroundColor: COLORS.background },
    headerTitleStyle: { color: COLORS.text },
    headerTintColor: COLORS.primary,
    contentStyle: { backgroundColor: COLORS.background },
  },

  // Reports group screen options
  reportsScreenOptions: {
    headerShown: true,
    headerStyle: { backgroundColor: COLORS.background },
    headerTitleStyle: { color: COLORS.text },
    headerTintColor: COLORS.primary,
  },

  // Blocklist group screen options
  blocklistScreenOptions: {
    headerShown: true,
    headerStyle: { backgroundColor: COLORS.background },
    headerTitleStyle: { color: COLORS.text },
    headerTintColor: COLORS.primary,
  },

  // SpamAttestation group screen options
  spamScreenOptions: {
    headerShown: true,
    headerStyle: { backgroundColor: COLORS.background },
    headerTitleStyle: { color: COLORS.text },
    headerTintColor: COLORS.primary,
  },

  // Modal presentation options (for create/flag/appeal screens)
  modalScreenOptions: {
    presentation: 'modal' as const,
    headerShown: true,
    headerStyle: { backgroundColor: COLORS.background },
    headerTitleStyle: { color: COLORS.text },
    headerTintColor: COLORS.primary,
  },

  // Confirmation modal options (for resolution/block confirmation)
  confirmationModalOptions: {
    presentation: 'modal' as const,
    headerShown: true,
    headerStyle: { backgroundColor: COLORS.background },
    headerTitleStyle: { color: COLORS.text },
    headerTintColor: COLORS.warning,
    gestureEnabled: false,
  },

  // Screen titles configuration
  screenTitles: {
    // Reports
    ReportsOverview: 'Reports',
    ReportCreate: 'Submit Report',
    ReportDetail: 'Report Details',
    ReportQueue: 'Report Queue',
    ReportResolution: 'Resolve Report',
    ReportHistory: 'Report History',
    ReportCategories: 'Report Categories',
    // Blocklist
    BlocklistOverview: 'Blocklist',
    BlockedUsers: 'Blocked Users',
    BlockedContent: 'Blocked Content',
    BlockUser: 'Block User',
    BlockContent: 'Block Content',
    BlockSettings: 'Block Settings',
    BlockHistory: 'Block History',
    // SpamAttestation
    SpamOverview: 'Spam Management',
    SpamFlag: 'Flag as Spam',
    SpamQueue: 'Spam Queue',
    SpamDetail: 'Spam Details',
    SpamAppeal: 'Appeal Spam Flag',
    SpamAppealDetail: 'Appeal Details',
    AttestationHistory: 'Attestation History',
    AttestationAggregation: 'Attestation Summary',
  } as Record<keyof ModerationStackParamList, string>,
};

// ============================================================================
// NAVIGATION HELPERS
// ============================================================================

/**
 * Helper functions for Moderation navigation
 */
export const ModerationNavigationHelpers = {
  // Navigate to reports overview
  navigateToReportsOverview: (
    navigation: ModerationStackScreenProps<keyof ModerationStackParamList>['navigation']
  ) => {
    navigation.navigate('ReportsOverview');
  },

  // Navigate to create report
  navigateToCreateReport: (
    navigation: ModerationStackScreenProps<keyof ModerationStackParamList>['navigation'],
    contentId: string,
    contentType: 'post' | 'comment' | 'user' | 'space'
  ) => {
    navigation.navigate('ReportCreate', { contentId, contentType });
  },

  // Navigate to report detail
  navigateToReportDetail: (
    navigation: ModerationStackScreenProps<keyof ModerationStackParamList>['navigation'],
    reportId: string
  ) => {
    navigation.navigate('ReportDetail', { reportId });
  },

  // Navigate to report queue
  navigateToReportQueue: (
    navigation: ModerationStackScreenProps<keyof ModerationStackParamList>['navigation'],
    spaceId?: string
  ) => {
    navigation.navigate('ReportQueue', { spaceId });
  },

  // Navigate to report resolution
  navigateToReportResolution: (
    navigation: ModerationStackScreenProps<keyof ModerationStackParamList>['navigation'],
    reportId: string
  ) => {
    navigation.navigate('ReportResolution', { reportId });
  },

  // Navigate to report history
  navigateToReportHistory: (
    navigation: ModerationStackScreenProps<keyof ModerationStackParamList>['navigation'],
    userId?: string
  ) => {
    navigation.navigate('ReportHistory', { userId });
  },

  // Navigate to report categories
  navigateToReportCategories: (
    navigation: ModerationStackScreenProps<keyof ModerationStackParamList>['navigation']
  ) => {
    navigation.navigate('ReportCategories');
  },

  // Navigate to blocklist overview
  navigateToBlocklistOverview: (
    navigation: ModerationStackScreenProps<keyof ModerationStackParamList>['navigation']
  ) => {
    navigation.navigate('BlocklistOverview');
  },

  // Navigate to blocked users
  navigateToBlockedUsers: (
    navigation: ModerationStackScreenProps<keyof ModerationStackParamList>['navigation']
  ) => {
    navigation.navigate('BlockedUsers');
  },

  // Navigate to blocked content
  navigateToBlockedContent: (
    navigation: ModerationStackScreenProps<keyof ModerationStackParamList>['navigation']
  ) => {
    navigation.navigate('BlockedContent');
  },

  // Navigate to block user
  navigateToBlockUser: (
    navigation: ModerationStackScreenProps<keyof ModerationStackParamList>['navigation'],
    userId: string,
    reason?: string
  ) => {
    navigation.navigate('BlockUser', { userId, reason });
  },

  // Navigate to block content
  navigateToBlockContent: (
    navigation: ModerationStackScreenProps<keyof ModerationStackParamList>['navigation'],
    contentId: string,
    contentType: 'post' | 'comment'
  ) => {
    navigation.navigate('BlockContent', { contentId, contentType });
  },

  // Navigate to block settings
  navigateToBlockSettings: (
    navigation: ModerationStackScreenProps<keyof ModerationStackParamList>['navigation']
  ) => {
    navigation.navigate('BlockSettings');
  },

  // Navigate to block history
  navigateToBlockHistory: (
    navigation: ModerationStackScreenProps<keyof ModerationStackParamList>['navigation']
  ) => {
    navigation.navigate('BlockHistory');
  },

  // Navigate to spam overview
  navigateToSpamOverview: (
    navigation: ModerationStackScreenProps<keyof ModerationStackParamList>['navigation']
  ) => {
    navigation.navigate('SpamOverview');
  },

  // Navigate to flag as spam
  navigateToSpamFlag: (
    navigation: ModerationStackScreenProps<keyof ModerationStackParamList>['navigation'],
    contentId: string,
    contentType: 'post' | 'comment'
  ) => {
    navigation.navigate('SpamFlag', { contentId, contentType });
  },

  // Navigate to spam queue
  navigateToSpamQueue: (
    navigation: ModerationStackScreenProps<keyof ModerationStackParamList>['navigation'],
    spaceId?: string
  ) => {
    navigation.navigate('SpamQueue', { spaceId });
  },

  // Navigate to spam detail
  navigateToSpamDetail: (
    navigation: ModerationStackScreenProps<keyof ModerationStackParamList>['navigation'],
    attestationId: string
  ) => {
    navigation.navigate('SpamDetail', { attestationId });
  },

  // Navigate to spam appeal
  navigateToSpamAppeal: (
    navigation: ModerationStackScreenProps<keyof ModerationStackParamList>['navigation'],
    contentId: string
  ) => {
    navigation.navigate('SpamAppeal', { contentId });
  },

  // Navigate to spam appeal detail
  navigateToSpamAppealDetail: (
    navigation: ModerationStackScreenProps<keyof ModerationStackParamList>['navigation'],
    appealId: string
  ) => {
    navigation.navigate('SpamAppealDetail', { appealId });
  },

  // Navigate to attestation history
  navigateToAttestationHistory: (
    navigation: ModerationStackScreenProps<keyof ModerationStackParamList>['navigation'],
    userId?: string
  ) => {
    navigation.navigate('AttestationHistory', { userId });
  },

  // Navigate to attestation aggregation
  navigateToAttestationAggregation: (
    navigation: ModerationStackScreenProps<keyof ModerationStackParamList>['navigation'],
    contentId: string
  ) => {
    navigation.navigate('AttestationAggregation', { contentId });
  },
};

// ============================================================================
// PLACEHOLDER SCREENS (to be replaced with actual implementations)
// ============================================================================

const PlaceholderScreen = ({ route }: { route: { name: string } }) => {
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

const Stack = createNativeStackNavigator<ModerationStackParamList>();

/**
 * Moderation Navigator Component
 * Groups Reports, Blocklist, and SpamAttestation navigation
 */
export function ModerationNavigator() {
  return (
    <Stack.Navigator
      screenOptions={ModerationNavigatorSetup.defaultScreenOptions}
      initialRouteName="ReportsOverview"
    >
      {/* Reports Group */}
      <Stack.Group screenOptions={ModerationNavigatorSetup.reportsScreenOptions}>
        <Stack.Screen
          name="ReportsOverview"
          component={PlaceholderScreen}
          options={{ title: ModerationNavigatorSetup.screenTitles.ReportsOverview }}
        />
        <Stack.Screen
          name="ReportDetail"
          component={PlaceholderScreen}
          options={{ title: ModerationNavigatorSetup.screenTitles.ReportDetail }}
        />
        <Stack.Screen
          name="ReportQueue"
          component={PlaceholderScreen}
          options={({ route }) => ({
            title: route.params?.spaceId
              ? `Reports: s/${route.params.spaceId}`
              : ModerationNavigatorSetup.screenTitles.ReportQueue,
          })}
        />
        <Stack.Screen
          name="ReportHistory"
          component={PlaceholderScreen}
          options={{ title: ModerationNavigatorSetup.screenTitles.ReportHistory }}
        />
        <Stack.Screen
          name="ReportCategories"
          component={PlaceholderScreen}
          options={{ title: ModerationNavigatorSetup.screenTitles.ReportCategories }}
        />
      </Stack.Group>

      {/* Blocklist Group */}
      <Stack.Group screenOptions={ModerationNavigatorSetup.blocklistScreenOptions}>
        <Stack.Screen
          name="BlocklistOverview"
          component={PlaceholderScreen}
          options={{ title: ModerationNavigatorSetup.screenTitles.BlocklistOverview }}
        />
        <Stack.Screen
          name="BlockedUsers"
          component={PlaceholderScreen}
          options={{ title: ModerationNavigatorSetup.screenTitles.BlockedUsers }}
        />
        <Stack.Screen
          name="BlockedContent"
          component={PlaceholderScreen}
          options={{ title: ModerationNavigatorSetup.screenTitles.BlockedContent }}
        />
        <Stack.Screen
          name="BlockSettings"
          component={PlaceholderScreen}
          options={{ title: ModerationNavigatorSetup.screenTitles.BlockSettings }}
        />
        <Stack.Screen
          name="BlockHistory"
          component={PlaceholderScreen}
          options={{ title: ModerationNavigatorSetup.screenTitles.BlockHistory }}
        />
      </Stack.Group>

      {/* SpamAttestation Group */}
      <Stack.Group screenOptions={ModerationNavigatorSetup.spamScreenOptions}>
        <Stack.Screen
          name="SpamOverview"
          component={PlaceholderScreen}
          options={{ title: ModerationNavigatorSetup.screenTitles.SpamOverview }}
        />
        <Stack.Screen
          name="SpamQueue"
          component={PlaceholderScreen}
          options={({ route }) => ({
            title: route.params?.spaceId
              ? `Spam: s/${route.params.spaceId}`
              : ModerationNavigatorSetup.screenTitles.SpamQueue,
          })}
        />
        <Stack.Screen
          name="SpamDetail"
          component={PlaceholderScreen}
          options={{ title: ModerationNavigatorSetup.screenTitles.SpamDetail }}
        />
        <Stack.Screen
          name="SpamAppealDetail"
          component={PlaceholderScreen}
          options={{ title: ModerationNavigatorSetup.screenTitles.SpamAppealDetail }}
        />
        <Stack.Screen
          name="AttestationHistory"
          component={PlaceholderScreen}
          options={{ title: ModerationNavigatorSetup.screenTitles.AttestationHistory }}
        />
        <Stack.Screen
          name="AttestationAggregation"
          component={PlaceholderScreen}
          options={{ title: ModerationNavigatorSetup.screenTitles.AttestationAggregation }}
        />
      </Stack.Group>

      {/* Modal Screens */}
      <Stack.Group screenOptions={ModerationNavigatorSetup.modalScreenOptions}>
        <Stack.Screen
          name="ReportCreate"
          component={PlaceholderScreen}
          options={({ route }) => ({
            title: `Report ${route.params.contentType.charAt(0).toUpperCase() + route.params.contentType.slice(1)}`,
          })}
        />
        <Stack.Screen
          name="SpamFlag"
          component={PlaceholderScreen}
          options={{ title: ModerationNavigatorSetup.screenTitles.SpamFlag }}
        />
        <Stack.Screen
          name="SpamAppeal"
          component={PlaceholderScreen}
          options={{ title: ModerationNavigatorSetup.screenTitles.SpamAppeal }}
        />
      </Stack.Group>

      {/* Confirmation Modal Screens */}
      <Stack.Group screenOptions={ModerationNavigatorSetup.confirmationModalOptions}>
        <Stack.Screen
          name="ReportResolution"
          component={PlaceholderScreen}
          options={{ title: ModerationNavigatorSetup.screenTitles.ReportResolution }}
        />
        <Stack.Screen
          name="BlockUser"
          component={PlaceholderScreen}
          options={{ title: ModerationNavigatorSetup.screenTitles.BlockUser }}
        />
        <Stack.Screen
          name="BlockContent"
          component={PlaceholderScreen}
          options={{ title: ModerationNavigatorSetup.screenTitles.BlockContent }}
        />
      </Stack.Group>
    </Stack.Navigator>
  );
}

export default ModerationNavigator;
