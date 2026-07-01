/**
 * AnalyticsNavigator - Navigation for Analytics Features Group
 * Handles: Metrics, Health, and Decay navigation
 *
 * Routes:
 * - Metrics: Performance metrics, engagement stats, content analytics
 * - Health: Space health, network health, node health status
 * - Decay: Content decay tracking, decay rates, decay history
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
 * Analytics feature navigation param lists
 */

// Metrics-related screens
export type MetricsStackParamList = {
  MetricsOverview: undefined;
  PerformanceMetrics: undefined;
  EngagementStats: { spaceId?: string };
  ContentAnalytics: { contentId?: string };
  UserMetrics: { userId?: string };
  MetricsHistory: { metricType: string; period?: 'day' | 'week' | 'month' };
  MetricsExport: undefined;
};

// Health-related screens
export type HealthStackParamList = {
  HealthOverview: undefined;
  SpaceHealth: { spaceId: string };
  SpaceHealthHistory: { spaceId: string };
  NetworkHealth: undefined;
  NodeHealth: undefined;
  HealthAlerts: undefined;
  HealthSettings: undefined;
};

// Decay-related screens
export type DecayStackParamList = {
  DecayOverview: undefined;
  DecayTracker: { contentId?: string };
  DecayRates: undefined;
  DecayHistory: { contentId: string };
  DecayPrediction: { contentId: string };
  DecaySettings: undefined;
};

// Combined Analytics navigation param list
export type AnalyticsStackParamList = {
  // Metrics routes
  Metrics: NavigatorScreenParams<MetricsStackParamList>;
  MetricsOverview: undefined;
  PerformanceMetrics: undefined;
  EngagementStats: { spaceId?: string };
  ContentAnalytics: { contentId?: string };
  UserMetrics: { userId?: string };
  MetricsHistory: { metricType: string; period?: 'day' | 'week' | 'month' };
  MetricsExport: undefined;

  // Health routes
  Health: NavigatorScreenParams<HealthStackParamList>;
  HealthOverview: undefined;
  SpaceHealth: { spaceId: string };
  SpaceHealthHistory: { spaceId: string };
  NetworkHealth: undefined;
  NodeHealth: undefined;
  HealthAlerts: undefined;
  HealthSettings: undefined;

  // Decay routes
  Decay: NavigatorScreenParams<DecayStackParamList>;
  DecayOverview: undefined;
  DecayTracker: { contentId?: string };
  DecayRates: undefined;
  DecayHistory: { contentId: string };
  DecayPrediction: { contentId: string };
  DecaySettings: undefined;
};

// ============================================================================
// SCREEN PROPS TYPES
// ============================================================================

export type AnalyticsStackScreenProps<T extends keyof AnalyticsStackParamList> =
  NativeStackScreenProps<AnalyticsStackParamList, T>;

export type MetricsStackScreenProps<T extends keyof MetricsStackParamList> =
  NativeStackScreenProps<MetricsStackParamList, T>;

export type HealthStackScreenProps<T extends keyof HealthStackParamList> =
  NativeStackScreenProps<HealthStackParamList, T>;

export type DecayStackScreenProps<T extends keyof DecayStackParamList> =
  NativeStackScreenProps<DecayStackParamList, T>;

// ============================================================================
// ROUTE DEFINITIONS
// ============================================================================

/**
 * Route configuration for Analytics features
 */
export const ANALYTICS_ROUTES = {
  // Metrics routes
  METRICS: {
    OVERVIEW: 'MetricsOverview',
    PERFORMANCE: 'PerformanceMetrics',
    ENGAGEMENT: 'EngagementStats',
    CONTENT: 'ContentAnalytics',
    USER: 'UserMetrics',
    HISTORY: 'MetricsHistory',
    EXPORT: 'MetricsExport',
  },

  // Health routes
  HEALTH: {
    OVERVIEW: 'HealthOverview',
    SPACE: 'SpaceHealth',
    SPACE_HISTORY: 'SpaceHealthHistory',
    NETWORK: 'NetworkHealth',
    NODE: 'NodeHealth',
    ALERTS: 'HealthAlerts',
    SETTINGS: 'HealthSettings',
  },

  // Decay routes
  DECAY: {
    OVERVIEW: 'DecayOverview',
    TRACKER: 'DecayTracker',
    RATES: 'DecayRates',
    HISTORY: 'DecayHistory',
    PREDICTION: 'DecayPrediction',
    SETTINGS: 'DecaySettings',
  },
} as const;

// ============================================================================
// NAVIGATION SELECTORS
// ============================================================================

/**
 * Selectors for extracting route params and state
 */
export const AnalyticsNavigationSelectors = {
  // Metrics selectors
  getEngagementStatsParams: (route: AnalyticsStackScreenProps<'EngagementStats'>['route']) => ({
    spaceId: route.params?.spaceId,
  }),

  getContentAnalyticsParams: (route: AnalyticsStackScreenProps<'ContentAnalytics'>['route']) => ({
    contentId: route.params?.contentId,
  }),

  getUserMetricsParams: (route: AnalyticsStackScreenProps<'UserMetrics'>['route']) => ({
    userId: route.params?.userId,
  }),

  getMetricsHistoryParams: (route: AnalyticsStackScreenProps<'MetricsHistory'>['route']) => ({
    metricType: route.params.metricType,
    period: route.params?.period ?? 'week',
  }),

  // Health selectors
  getSpaceHealthParams: (route: AnalyticsStackScreenProps<'SpaceHealth'>['route']) => ({
    spaceId: route.params.spaceId,
  }),

  getSpaceHealthHistoryParams: (route: AnalyticsStackScreenProps<'SpaceHealthHistory'>['route']) => ({
    spaceId: route.params.spaceId,
  }),

  // Decay selectors
  getDecayTrackerParams: (route: AnalyticsStackScreenProps<'DecayTracker'>['route']) => ({
    contentId: route.params?.contentId,
  }),

  getDecayHistoryParams: (route: AnalyticsStackScreenProps<'DecayHistory'>['route']) => ({
    contentId: route.params.contentId,
  }),

  getDecayPredictionParams: (route: AnalyticsStackScreenProps<'DecayPrediction'>['route']) => ({
    contentId: route.params.contentId,
  }),
};

// ============================================================================
// SETUP DEFINITIONS
// ============================================================================

/**
 * Navigator screen options configuration
 */
export const AnalyticsNavigatorSetup = {
  // Default screen options for Analytics navigator
  defaultScreenOptions: {
    headerShown: true,
    headerStyle: { backgroundColor: COLORS.background },
    headerTitleStyle: { color: COLORS.text },
    headerTintColor: COLORS.primary,
    contentStyle: { backgroundColor: COLORS.background },
  },

  // Metrics group screen options
  metricsScreenOptions: {
    headerShown: true,
    headerStyle: { backgroundColor: COLORS.background },
    headerTitleStyle: { color: COLORS.text },
    headerTintColor: COLORS.primary,
  },

  // Health group screen options
  healthScreenOptions: {
    headerShown: true,
    headerStyle: { backgroundColor: COLORS.background },
    headerTitleStyle: { color: COLORS.text },
    headerTintColor: COLORS.primary,
  },

  // Decay group screen options
  decayScreenOptions: {
    headerShown: true,
    headerStyle: { backgroundColor: COLORS.background },
    headerTitleStyle: { color: COLORS.text },
    headerTintColor: COLORS.primary,
  },

  // Modal presentation options (for export, settings)
  modalScreenOptions: {
    presentation: 'modal' as const,
    headerShown: true,
    headerStyle: { backgroundColor: COLORS.background },
    headerTitleStyle: { color: COLORS.text },
    headerTintColor: COLORS.primary,
  },

  // Screen titles configuration
  screenTitles: {
    // Metrics
    MetricsOverview: 'Analytics',
    PerformanceMetrics: 'Performance',
    EngagementStats: 'Engagement Stats',
    ContentAnalytics: 'Content Analytics',
    UserMetrics: 'User Metrics',
    MetricsHistory: 'Metrics History',
    MetricsExport: 'Export Data',
    // Health
    HealthOverview: 'Health Dashboard',
    SpaceHealth: 'Space Health',
    SpaceHealthHistory: 'Health History',
    NetworkHealth: 'Network Health',
    NodeHealth: 'Node Health',
    HealthAlerts: 'Health Alerts',
    HealthSettings: 'Health Settings',
    // Decay
    DecayOverview: 'Decay Overview',
    DecayTracker: 'Decay Tracker',
    DecayRates: 'Decay Rates',
    DecayHistory: 'Decay History',
    DecayPrediction: 'Decay Prediction',
    DecaySettings: 'Decay Settings',
  } as Record<keyof AnalyticsStackParamList, string>,
};

// ============================================================================
// NAVIGATION HELPERS
// ============================================================================

/**
 * Helper functions for Analytics navigation
 */
export const AnalyticsNavigationHelpers = {
  // Navigate to engagement stats for a space
  navigateToEngagementStats: (
    navigation: AnalyticsStackScreenProps<keyof AnalyticsStackParamList>['navigation'],
    spaceId?: string
  ) => {
    navigation.navigate('EngagementStats', { spaceId });
  },

  // Navigate to content analytics
  navigateToContentAnalytics: (
    navigation: AnalyticsStackScreenProps<keyof AnalyticsStackParamList>['navigation'],
    contentId?: string
  ) => {
    navigation.navigate('ContentAnalytics', { contentId });
  },

  // Navigate to user metrics
  navigateToUserMetrics: (
    navigation: AnalyticsStackScreenProps<keyof AnalyticsStackParamList>['navigation'],
    userId?: string
  ) => {
    navigation.navigate('UserMetrics', { userId });
  },

  // Navigate to metrics history
  navigateToMetricsHistory: (
    navigation: AnalyticsStackScreenProps<keyof AnalyticsStackParamList>['navigation'],
    metricType: string,
    period?: 'day' | 'week' | 'month'
  ) => {
    navigation.navigate('MetricsHistory', { metricType, period });
  },

  // Navigate to metrics export modal
  navigateToMetricsExport: (
    navigation: AnalyticsStackScreenProps<keyof AnalyticsStackParamList>['navigation']
  ) => {
    navigation.navigate('MetricsExport');
  },

  // Navigate to space health
  navigateToSpaceHealth: (
    navigation: AnalyticsStackScreenProps<keyof AnalyticsStackParamList>['navigation'],
    spaceId: string
  ) => {
    navigation.navigate('SpaceHealth', { spaceId });
  },

  // Navigate to space health history
  navigateToSpaceHealthHistory: (
    navigation: AnalyticsStackScreenProps<keyof AnalyticsStackParamList>['navigation'],
    spaceId: string
  ) => {
    navigation.navigate('SpaceHealthHistory', { spaceId });
  },

  // Navigate to health alerts
  navigateToHealthAlerts: (
    navigation: AnalyticsStackScreenProps<keyof AnalyticsStackParamList>['navigation']
  ) => {
    navigation.navigate('HealthAlerts');
  },

  // Navigate to decay tracker
  navigateToDecayTracker: (
    navigation: AnalyticsStackScreenProps<keyof AnalyticsStackParamList>['navigation'],
    contentId?: string
  ) => {
    navigation.navigate('DecayTracker', { contentId });
  },

  // Navigate to decay history for content
  navigateToDecayHistory: (
    navigation: AnalyticsStackScreenProps<keyof AnalyticsStackParamList>['navigation'],
    contentId: string
  ) => {
    navigation.navigate('DecayHistory', { contentId });
  },

  // Navigate to decay prediction
  navigateToDecayPrediction: (
    navigation: AnalyticsStackScreenProps<keyof AnalyticsStackParamList>['navigation'],
    contentId: string
  ) => {
    navigation.navigate('DecayPrediction', { contentId });
  },

  // Navigate to decay settings
  navigateToDecaySettings: (
    navigation: AnalyticsStackScreenProps<keyof AnalyticsStackParamList>['navigation']
  ) => {
    navigation.navigate('DecaySettings');
  },
};

// ============================================================================
// PLACEHOLDER SCREENS (to be replaced with actual implementations)
// ============================================================================

// Placeholder components for screens not yet implemented
const PlaceholderScreen = ({ route }: { route: { name: string } }) => {
  const React = require('react');
  const { View, Text } = require('react-native');

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

const Stack = createNativeStackNavigator<AnalyticsStackParamList>();

/**
 * Analytics Navigator Component
 * Groups Metrics, Health, and Decay navigation
 */
export function AnalyticsNavigator() {
  return (
    <Stack.Navigator
      screenOptions={AnalyticsNavigatorSetup.defaultScreenOptions}
    >
      {/* Metrics Group */}
      <Stack.Group screenOptions={AnalyticsNavigatorSetup.metricsScreenOptions}>
        <Stack.Screen
          name="MetricsOverview"
          component={PlaceholderScreen}
          options={{ title: AnalyticsNavigatorSetup.screenTitles.MetricsOverview }}
        />
        <Stack.Screen
          name="PerformanceMetrics"
          component={PlaceholderScreen}
          options={{ title: AnalyticsNavigatorSetup.screenTitles.PerformanceMetrics }}
        />
        <Stack.Screen
          name="EngagementStats"
          component={PlaceholderScreen}
          options={({ route }) => ({
            title: route.params?.spaceId
              ? `Stats: ${route.params.spaceId.slice(0, 8)}...`
              : AnalyticsNavigatorSetup.screenTitles.EngagementStats,
          })}
        />
        <Stack.Screen
          name="ContentAnalytics"
          component={PlaceholderScreen}
          options={({ route }) => ({
            title: route.params?.contentId
              ? `Analytics: ${route.params.contentId.slice(0, 8)}...`
              : AnalyticsNavigatorSetup.screenTitles.ContentAnalytics,
          })}
        />
        <Stack.Screen
          name="UserMetrics"
          component={PlaceholderScreen}
          options={({ route }) => ({
            title: route.params?.userId
              ? `User: ${route.params.userId.slice(0, 8)}...`
              : AnalyticsNavigatorSetup.screenTitles.UserMetrics,
          })}
        />
        <Stack.Screen
          name="MetricsHistory"
          component={PlaceholderScreen}
          options={({ route }) => ({
            title: `${route.params.metricType} History`,
          })}
        />
      </Stack.Group>

      {/* Metrics Modals */}
      <Stack.Group screenOptions={AnalyticsNavigatorSetup.modalScreenOptions}>
        <Stack.Screen
          name="MetricsExport"
          component={PlaceholderScreen}
          options={{ title: AnalyticsNavigatorSetup.screenTitles.MetricsExport }}
        />
      </Stack.Group>

      {/* Health Group */}
      <Stack.Group screenOptions={AnalyticsNavigatorSetup.healthScreenOptions}>
        <Stack.Screen
          name="HealthOverview"
          component={PlaceholderScreen}
          options={{ title: AnalyticsNavigatorSetup.screenTitles.HealthOverview }}
        />
        <Stack.Screen
          name="SpaceHealth"
          component={PlaceholderScreen}
          options={({ route }) => ({
            title: `Health: ${route.params.spaceId.slice(0, 8)}...`,
          })}
        />
        <Stack.Screen
          name="SpaceHealthHistory"
          component={PlaceholderScreen}
          options={({ route }) => ({
            title: `History: ${route.params.spaceId.slice(0, 8)}...`,
          })}
        />
        <Stack.Screen
          name="NetworkHealth"
          component={PlaceholderScreen}
          options={{ title: AnalyticsNavigatorSetup.screenTitles.NetworkHealth }}
        />
        <Stack.Screen
          name="NodeHealth"
          component={PlaceholderScreen}
          options={{ title: AnalyticsNavigatorSetup.screenTitles.NodeHealth }}
        />
        <Stack.Screen
          name="HealthAlerts"
          component={PlaceholderScreen}
          options={{ title: AnalyticsNavigatorSetup.screenTitles.HealthAlerts }}
        />
      </Stack.Group>

      {/* Health Modals */}
      <Stack.Group screenOptions={AnalyticsNavigatorSetup.modalScreenOptions}>
        <Stack.Screen
          name="HealthSettings"
          component={PlaceholderScreen}
          options={{ title: AnalyticsNavigatorSetup.screenTitles.HealthSettings }}
        />
      </Stack.Group>

      {/* Decay Group */}
      <Stack.Group screenOptions={AnalyticsNavigatorSetup.decayScreenOptions}>
        <Stack.Screen
          name="DecayOverview"
          component={PlaceholderScreen}
          options={{ title: AnalyticsNavigatorSetup.screenTitles.DecayOverview }}
        />
        <Stack.Screen
          name="DecayTracker"
          component={PlaceholderScreen}
          options={({ route }) => ({
            title: route.params?.contentId
              ? `Decay: ${route.params.contentId.slice(0, 8)}...`
              : AnalyticsNavigatorSetup.screenTitles.DecayTracker,
          })}
        />
        <Stack.Screen
          name="DecayRates"
          component={PlaceholderScreen}
          options={{ title: AnalyticsNavigatorSetup.screenTitles.DecayRates }}
        />
        <Stack.Screen
          name="DecayHistory"
          component={PlaceholderScreen}
          options={({ route }) => ({
            title: `Decay History: ${route.params.contentId.slice(0, 8)}...`,
          })}
        />
        <Stack.Screen
          name="DecayPrediction"
          component={PlaceholderScreen}
          options={({ route }) => ({
            title: `Prediction: ${route.params.contentId.slice(0, 8)}...`,
          })}
        />
      </Stack.Group>

      {/* Decay Modals */}
      <Stack.Group screenOptions={AnalyticsNavigatorSetup.modalScreenOptions}>
        <Stack.Screen
          name="DecaySettings"
          component={PlaceholderScreen}
          options={{ title: AnalyticsNavigatorSetup.screenTitles.DecaySettings }}
        />
      </Stack.Group>
    </Stack.Navigator>
  );
}

export default AnalyticsNavigator;
