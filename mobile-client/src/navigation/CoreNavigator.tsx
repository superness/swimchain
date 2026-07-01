/**
 * CoreNavigator - Navigation for Core Features Group
 * Handles: Identity, Spaces, and Content navigation
 *
 * Routes:
 * - Identity: Profile setup, key management, identity verification
 * - Spaces: Space browsing, creation, management
 * - Content: Content viewing, thread navigation, post details
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
 * Core feature navigation param lists
 */

// Identity-related screens
export type IdentityStackParamList = {
  IdentityOverview: undefined;
  IdentitySetup: { isFirstTime?: boolean };
  KeyManagement: undefined;
  KeyBackup: { keypairId: string };
  KeyRestore: undefined;
  IdentityVerification: { pubkey: string };
};

// Space-related screens
export type SpacesStackParamList = {
  SpacesList: undefined;
  SpaceView: { spaceId: string };
  SpaceCreate: undefined;
  SpaceSettings: { spaceId: string };
  SpaceMembers: { spaceId: string };
  SpaceModeration: { spaceId: string };
};

// Content-related screens
export type ContentStackParamList = {
  ContentFeed: { spaceId?: string };
  ThreadView: { postId: string; spaceId: string };
  PostDetail: { postId: string };
  ContentCompose: { spaceId?: string; replyTo?: string };
  ContentEdit: { postId: string };
  ContentPreview: { content: string; spaceId?: string };
};

// Combined Core navigation param list
export type CoreStackParamList = {
  // Identity routes
  Identity: NavigatorScreenParams<IdentityStackParamList>;
  IdentityOverview: undefined;
  IdentitySetup: { isFirstTime?: boolean };
  KeyManagement: undefined;
  KeyBackup: { keypairId: string };
  KeyRestore: undefined;
  IdentityVerification: { pubkey: string };

  // Spaces routes
  Spaces: NavigatorScreenParams<SpacesStackParamList>;
  SpacesList: undefined;
  SpaceView: { spaceId: string };
  SpaceCreate: undefined;
  SpaceSettings: { spaceId: string };
  SpaceMembers: { spaceId: string };
  SpaceModeration: { spaceId: string };

  // Content routes
  Content: NavigatorScreenParams<ContentStackParamList>;
  ContentFeed: { spaceId?: string };
  ThreadView: { postId: string; spaceId: string };
  PostDetail: { postId: string };
  ContentCompose: { spaceId?: string; replyTo?: string };
  ContentEdit: { postId: string };
  ContentPreview: { content: string; spaceId?: string };
};

// ============================================================================
// SCREEN PROPS TYPES
// ============================================================================

export type CoreStackScreenProps<T extends keyof CoreStackParamList> =
  NativeStackScreenProps<CoreStackParamList, T>;

export type IdentityStackScreenProps<T extends keyof IdentityStackParamList> =
  NativeStackScreenProps<IdentityStackParamList, T>;

export type SpacesStackScreenProps<T extends keyof SpacesStackParamList> =
  NativeStackScreenProps<SpacesStackParamList, T>;

export type ContentStackScreenProps<T extends keyof ContentStackParamList> =
  NativeStackScreenProps<ContentStackParamList, T>;

// ============================================================================
// ROUTE DEFINITIONS
// ============================================================================

/**
 * Route configuration for Core features
 */
export const CORE_ROUTES = {
  // Identity routes
  IDENTITY: {
    OVERVIEW: 'IdentityOverview',
    SETUP: 'IdentitySetup',
    KEY_MANAGEMENT: 'KeyManagement',
    KEY_BACKUP: 'KeyBackup',
    KEY_RESTORE: 'KeyRestore',
    VERIFICATION: 'IdentityVerification',
  },

  // Spaces routes
  SPACES: {
    LIST: 'SpacesList',
    VIEW: 'SpaceView',
    CREATE: 'SpaceCreate',
    SETTINGS: 'SpaceSettings',
    MEMBERS: 'SpaceMembers',
    MODERATION: 'SpaceModeration',
  },

  // Content routes
  CONTENT: {
    FEED: 'ContentFeed',
    THREAD: 'ThreadView',
    POST_DETAIL: 'PostDetail',
    COMPOSE: 'ContentCompose',
    EDIT: 'ContentEdit',
    PREVIEW: 'ContentPreview',
  },
} as const;

// ============================================================================
// NAVIGATION SELECTORS
// ============================================================================

/**
 * Selectors for extracting route params and state
 */
export const CoreNavigationSelectors = {
  // Identity selectors
  getIdentitySetupParams: (route: CoreStackScreenProps<'IdentitySetup'>['route']) => ({
    isFirstTime: route.params?.isFirstTime ?? false,
  }),

  getKeyBackupParams: (route: CoreStackScreenProps<'KeyBackup'>['route']) => ({
    keypairId: route.params.keypairId,
  }),

  getVerificationParams: (route: CoreStackScreenProps<'IdentityVerification'>['route']) => ({
    pubkey: route.params.pubkey,
  }),

  // Spaces selectors
  getSpaceViewParams: (route: CoreStackScreenProps<'SpaceView'>['route']) => ({
    spaceId: route.params.spaceId,
  }),

  getSpaceSettingsParams: (route: CoreStackScreenProps<'SpaceSettings'>['route']) => ({
    spaceId: route.params.spaceId,
  }),

  getSpaceMembersParams: (route: CoreStackScreenProps<'SpaceMembers'>['route']) => ({
    spaceId: route.params.spaceId,
  }),

  getSpaceModerationParams: (route: CoreStackScreenProps<'SpaceModeration'>['route']) => ({
    spaceId: route.params.spaceId,
  }),

  // Content selectors
  getContentFeedParams: (route: CoreStackScreenProps<'ContentFeed'>['route']) => ({
    spaceId: route.params?.spaceId,
  }),

  getThreadViewParams: (route: CoreStackScreenProps<'ThreadView'>['route']) => ({
    postId: route.params.postId,
    spaceId: route.params.spaceId,
  }),

  getPostDetailParams: (route: CoreStackScreenProps<'PostDetail'>['route']) => ({
    postId: route.params.postId,
  }),

  getContentComposeParams: (route: CoreStackScreenProps<'ContentCompose'>['route']) => ({
    spaceId: route.params?.spaceId,
    replyTo: route.params?.replyTo,
  }),

  getContentEditParams: (route: CoreStackScreenProps<'ContentEdit'>['route']) => ({
    postId: route.params.postId,
  }),

  getContentPreviewParams: (route: CoreStackScreenProps<'ContentPreview'>['route']) => ({
    content: route.params.content,
    spaceId: route.params?.spaceId,
  }),
};

// ============================================================================
// SETUP DEFINITIONS
// ============================================================================

/**
 * Navigator screen options configuration
 */
export const CoreNavigatorSetup = {
  // Default screen options for Core navigator
  defaultScreenOptions: {
    headerShown: true,
    headerStyle: { backgroundColor: COLORS.background },
    headerTitleStyle: { color: COLORS.text },
    headerTintColor: COLORS.primary,
    contentStyle: { backgroundColor: COLORS.background },
  },

  // Identity group screen options
  identityScreenOptions: {
    headerShown: true,
    headerStyle: { backgroundColor: COLORS.background },
    headerTitleStyle: { color: COLORS.text },
    headerTintColor: COLORS.primary,
    gestureEnabled: false, // Disable swipe back for security screens
  },

  // Spaces group screen options
  spacesScreenOptions: {
    headerShown: true,
    headerStyle: { backgroundColor: COLORS.background },
    headerTitleStyle: { color: COLORS.text },
    headerTintColor: COLORS.primary,
  },

  // Content group screen options
  contentScreenOptions: {
    headerShown: true,
    headerStyle: { backgroundColor: COLORS.background },
    headerTitleStyle: { color: COLORS.text },
    headerTintColor: COLORS.primary,
  },

  // Modal presentation options (for compose/preview screens)
  modalScreenOptions: {
    presentation: 'modal' as const,
    headerShown: true,
    headerStyle: { backgroundColor: COLORS.background },
    headerTitleStyle: { color: COLORS.text },
    headerTintColor: COLORS.primary,
  },

  // Screen titles configuration
  screenTitles: {
    // Identity
    IdentityOverview: 'Identity',
    IdentitySetup: 'Setup Identity',
    KeyManagement: 'Key Management',
    KeyBackup: 'Backup Key',
    KeyRestore: 'Restore Key',
    IdentityVerification: 'Verify Identity',
    // Spaces
    SpacesList: 'Spaces',
    SpaceView: 'Space',
    SpaceCreate: 'Create Space',
    SpaceSettings: 'Space Settings',
    SpaceMembers: 'Members',
    SpaceModeration: 'Moderation',
    // Content
    ContentFeed: 'Feed',
    ThreadView: 'Thread',
    PostDetail: 'Post',
    ContentCompose: 'Compose',
    ContentEdit: 'Edit Post',
    ContentPreview: 'Preview',
  } as Record<keyof CoreStackParamList, string>,
};

// ============================================================================
// NAVIGATION HELPERS
// ============================================================================

/**
 * Helper functions for Core navigation
 */
export const CoreNavigationHelpers = {
  // Navigate to identity setup (used for first-time users)
  navigateToIdentitySetup: (
    navigation: CoreStackScreenProps<keyof CoreStackParamList>['navigation'],
    isFirstTime = false
  ) => {
    navigation.navigate('IdentitySetup', { isFirstTime });
  },

  // Navigate to space view
  navigateToSpace: (
    navigation: CoreStackScreenProps<keyof CoreStackParamList>['navigation'],
    spaceId: string
  ) => {
    navigation.navigate('SpaceView', { spaceId });
  },

  // Navigate to thread view
  navigateToThread: (
    navigation: CoreStackScreenProps<keyof CoreStackParamList>['navigation'],
    postId: string,
    spaceId: string
  ) => {
    navigation.navigate('ThreadView', { postId, spaceId });
  },

  // Navigate to compose (reply or new post)
  navigateToCompose: (
    navigation: CoreStackScreenProps<keyof CoreStackParamList>['navigation'],
    options?: { spaceId?: string; replyTo?: string }
  ) => {
    navigation.navigate('ContentCompose', options ?? {});
  },

  // Navigate to key backup
  navigateToKeyBackup: (
    navigation: CoreStackScreenProps<keyof CoreStackParamList>['navigation'],
    keypairId: string
  ) => {
    navigation.navigate('KeyBackup', { keypairId });
  },

  // Navigate to identity verification
  navigateToVerification: (
    navigation: CoreStackScreenProps<keyof CoreStackParamList>['navigation'],
    pubkey: string
  ) => {
    navigation.navigate('IdentityVerification', { pubkey });
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

const Stack = createNativeStackNavigator<CoreStackParamList>();

/**
 * Core Navigator Component
 * Groups Identity, Spaces, and Content navigation
 */
export function CoreNavigator() {
  return (
    <Stack.Navigator
      screenOptions={CoreNavigatorSetup.defaultScreenOptions}
    >
      {/* Identity Group */}
      <Stack.Group screenOptions={CoreNavigatorSetup.identityScreenOptions}>
        <Stack.Screen
          name="IdentityOverview"
          component={PlaceholderScreen}
          options={{ title: CoreNavigatorSetup.screenTitles.IdentityOverview }}
        />
        <Stack.Screen
          name="IdentitySetup"
          component={PlaceholderScreen}
          options={{ title: CoreNavigatorSetup.screenTitles.IdentitySetup }}
        />
        <Stack.Screen
          name="KeyManagement"
          component={PlaceholderScreen}
          options={{ title: CoreNavigatorSetup.screenTitles.KeyManagement }}
        />
        <Stack.Screen
          name="KeyBackup"
          component={PlaceholderScreen}
          options={{ title: CoreNavigatorSetup.screenTitles.KeyBackup }}
        />
        <Stack.Screen
          name="KeyRestore"
          component={PlaceholderScreen}
          options={{ title: CoreNavigatorSetup.screenTitles.KeyRestore }}
        />
        <Stack.Screen
          name="IdentityVerification"
          component={PlaceholderScreen}
          options={{ title: CoreNavigatorSetup.screenTitles.IdentityVerification }}
        />
      </Stack.Group>

      {/* Spaces Group */}
      <Stack.Group screenOptions={CoreNavigatorSetup.spacesScreenOptions}>
        <Stack.Screen
          name="SpacesList"
          component={PlaceholderScreen}
          options={{ title: CoreNavigatorSetup.screenTitles.SpacesList }}
        />
        <Stack.Screen
          name="SpaceView"
          component={PlaceholderScreen}
          options={({ route }) => ({
            title: `s/${route.params.spaceId}`,
          })}
        />
        <Stack.Screen
          name="SpaceCreate"
          component={PlaceholderScreen}
          options={{ title: CoreNavigatorSetup.screenTitles.SpaceCreate }}
        />
        <Stack.Screen
          name="SpaceSettings"
          component={PlaceholderScreen}
          options={{ title: CoreNavigatorSetup.screenTitles.SpaceSettings }}
        />
        <Stack.Screen
          name="SpaceMembers"
          component={PlaceholderScreen}
          options={{ title: CoreNavigatorSetup.screenTitles.SpaceMembers }}
        />
        <Stack.Screen
          name="SpaceModeration"
          component={PlaceholderScreen}
          options={{ title: CoreNavigatorSetup.screenTitles.SpaceModeration }}
        />
      </Stack.Group>

      {/* Content Group */}
      <Stack.Group screenOptions={CoreNavigatorSetup.contentScreenOptions}>
        <Stack.Screen
          name="ContentFeed"
          component={PlaceholderScreen}
          options={{ title: CoreNavigatorSetup.screenTitles.ContentFeed }}
        />
        <Stack.Screen
          name="ThreadView"
          component={PlaceholderScreen}
          options={{ title: CoreNavigatorSetup.screenTitles.ThreadView }}
        />
        <Stack.Screen
          name="PostDetail"
          component={PlaceholderScreen}
          options={{ title: CoreNavigatorSetup.screenTitles.PostDetail }}
        />
      </Stack.Group>

      {/* Content Modals */}
      <Stack.Group screenOptions={CoreNavigatorSetup.modalScreenOptions}>
        <Stack.Screen
          name="ContentCompose"
          component={PlaceholderScreen}
          options={({ route }) => ({
            title: route.params?.replyTo ? 'Reply' : 'New Post',
          })}
        />
        <Stack.Screen
          name="ContentEdit"
          component={PlaceholderScreen}
          options={{ title: CoreNavigatorSetup.screenTitles.ContentEdit }}
        />
        <Stack.Screen
          name="ContentPreview"
          component={PlaceholderScreen}
          options={{ title: CoreNavigatorSetup.screenTitles.ContentPreview }}
        />
      </Stack.Group>
    </Stack.Navigator>
  );
}

export default CoreNavigator;
