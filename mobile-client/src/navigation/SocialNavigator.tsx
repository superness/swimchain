/**
 * SocialNavigator - Navigation for Social Features Group
 * Handles: Engagement, Reputation, Following navigation
 *
 * Routes:
 * - Engagement: Engagement tracking, contribution history, engagement pools
 * - Reputation: Reputation scores, endorsements, trust levels
 * - Following: Follow lists, follower management, activity feeds
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
 * Social feature navigation param lists
 */

// Engagement-related screens
export type EngagementStackParamList = {
  EngagementOverview: undefined;
  EngagementHistory: { userId?: string };
  EngagementPools: undefined;
  EngagementPoolDetail: { poolId: string };
  ContributionHistory: { userId: string };
  ContributionDetail: { contributionId: string };
};

// Reputation-related screens
export type ReputationStackParamList = {
  ReputationOverview: undefined;
  ReputationProfile: { userId: string };
  ReputationHistory: { userId: string };
  EndorsementsList: { userId: string };
  EndorsementGive: { recipientId: string };
  TrustLevels: undefined;
  TrustLevelDetail: { level: number };
};

// Following-related screens
export type FollowingStackParamList = {
  FollowingList: { userId?: string };
  FollowersList: { userId?: string };
  FollowRequests: undefined;
  FollowSuggestions: undefined;
  UserActivity: { userId: string };
  FollowSettings: undefined;
};

// Combined Social navigation param list
export type SocialStackParamList = {
  // Engagement routes
  EngagementOverview: undefined;
  EngagementHistory: { userId?: string };
  EngagementPools: undefined;
  EngagementPoolDetail: { poolId: string };
  ContributionHistory: { userId: string };
  ContributionDetail: { contributionId: string };

  // Reputation routes
  ReputationOverview: undefined;
  ReputationProfile: { userId: string };
  ReputationHistory: { userId: string };
  EndorsementsList: { userId: string };
  EndorsementGive: { recipientId: string };
  TrustLevels: undefined;
  TrustLevelDetail: { level: number };

  // Following routes
  FollowingList: { userId?: string };
  FollowersList: { userId?: string };
  FollowRequests: undefined;
  FollowSuggestions: undefined;
  UserActivity: { userId: string };
  FollowSettings: undefined;
};

// ============================================================================
// SCREEN PROPS TYPES
// ============================================================================

export type SocialStackScreenProps<T extends keyof SocialStackParamList> =
  NativeStackScreenProps<SocialStackParamList, T>;

export type EngagementStackScreenProps<T extends keyof EngagementStackParamList> =
  NativeStackScreenProps<EngagementStackParamList, T>;

export type ReputationStackScreenProps<T extends keyof ReputationStackParamList> =
  NativeStackScreenProps<ReputationStackParamList, T>;

export type FollowingStackScreenProps<T extends keyof FollowingStackParamList> =
  NativeStackScreenProps<FollowingStackParamList, T>;

// ============================================================================
// ROUTE DEFINITIONS
// ============================================================================

/**
 * Route configuration for Social features
 */
export const SOCIAL_ROUTES = {
  // Engagement routes
  ENGAGEMENT: {
    OVERVIEW: 'EngagementOverview',
    HISTORY: 'EngagementHistory',
    POOLS: 'EngagementPools',
    POOL_DETAIL: 'EngagementPoolDetail',
    CONTRIBUTION_HISTORY: 'ContributionHistory',
    CONTRIBUTION_DETAIL: 'ContributionDetail',
  },

  // Reputation routes
  REPUTATION: {
    OVERVIEW: 'ReputationOverview',
    PROFILE: 'ReputationProfile',
    HISTORY: 'ReputationHistory',
    ENDORSEMENTS: 'EndorsementsList',
    GIVE_ENDORSEMENT: 'EndorsementGive',
    TRUST_LEVELS: 'TrustLevels',
    TRUST_LEVEL_DETAIL: 'TrustLevelDetail',
  },

  // Following routes
  FOLLOWING: {
    LIST: 'FollowingList',
    FOLLOWERS: 'FollowersList',
    REQUESTS: 'FollowRequests',
    SUGGESTIONS: 'FollowSuggestions',
    USER_ACTIVITY: 'UserActivity',
    SETTINGS: 'FollowSettings',
  },
} as const;

// ============================================================================
// NAVIGATION SELECTORS
// ============================================================================

/**
 * Selectors for extracting route params and state
 */
export const SocialNavigationSelectors = {
  // Engagement selectors
  getEngagementHistoryParams: (route: SocialStackScreenProps<'EngagementHistory'>['route']) => ({
    userId: route.params?.userId,
  }),

  getEngagementPoolDetailParams: (route: SocialStackScreenProps<'EngagementPoolDetail'>['route']) => ({
    poolId: route.params.poolId,
  }),

  getContributionHistoryParams: (route: SocialStackScreenProps<'ContributionHistory'>['route']) => ({
    userId: route.params.userId,
  }),

  getContributionDetailParams: (route: SocialStackScreenProps<'ContributionDetail'>['route']) => ({
    contributionId: route.params.contributionId,
  }),

  // Reputation selectors
  getReputationProfileParams: (route: SocialStackScreenProps<'ReputationProfile'>['route']) => ({
    userId: route.params.userId,
  }),

  getReputationHistoryParams: (route: SocialStackScreenProps<'ReputationHistory'>['route']) => ({
    userId: route.params.userId,
  }),

  getEndorsementsListParams: (route: SocialStackScreenProps<'EndorsementsList'>['route']) => ({
    userId: route.params.userId,
  }),

  getEndorsementGiveParams: (route: SocialStackScreenProps<'EndorsementGive'>['route']) => ({
    recipientId: route.params.recipientId,
  }),

  getTrustLevelDetailParams: (route: SocialStackScreenProps<'TrustLevelDetail'>['route']) => ({
    level: route.params.level,
  }),

  // Following selectors
  getFollowingListParams: (route: SocialStackScreenProps<'FollowingList'>['route']) => ({
    userId: route.params?.userId,
  }),

  getFollowersListParams: (route: SocialStackScreenProps<'FollowersList'>['route']) => ({
    userId: route.params?.userId,
  }),

  getUserActivityParams: (route: SocialStackScreenProps<'UserActivity'>['route']) => ({
    userId: route.params.userId,
  }),
};

// ============================================================================
// SETUP DEFINITIONS
// ============================================================================

/**
 * Navigator screen options configuration
 */
export const SocialNavigatorSetup = {
  // Default screen options for Social navigator
  defaultScreenOptions: {
    headerShown: true,
    headerStyle: { backgroundColor: COLORS.background },
    headerTitleStyle: { color: COLORS.text },
    headerTintColor: COLORS.primary,
    contentStyle: { backgroundColor: COLORS.background },
  },

  // Engagement group screen options
  engagementScreenOptions: {
    headerShown: true,
    headerStyle: { backgroundColor: COLORS.background },
    headerTitleStyle: { color: COLORS.text },
    headerTintColor: COLORS.primary,
  },

  // Reputation group screen options
  reputationScreenOptions: {
    headerShown: true,
    headerStyle: { backgroundColor: COLORS.background },
    headerTitleStyle: { color: COLORS.text },
    headerTintColor: COLORS.primary,
  },

  // Following group screen options
  followingScreenOptions: {
    headerShown: true,
    headerStyle: { backgroundColor: COLORS.background },
    headerTitleStyle: { color: COLORS.text },
    headerTintColor: COLORS.primary,
  },

  // Modal presentation options (for give endorsement, settings)
  modalScreenOptions: {
    presentation: 'modal' as const,
    headerShown: true,
    headerStyle: { backgroundColor: COLORS.background },
    headerTitleStyle: { color: COLORS.text },
    headerTintColor: COLORS.primary,
  },

  // Screen titles configuration
  screenTitles: {
    // Engagement
    EngagementOverview: 'Engagement',
    EngagementHistory: 'Engagement History',
    EngagementPools: 'Engagement Pools',
    EngagementPoolDetail: 'Pool Details',
    ContributionHistory: 'Contributions',
    ContributionDetail: 'Contribution',
    // Reputation
    ReputationOverview: 'Reputation',
    ReputationProfile: 'Reputation Profile',
    ReputationHistory: 'Reputation History',
    EndorsementsList: 'Endorsements',
    EndorsementGive: 'Give Endorsement',
    TrustLevels: 'Trust Levels',
    TrustLevelDetail: 'Trust Level',
    // Following
    FollowingList: 'Following',
    FollowersList: 'Followers',
    FollowRequests: 'Follow Requests',
    FollowSuggestions: 'Suggestions',
    UserActivity: 'Activity',
    FollowSettings: 'Follow Settings',
  } as Record<keyof SocialStackParamList, string>,
};

// ============================================================================
// NAVIGATION HELPERS
// ============================================================================

/**
 * Helper functions for Social navigation
 */
export const SocialNavigationHelpers = {
  // Navigate to engagement overview
  navigateToEngagementOverview: (
    navigation: SocialStackScreenProps<keyof SocialStackParamList>['navigation']
  ) => {
    navigation.navigate('EngagementOverview');
  },

  // Navigate to engagement history
  navigateToEngagementHistory: (
    navigation: SocialStackScreenProps<keyof SocialStackParamList>['navigation'],
    userId?: string
  ) => {
    navigation.navigate('EngagementHistory', { userId });
  },

  // Navigate to engagement pools
  navigateToEngagementPools: (
    navigation: SocialStackScreenProps<keyof SocialStackParamList>['navigation']
  ) => {
    navigation.navigate('EngagementPools');
  },

  // Navigate to engagement pool detail
  navigateToEngagementPoolDetail: (
    navigation: SocialStackScreenProps<keyof SocialStackParamList>['navigation'],
    poolId: string
  ) => {
    navigation.navigate('EngagementPoolDetail', { poolId });
  },

  // Navigate to contribution history
  navigateToContributionHistory: (
    navigation: SocialStackScreenProps<keyof SocialStackParamList>['navigation'],
    userId: string
  ) => {
    navigation.navigate('ContributionHistory', { userId });
  },

  // Navigate to contribution detail
  navigateToContributionDetail: (
    navigation: SocialStackScreenProps<keyof SocialStackParamList>['navigation'],
    contributionId: string
  ) => {
    navigation.navigate('ContributionDetail', { contributionId });
  },

  // Navigate to reputation overview
  navigateToReputationOverview: (
    navigation: SocialStackScreenProps<keyof SocialStackParamList>['navigation']
  ) => {
    navigation.navigate('ReputationOverview');
  },

  // Navigate to reputation profile
  navigateToReputationProfile: (
    navigation: SocialStackScreenProps<keyof SocialStackParamList>['navigation'],
    userId: string
  ) => {
    navigation.navigate('ReputationProfile', { userId });
  },

  // Navigate to reputation history
  navigateToReputationHistory: (
    navigation: SocialStackScreenProps<keyof SocialStackParamList>['navigation'],
    userId: string
  ) => {
    navigation.navigate('ReputationHistory', { userId });
  },

  // Navigate to endorsements list
  navigateToEndorsementsList: (
    navigation: SocialStackScreenProps<keyof SocialStackParamList>['navigation'],
    userId: string
  ) => {
    navigation.navigate('EndorsementsList', { userId });
  },

  // Navigate to give endorsement
  navigateToGiveEndorsement: (
    navigation: SocialStackScreenProps<keyof SocialStackParamList>['navigation'],
    recipientId: string
  ) => {
    navigation.navigate('EndorsementGive', { recipientId });
  },

  // Navigate to trust levels
  navigateToTrustLevels: (
    navigation: SocialStackScreenProps<keyof SocialStackParamList>['navigation']
  ) => {
    navigation.navigate('TrustLevels');
  },

  // Navigate to trust level detail
  navigateToTrustLevelDetail: (
    navigation: SocialStackScreenProps<keyof SocialStackParamList>['navigation'],
    level: number
  ) => {
    navigation.navigate('TrustLevelDetail', { level });
  },

  // Navigate to following list
  navigateToFollowingList: (
    navigation: SocialStackScreenProps<keyof SocialStackParamList>['navigation'],
    userId?: string
  ) => {
    navigation.navigate('FollowingList', { userId });
  },

  // Navigate to followers list
  navigateToFollowersList: (
    navigation: SocialStackScreenProps<keyof SocialStackParamList>['navigation'],
    userId?: string
  ) => {
    navigation.navigate('FollowersList', { userId });
  },

  // Navigate to follow requests
  navigateToFollowRequests: (
    navigation: SocialStackScreenProps<keyof SocialStackParamList>['navigation']
  ) => {
    navigation.navigate('FollowRequests');
  },

  // Navigate to follow suggestions
  navigateToFollowSuggestions: (
    navigation: SocialStackScreenProps<keyof SocialStackParamList>['navigation']
  ) => {
    navigation.navigate('FollowSuggestions');
  },

  // Navigate to user activity
  navigateToUserActivity: (
    navigation: SocialStackScreenProps<keyof SocialStackParamList>['navigation'],
    userId: string
  ) => {
    navigation.navigate('UserActivity', { userId });
  },

  // Navigate to follow settings
  navigateToFollowSettings: (
    navigation: SocialStackScreenProps<keyof SocialStackParamList>['navigation']
  ) => {
    navigation.navigate('FollowSettings');
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

const Stack = createNativeStackNavigator<SocialStackParamList>();

/**
 * Social Navigator Component
 * Groups Engagement, Reputation, and Following navigation
 */
export function SocialNavigator() {
  return (
    <Stack.Navigator
      screenOptions={SocialNavigatorSetup.defaultScreenOptions}
      initialRouteName="EngagementOverview"
    >
      {/* Engagement Group */}
      <Stack.Group screenOptions={SocialNavigatorSetup.engagementScreenOptions}>
        <Stack.Screen
          name="EngagementOverview"
          component={PlaceholderScreen}
          options={{ title: SocialNavigatorSetup.screenTitles.EngagementOverview }}
        />
        <Stack.Screen
          name="EngagementHistory"
          component={PlaceholderScreen}
          options={{ title: SocialNavigatorSetup.screenTitles.EngagementHistory }}
        />
        <Stack.Screen
          name="EngagementPools"
          component={PlaceholderScreen}
          options={{ title: SocialNavigatorSetup.screenTitles.EngagementPools }}
        />
        <Stack.Screen
          name="EngagementPoolDetail"
          component={PlaceholderScreen}
          options={({ route }) => ({
            title: `Pool: ${route.params.poolId.slice(0, 8)}...`,
          })}
        />
        <Stack.Screen
          name="ContributionHistory"
          component={PlaceholderScreen}
          options={{ title: SocialNavigatorSetup.screenTitles.ContributionHistory }}
        />
        <Stack.Screen
          name="ContributionDetail"
          component={PlaceholderScreen}
          options={{ title: SocialNavigatorSetup.screenTitles.ContributionDetail }}
        />
      </Stack.Group>

      {/* Reputation Group */}
      <Stack.Group screenOptions={SocialNavigatorSetup.reputationScreenOptions}>
        <Stack.Screen
          name="ReputationOverview"
          component={PlaceholderScreen}
          options={{ title: SocialNavigatorSetup.screenTitles.ReputationOverview }}
        />
        <Stack.Screen
          name="ReputationProfile"
          component={PlaceholderScreen}
          options={{ title: SocialNavigatorSetup.screenTitles.ReputationProfile }}
        />
        <Stack.Screen
          name="ReputationHistory"
          component={PlaceholderScreen}
          options={{ title: SocialNavigatorSetup.screenTitles.ReputationHistory }}
        />
        <Stack.Screen
          name="EndorsementsList"
          component={PlaceholderScreen}
          options={{ title: SocialNavigatorSetup.screenTitles.EndorsementsList }}
        />
        <Stack.Screen
          name="TrustLevels"
          component={PlaceholderScreen}
          options={{ title: SocialNavigatorSetup.screenTitles.TrustLevels }}
        />
        <Stack.Screen
          name="TrustLevelDetail"
          component={PlaceholderScreen}
          options={({ route }) => ({
            title: `Trust Level ${route.params.level}`,
          })}
        />
      </Stack.Group>

      {/* Following Group */}
      <Stack.Group screenOptions={SocialNavigatorSetup.followingScreenOptions}>
        <Stack.Screen
          name="FollowingList"
          component={PlaceholderScreen}
          options={{ title: SocialNavigatorSetup.screenTitles.FollowingList }}
        />
        <Stack.Screen
          name="FollowersList"
          component={PlaceholderScreen}
          options={{ title: SocialNavigatorSetup.screenTitles.FollowersList }}
        />
        <Stack.Screen
          name="FollowRequests"
          component={PlaceholderScreen}
          options={{ title: SocialNavigatorSetup.screenTitles.FollowRequests }}
        />
        <Stack.Screen
          name="FollowSuggestions"
          component={PlaceholderScreen}
          options={{ title: SocialNavigatorSetup.screenTitles.FollowSuggestions }}
        />
        <Stack.Screen
          name="UserActivity"
          component={PlaceholderScreen}
          options={{ title: SocialNavigatorSetup.screenTitles.UserActivity }}
        />
      </Stack.Group>

      {/* Modal Screens */}
      <Stack.Group screenOptions={SocialNavigatorSetup.modalScreenOptions}>
        <Stack.Screen
          name="EndorsementGive"
          component={PlaceholderScreen}
          options={{ title: SocialNavigatorSetup.screenTitles.EndorsementGive }}
        />
        <Stack.Screen
          name="FollowSettings"
          component={PlaceholderScreen}
          options={{ title: SocialNavigatorSetup.screenTitles.FollowSettings }}
        />
      </Stack.Group>
    </Stack.Navigator>
  );
}

export default SocialNavigator;
