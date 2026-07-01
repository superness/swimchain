/**
 * SponsorshipNavigator - Navigation for Sponsorship Features Group
 * Handles: Sponsorship, Penalties navigation
 *
 * Routes:
 * - Sponsorship: Sponsorship offers, claims, management, sponsor dashboard
 * - Penalties: Penalty history, penalty detail, appeals, penalty settings
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
 * Sponsorship feature navigation param lists
 */

// Sponsorship-related screens
export type SponsorshipStackParamList = {
  SponsorshipOverview: undefined;
  SponsorshipOffers: { spaceId?: string };
  SponsorshipOfferDetail: { offerId: string };
  SponsorshipCreate: { spaceId?: string };
  SponsorshipClaim: { offerId: string };
  SponsorshipManage: { sponsorshipId: string };
  SponsorshipHistory: { userId?: string };
  SponsorDashboard: undefined;
  SponsorSettings: undefined;
};

// Penalties-related screens
export type PenaltiesStackParamList = {
  PenaltiesOverview: undefined;
  PenaltyHistory: { userId?: string };
  PenaltyDetail: { penaltyId: string };
  PenaltyAppeal: { penaltyId: string };
  PenaltyAppealDetail: { appealId: string };
  PenaltySettings: undefined;
  PenaltyTiers: undefined;
  ActivePenalties: { userId?: string };
};

// Combined Sponsorship navigation param list
export type SponsorshipNavigatorParamList = {
  // Sponsorship routes
  SponsorshipOverview: undefined;
  SponsorshipOffers: { spaceId?: string };
  SponsorshipOfferDetail: { offerId: string };
  SponsorshipCreate: { spaceId?: string };
  SponsorshipClaim: { offerId: string };
  SponsorshipManage: { sponsorshipId: string };
  SponsorshipHistory: { userId?: string };
  SponsorDashboard: undefined;
  SponsorSettings: undefined;

  // Penalties routes
  PenaltiesOverview: undefined;
  PenaltyHistory: { userId?: string };
  PenaltyDetail: { penaltyId: string };
  PenaltyAppeal: { penaltyId: string };
  PenaltyAppealDetail: { appealId: string };
  PenaltySettings: undefined;
  PenaltyTiers: undefined;
  ActivePenalties: { userId?: string };
};

// ============================================================================
// SCREEN PROPS TYPES
// ============================================================================

export type SponsorshipNavigatorScreenProps<T extends keyof SponsorshipNavigatorParamList> =
  NativeStackScreenProps<SponsorshipNavigatorParamList, T>;

export type SponsorshipStackScreenProps<T extends keyof SponsorshipStackParamList> =
  NativeStackScreenProps<SponsorshipStackParamList, T>;

export type PenaltiesStackScreenProps<T extends keyof PenaltiesStackParamList> =
  NativeStackScreenProps<PenaltiesStackParamList, T>;

// ============================================================================
// ROUTE DEFINITIONS
// ============================================================================

/**
 * Route configuration for Sponsorship features
 */
export const SPONSORSHIP_ROUTES = {
  // Sponsorship routes
  SPONSORSHIP: {
    OVERVIEW: 'SponsorshipOverview',
    OFFERS: 'SponsorshipOffers',
    OFFER_DETAIL: 'SponsorshipOfferDetail',
    CREATE: 'SponsorshipCreate',
    CLAIM: 'SponsorshipClaim',
    MANAGE: 'SponsorshipManage',
    HISTORY: 'SponsorshipHistory',
    DASHBOARD: 'SponsorDashboard',
    SETTINGS: 'SponsorSettings',
  },

  // Penalties routes
  PENALTIES: {
    OVERVIEW: 'PenaltiesOverview',
    HISTORY: 'PenaltyHistory',
    DETAIL: 'PenaltyDetail',
    APPEAL: 'PenaltyAppeal',
    APPEAL_DETAIL: 'PenaltyAppealDetail',
    SETTINGS: 'PenaltySettings',
    TIERS: 'PenaltyTiers',
    ACTIVE: 'ActivePenalties',
  },
} as const;

// ============================================================================
// NAVIGATION SELECTORS
// ============================================================================

/**
 * Selectors for extracting route params and state
 */
export const SponsorshipNavigationSelectors = {
  // Sponsorship selectors
  getSponsorshipOffersParams: (route: SponsorshipNavigatorScreenProps<'SponsorshipOffers'>['route']) => ({
    spaceId: route.params?.spaceId,
  }),

  getSponsorshipOfferDetailParams: (route: SponsorshipNavigatorScreenProps<'SponsorshipOfferDetail'>['route']) => ({
    offerId: route.params.offerId,
  }),

  getSponsorshipCreateParams: (route: SponsorshipNavigatorScreenProps<'SponsorshipCreate'>['route']) => ({
    spaceId: route.params?.spaceId,
  }),

  getSponsorshipClaimParams: (route: SponsorshipNavigatorScreenProps<'SponsorshipClaim'>['route']) => ({
    offerId: route.params.offerId,
  }),

  getSponsorshipManageParams: (route: SponsorshipNavigatorScreenProps<'SponsorshipManage'>['route']) => ({
    sponsorshipId: route.params.sponsorshipId,
  }),

  getSponsorshipHistoryParams: (route: SponsorshipNavigatorScreenProps<'SponsorshipHistory'>['route']) => ({
    userId: route.params?.userId,
  }),

  // Penalties selectors
  getPenaltyHistoryParams: (route: SponsorshipNavigatorScreenProps<'PenaltyHistory'>['route']) => ({
    userId: route.params?.userId,
  }),

  getPenaltyDetailParams: (route: SponsorshipNavigatorScreenProps<'PenaltyDetail'>['route']) => ({
    penaltyId: route.params.penaltyId,
  }),

  getPenaltyAppealParams: (route: SponsorshipNavigatorScreenProps<'PenaltyAppeal'>['route']) => ({
    penaltyId: route.params.penaltyId,
  }),

  getPenaltyAppealDetailParams: (route: SponsorshipNavigatorScreenProps<'PenaltyAppealDetail'>['route']) => ({
    appealId: route.params.appealId,
  }),

  getActivePenaltiesParams: (route: SponsorshipNavigatorScreenProps<'ActivePenalties'>['route']) => ({
    userId: route.params?.userId,
  }),
};

// ============================================================================
// SETUP DEFINITIONS
// ============================================================================

/**
 * Navigator screen options configuration
 */
export const SponsorshipNavigatorSetup = {
  // Default screen options for Sponsorship navigator
  defaultScreenOptions: {
    headerShown: true,
    headerStyle: { backgroundColor: COLORS.background },
    headerTitleStyle: { color: COLORS.text },
    headerTintColor: COLORS.primary,
    contentStyle: { backgroundColor: COLORS.background },
  },

  // Sponsorship group screen options
  sponsorshipScreenOptions: {
    headerShown: true,
    headerStyle: { backgroundColor: COLORS.background },
    headerTitleStyle: { color: COLORS.text },
    headerTintColor: COLORS.primary,
  },

  // Penalties group screen options
  penaltiesScreenOptions: {
    headerShown: true,
    headerStyle: { backgroundColor: COLORS.background },
    headerTitleStyle: { color: COLORS.text },
    headerTintColor: COLORS.warning,
  },

  // Modal presentation options (for create/claim screens)
  modalScreenOptions: {
    presentation: 'modal' as const,
    headerShown: true,
    headerStyle: { backgroundColor: COLORS.background },
    headerTitleStyle: { color: COLORS.text },
    headerTintColor: COLORS.primary,
  },

  // Appeal modal options (for penalty appeals)
  appealModalOptions: {
    presentation: 'modal' as const,
    headerShown: true,
    headerStyle: { backgroundColor: COLORS.background },
    headerTitleStyle: { color: COLORS.text },
    headerTintColor: COLORS.warning,
    gestureEnabled: false,
  },

  // Screen titles configuration
  screenTitles: {
    // Sponsorship
    SponsorshipOverview: 'Sponsorship',
    SponsorshipOffers: 'Available Offers',
    SponsorshipOfferDetail: 'Offer Details',
    SponsorshipCreate: 'Create Sponsorship',
    SponsorshipClaim: 'Claim Sponsorship',
    SponsorshipManage: 'Manage Sponsorship',
    SponsorshipHistory: 'Sponsorship History',
    SponsorDashboard: 'Sponsor Dashboard',
    SponsorSettings: 'Sponsor Settings',
    // Penalties
    PenaltiesOverview: 'Penalties',
    PenaltyHistory: 'Penalty History',
    PenaltyDetail: 'Penalty Details',
    PenaltyAppeal: 'Appeal Penalty',
    PenaltyAppealDetail: 'Appeal Details',
    PenaltySettings: 'Penalty Settings',
    PenaltyTiers: 'Penalty Tiers',
    ActivePenalties: 'Active Penalties',
  } as Record<keyof SponsorshipNavigatorParamList, string>,
};

// ============================================================================
// NAVIGATION HELPERS
// ============================================================================

/**
 * Helper functions for Sponsorship navigation
 */
export const SponsorshipNavigationHelpers = {
  // Navigate to sponsorship overview
  navigateToSponsorshipOverview: (
    navigation: SponsorshipNavigatorScreenProps<keyof SponsorshipNavigatorParamList>['navigation']
  ) => {
    navigation.navigate('SponsorshipOverview');
  },

  // Navigate to sponsorship offers
  navigateToSponsorshipOffers: (
    navigation: SponsorshipNavigatorScreenProps<keyof SponsorshipNavigatorParamList>['navigation'],
    spaceId?: string
  ) => {
    navigation.navigate('SponsorshipOffers', { spaceId });
  },

  // Navigate to sponsorship offer detail
  navigateToSponsorshipOfferDetail: (
    navigation: SponsorshipNavigatorScreenProps<keyof SponsorshipNavigatorParamList>['navigation'],
    offerId: string
  ) => {
    navigation.navigate('SponsorshipOfferDetail', { offerId });
  },

  // Navigate to create sponsorship
  navigateToSponsorshipCreate: (
    navigation: SponsorshipNavigatorScreenProps<keyof SponsorshipNavigatorParamList>['navigation'],
    spaceId?: string
  ) => {
    navigation.navigate('SponsorshipCreate', { spaceId });
  },

  // Navigate to claim sponsorship
  navigateToSponsorshipClaim: (
    navigation: SponsorshipNavigatorScreenProps<keyof SponsorshipNavigatorParamList>['navigation'],
    offerId: string
  ) => {
    navigation.navigate('SponsorshipClaim', { offerId });
  },

  // Navigate to manage sponsorship
  navigateToSponsorshipManage: (
    navigation: SponsorshipNavigatorScreenProps<keyof SponsorshipNavigatorParamList>['navigation'],
    sponsorshipId: string
  ) => {
    navigation.navigate('SponsorshipManage', { sponsorshipId });
  },

  // Navigate to sponsorship history
  navigateToSponsorshipHistory: (
    navigation: SponsorshipNavigatorScreenProps<keyof SponsorshipNavigatorParamList>['navigation'],
    userId?: string
  ) => {
    navigation.navigate('SponsorshipHistory', { userId });
  },

  // Navigate to sponsor dashboard
  navigateToSponsorDashboard: (
    navigation: SponsorshipNavigatorScreenProps<keyof SponsorshipNavigatorParamList>['navigation']
  ) => {
    navigation.navigate('SponsorDashboard');
  },

  // Navigate to sponsor settings
  navigateToSponsorSettings: (
    navigation: SponsorshipNavigatorScreenProps<keyof SponsorshipNavigatorParamList>['navigation']
  ) => {
    navigation.navigate('SponsorSettings');
  },

  // Navigate to penalties overview
  navigateToPenaltiesOverview: (
    navigation: SponsorshipNavigatorScreenProps<keyof SponsorshipNavigatorParamList>['navigation']
  ) => {
    navigation.navigate('PenaltiesOverview');
  },

  // Navigate to penalty history
  navigateToPenaltyHistory: (
    navigation: SponsorshipNavigatorScreenProps<keyof SponsorshipNavigatorParamList>['navigation'],
    userId?: string
  ) => {
    navigation.navigate('PenaltyHistory', { userId });
  },

  // Navigate to penalty detail
  navigateToPenaltyDetail: (
    navigation: SponsorshipNavigatorScreenProps<keyof SponsorshipNavigatorParamList>['navigation'],
    penaltyId: string
  ) => {
    navigation.navigate('PenaltyDetail', { penaltyId });
  },

  // Navigate to penalty appeal
  navigateToPenaltyAppeal: (
    navigation: SponsorshipNavigatorScreenProps<keyof SponsorshipNavigatorParamList>['navigation'],
    penaltyId: string
  ) => {
    navigation.navigate('PenaltyAppeal', { penaltyId });
  },

  // Navigate to penalty appeal detail
  navigateToPenaltyAppealDetail: (
    navigation: SponsorshipNavigatorScreenProps<keyof SponsorshipNavigatorParamList>['navigation'],
    appealId: string
  ) => {
    navigation.navigate('PenaltyAppealDetail', { appealId });
  },

  // Navigate to penalty settings
  navigateToPenaltySettings: (
    navigation: SponsorshipNavigatorScreenProps<keyof SponsorshipNavigatorParamList>['navigation']
  ) => {
    navigation.navigate('PenaltySettings');
  },

  // Navigate to penalty tiers
  navigateToPenaltyTiers: (
    navigation: SponsorshipNavigatorScreenProps<keyof SponsorshipNavigatorParamList>['navigation']
  ) => {
    navigation.navigate('PenaltyTiers');
  },

  // Navigate to active penalties
  navigateToActivePenalties: (
    navigation: SponsorshipNavigatorScreenProps<keyof SponsorshipNavigatorParamList>['navigation'],
    userId?: string
  ) => {
    navigation.navigate('ActivePenalties', { userId });
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

const Stack = createNativeStackNavigator<SponsorshipNavigatorParamList>();

/**
 * Sponsorship Navigator Component
 * Groups Sponsorship and Penalties navigation
 */
export function SponsorshipNavigator() {
  return (
    <Stack.Navigator
      screenOptions={SponsorshipNavigatorSetup.defaultScreenOptions}
      initialRouteName="SponsorshipOverview"
    >
      {/* Sponsorship Group */}
      <Stack.Group screenOptions={SponsorshipNavigatorSetup.sponsorshipScreenOptions}>
        <Stack.Screen
          name="SponsorshipOverview"
          component={PlaceholderScreen}
          options={{ title: SponsorshipNavigatorSetup.screenTitles.SponsorshipOverview }}
        />
        <Stack.Screen
          name="SponsorshipOffers"
          component={PlaceholderScreen}
          options={({ route }) => ({
            title: route.params?.spaceId
              ? `Offers: s/${route.params.spaceId}`
              : SponsorshipNavigatorSetup.screenTitles.SponsorshipOffers,
          })}
        />
        <Stack.Screen
          name="SponsorshipOfferDetail"
          component={PlaceholderScreen}
          options={{ title: SponsorshipNavigatorSetup.screenTitles.SponsorshipOfferDetail }}
        />
        <Stack.Screen
          name="SponsorshipManage"
          component={PlaceholderScreen}
          options={{ title: SponsorshipNavigatorSetup.screenTitles.SponsorshipManage }}
        />
        <Stack.Screen
          name="SponsorshipHistory"
          component={PlaceholderScreen}
          options={{ title: SponsorshipNavigatorSetup.screenTitles.SponsorshipHistory }}
        />
        <Stack.Screen
          name="SponsorDashboard"
          component={PlaceholderScreen}
          options={{ title: SponsorshipNavigatorSetup.screenTitles.SponsorDashboard }}
        />
        <Stack.Screen
          name="SponsorSettings"
          component={PlaceholderScreen}
          options={{ title: SponsorshipNavigatorSetup.screenTitles.SponsorSettings }}
        />
      </Stack.Group>

      {/* Penalties Group */}
      <Stack.Group screenOptions={SponsorshipNavigatorSetup.penaltiesScreenOptions}>
        <Stack.Screen
          name="PenaltiesOverview"
          component={PlaceholderScreen}
          options={{ title: SponsorshipNavigatorSetup.screenTitles.PenaltiesOverview }}
        />
        <Stack.Screen
          name="PenaltyHistory"
          component={PlaceholderScreen}
          options={{ title: SponsorshipNavigatorSetup.screenTitles.PenaltyHistory }}
        />
        <Stack.Screen
          name="PenaltyDetail"
          component={PlaceholderScreen}
          options={{ title: SponsorshipNavigatorSetup.screenTitles.PenaltyDetail }}
        />
        <Stack.Screen
          name="PenaltyAppealDetail"
          component={PlaceholderScreen}
          options={{ title: SponsorshipNavigatorSetup.screenTitles.PenaltyAppealDetail }}
        />
        <Stack.Screen
          name="PenaltySettings"
          component={PlaceholderScreen}
          options={{ title: SponsorshipNavigatorSetup.screenTitles.PenaltySettings }}
        />
        <Stack.Screen
          name="PenaltyTiers"
          component={PlaceholderScreen}
          options={{ title: SponsorshipNavigatorSetup.screenTitles.PenaltyTiers }}
        />
        <Stack.Screen
          name="ActivePenalties"
          component={PlaceholderScreen}
          options={{ title: SponsorshipNavigatorSetup.screenTitles.ActivePenalties }}
        />
      </Stack.Group>

      {/* Modal Screens */}
      <Stack.Group screenOptions={SponsorshipNavigatorSetup.modalScreenOptions}>
        <Stack.Screen
          name="SponsorshipCreate"
          component={PlaceholderScreen}
          options={{ title: SponsorshipNavigatorSetup.screenTitles.SponsorshipCreate }}
        />
        <Stack.Screen
          name="SponsorshipClaim"
          component={PlaceholderScreen}
          options={{ title: SponsorshipNavigatorSetup.screenTitles.SponsorshipClaim }}
        />
      </Stack.Group>

      {/* Appeal Modal Screens */}
      <Stack.Group screenOptions={SponsorshipNavigatorSetup.appealModalOptions}>
        <Stack.Screen
          name="PenaltyAppeal"
          component={PlaceholderScreen}
          options={{ title: SponsorshipNavigatorSetup.screenTitles.PenaltyAppeal }}
        />
      </Stack.Group>
    </Stack.Navigator>
  );
}

export default SponsorshipNavigator;
