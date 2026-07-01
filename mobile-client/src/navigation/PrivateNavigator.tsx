/**
 * PrivateNavigator - Navigation for Private Features Group
 * Handles: Private Spaces, Encryption, Invites navigation
 *
 * Routes:
 * - PrivateSpaces: Private space management, member lists, settings
 * - Encryption: Key management, encrypted content, E2E encryption settings
 * - Invites: Invite creation, pending invites, invite acceptance
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
 * Private feature navigation param lists
 */

// Private Spaces-related screens
export type PrivateSpacesStackParamList = {
  PrivateSpacesList: undefined;
  PrivateSpaceCreate: undefined;
  PrivateSpaceDetail: { spaceId: string };
  PrivateSpaceSettings: { spaceId: string };
  PrivateSpaceMembers: { spaceId: string };
  PrivateSpaceMemberDetail: { spaceId: string; memberId: string };
  PrivateSpaceRoles: { spaceId: string };
  PrivateSpacePermissions: { spaceId: string };
};

// Encryption-related screens
export type EncryptionStackParamList = {
  EncryptionOverview: undefined;
  KeyManagement: undefined;
  KeyDetail: { keyId: string };
  KeyGenerate: undefined;
  KeyBackup: undefined;
  KeyRestore: undefined;
  EncryptedContentList: undefined;
  EncryptedContentDetail: { contentId: string };
  E2ESettings: undefined;
};

// Invites-related screens
export type InvitesStackParamList = {
  InvitesList: undefined;
  InviteCreate: { spaceId: string };
  InviteDetail: { inviteId: string };
  InvitePending: undefined;
  InviteAccept: { inviteCode: string };
  InviteHistory: { spaceId?: string };
  InviteSettings: undefined;
};

// Combined Private navigation param list
export type PrivateStackParamList = {
  // Private Spaces routes
  PrivateSpacesList: undefined;
  PrivateSpaceCreate: undefined;
  PrivateSpaceDetail: { spaceId: string };
  PrivateSpaceSettings: { spaceId: string };
  PrivateSpaceMembers: { spaceId: string };
  PrivateSpaceMemberDetail: { spaceId: string; memberId: string };
  PrivateSpaceRoles: { spaceId: string };
  PrivateSpacePermissions: { spaceId: string };

  // Encryption routes
  EncryptionOverview: undefined;
  KeyManagement: undefined;
  KeyDetail: { keyId: string };
  KeyGenerate: undefined;
  KeyBackup: undefined;
  KeyRestore: undefined;
  EncryptedContentList: undefined;
  EncryptedContentDetail: { contentId: string };
  E2ESettings: undefined;

  // Invites routes
  InvitesList: undefined;
  InviteCreate: { spaceId: string };
  InviteDetail: { inviteId: string };
  InvitePending: undefined;
  InviteAccept: { inviteCode: string };
  InviteHistory: { spaceId?: string };
  InviteSettings: undefined;
};

// ============================================================================
// SCREEN PROPS TYPES
// ============================================================================

export type PrivateStackScreenProps<T extends keyof PrivateStackParamList> =
  NativeStackScreenProps<PrivateStackParamList, T>;

export type PrivateSpacesStackScreenProps<T extends keyof PrivateSpacesStackParamList> =
  NativeStackScreenProps<PrivateSpacesStackParamList, T>;

export type EncryptionStackScreenProps<T extends keyof EncryptionStackParamList> =
  NativeStackScreenProps<EncryptionStackParamList, T>;

export type InvitesStackScreenProps<T extends keyof InvitesStackParamList> =
  NativeStackScreenProps<InvitesStackParamList, T>;

// ============================================================================
// ROUTE DEFINITIONS
// ============================================================================

/**
 * Route configuration for Private features
 */
export const PRIVATE_ROUTES = {
  // Private Spaces routes
  PRIVATE_SPACES: {
    LIST: 'PrivateSpacesList',
    CREATE: 'PrivateSpaceCreate',
    DETAIL: 'PrivateSpaceDetail',
    SETTINGS: 'PrivateSpaceSettings',
    MEMBERS: 'PrivateSpaceMembers',
    MEMBER_DETAIL: 'PrivateSpaceMemberDetail',
    ROLES: 'PrivateSpaceRoles',
    PERMISSIONS: 'PrivateSpacePermissions',
  },

  // Encryption routes
  ENCRYPTION: {
    OVERVIEW: 'EncryptionOverview',
    KEY_MANAGEMENT: 'KeyManagement',
    KEY_DETAIL: 'KeyDetail',
    KEY_GENERATE: 'KeyGenerate',
    KEY_BACKUP: 'KeyBackup',
    KEY_RESTORE: 'KeyRestore',
    ENCRYPTED_CONTENT_LIST: 'EncryptedContentList',
    ENCRYPTED_CONTENT_DETAIL: 'EncryptedContentDetail',
    E2E_SETTINGS: 'E2ESettings',
  },

  // Invites routes
  INVITES: {
    LIST: 'InvitesList',
    CREATE: 'InviteCreate',
    DETAIL: 'InviteDetail',
    PENDING: 'InvitePending',
    ACCEPT: 'InviteAccept',
    HISTORY: 'InviteHistory',
    SETTINGS: 'InviteSettings',
  },
} as const;

// ============================================================================
// NAVIGATION SELECTORS
// ============================================================================

/**
 * Selectors for extracting route params and state
 */
export const PrivateNavigationSelectors = {
  // Private Spaces selectors
  getPrivateSpaceDetailParams: (route: PrivateStackScreenProps<'PrivateSpaceDetail'>['route']) => ({
    spaceId: route.params.spaceId,
  }),

  getPrivateSpaceSettingsParams: (route: PrivateStackScreenProps<'PrivateSpaceSettings'>['route']) => ({
    spaceId: route.params.spaceId,
  }),

  getPrivateSpaceMembersParams: (route: PrivateStackScreenProps<'PrivateSpaceMembers'>['route']) => ({
    spaceId: route.params.spaceId,
  }),

  getPrivateSpaceMemberDetailParams: (route: PrivateStackScreenProps<'PrivateSpaceMemberDetail'>['route']) => ({
    spaceId: route.params.spaceId,
    memberId: route.params.memberId,
  }),

  getPrivateSpaceRolesParams: (route: PrivateStackScreenProps<'PrivateSpaceRoles'>['route']) => ({
    spaceId: route.params.spaceId,
  }),

  getPrivateSpacePermissionsParams: (route: PrivateStackScreenProps<'PrivateSpacePermissions'>['route']) => ({
    spaceId: route.params.spaceId,
  }),

  // Encryption selectors
  getKeyDetailParams: (route: PrivateStackScreenProps<'KeyDetail'>['route']) => ({
    keyId: route.params.keyId,
  }),

  getEncryptedContentDetailParams: (route: PrivateStackScreenProps<'EncryptedContentDetail'>['route']) => ({
    contentId: route.params.contentId,
  }),

  // Invites selectors
  getInviteCreateParams: (route: PrivateStackScreenProps<'InviteCreate'>['route']) => ({
    spaceId: route.params.spaceId,
  }),

  getInviteDetailParams: (route: PrivateStackScreenProps<'InviteDetail'>['route']) => ({
    inviteId: route.params.inviteId,
  }),

  getInviteAcceptParams: (route: PrivateStackScreenProps<'InviteAccept'>['route']) => ({
    inviteCode: route.params.inviteCode,
  }),

  getInviteHistoryParams: (route: PrivateStackScreenProps<'InviteHistory'>['route']) => ({
    spaceId: route.params?.spaceId,
  }),
};

// ============================================================================
// SETUP DEFINITIONS
// ============================================================================

/**
 * Navigator screen options configuration
 */
export const PrivateNavigatorSetup = {
  // Default screen options for Private navigator
  defaultScreenOptions: {
    headerShown: true,
    headerStyle: { backgroundColor: COLORS.background },
    headerTitleStyle: { color: COLORS.text },
    headerTintColor: COLORS.primary,
    contentStyle: { backgroundColor: COLORS.background },
  },

  // Private Spaces group screen options
  privateSpacesScreenOptions: {
    headerShown: true,
    headerStyle: { backgroundColor: COLORS.background },
    headerTitleStyle: { color: COLORS.text },
    headerTintColor: COLORS.primary,
  },

  // Encryption group screen options
  encryptionScreenOptions: {
    headerShown: true,
    headerStyle: { backgroundColor: COLORS.background },
    headerTitleStyle: { color: COLORS.text },
    headerTintColor: COLORS.primary,
  },

  // Invites group screen options
  invitesScreenOptions: {
    headerShown: true,
    headerStyle: { backgroundColor: COLORS.background },
    headerTitleStyle: { color: COLORS.text },
    headerTintColor: COLORS.primary,
  },

  // Modal presentation options (for create, accept, settings modals)
  modalScreenOptions: {
    presentation: 'modal' as const,
    headerShown: true,
    headerStyle: { backgroundColor: COLORS.background },
    headerTitleStyle: { color: COLORS.text },
    headerTintColor: COLORS.primary,
  },

  // Screen titles configuration
  screenTitles: {
    // Private Spaces
    PrivateSpacesList: 'Private Spaces',
    PrivateSpaceCreate: 'Create Private Space',
    PrivateSpaceDetail: 'Private Space',
    PrivateSpaceSettings: 'Space Settings',
    PrivateSpaceMembers: 'Members',
    PrivateSpaceMemberDetail: 'Member Details',
    PrivateSpaceRoles: 'Roles',
    PrivateSpacePermissions: 'Permissions',
    // Encryption
    EncryptionOverview: 'Encryption',
    KeyManagement: 'Key Management',
    KeyDetail: 'Key Details',
    KeyGenerate: 'Generate Key',
    KeyBackup: 'Backup Keys',
    KeyRestore: 'Restore Keys',
    EncryptedContentList: 'Encrypted Content',
    EncryptedContentDetail: 'Encrypted Content',
    E2ESettings: 'E2E Settings',
    // Invites
    InvitesList: 'Invites',
    InviteCreate: 'Create Invite',
    InviteDetail: 'Invite Details',
    InvitePending: 'Pending Invites',
    InviteAccept: 'Accept Invite',
    InviteHistory: 'Invite History',
    InviteSettings: 'Invite Settings',
  } as Record<keyof PrivateStackParamList, string>,
};

// ============================================================================
// NAVIGATION HELPERS
// ============================================================================

/**
 * Helper functions for Private navigation
 */
export const PrivateNavigationHelpers = {
  // Navigate to private spaces list
  navigateToPrivateSpacesList: (
    navigation: PrivateStackScreenProps<keyof PrivateStackParamList>['navigation']
  ) => {
    navigation.navigate('PrivateSpacesList');
  },

  // Navigate to create private space
  navigateToPrivateSpaceCreate: (
    navigation: PrivateStackScreenProps<keyof PrivateStackParamList>['navigation']
  ) => {
    navigation.navigate('PrivateSpaceCreate');
  },

  // Navigate to private space detail
  navigateToPrivateSpaceDetail: (
    navigation: PrivateStackScreenProps<keyof PrivateStackParamList>['navigation'],
    spaceId: string
  ) => {
    navigation.navigate('PrivateSpaceDetail', { spaceId });
  },

  // Navigate to private space settings
  navigateToPrivateSpaceSettings: (
    navigation: PrivateStackScreenProps<keyof PrivateStackParamList>['navigation'],
    spaceId: string
  ) => {
    navigation.navigate('PrivateSpaceSettings', { spaceId });
  },

  // Navigate to private space members
  navigateToPrivateSpaceMembers: (
    navigation: PrivateStackScreenProps<keyof PrivateStackParamList>['navigation'],
    spaceId: string
  ) => {
    navigation.navigate('PrivateSpaceMembers', { spaceId });
  },

  // Navigate to private space member detail
  navigateToPrivateSpaceMemberDetail: (
    navigation: PrivateStackScreenProps<keyof PrivateStackParamList>['navigation'],
    spaceId: string,
    memberId: string
  ) => {
    navigation.navigate('PrivateSpaceMemberDetail', { spaceId, memberId });
  },

  // Navigate to private space roles
  navigateToPrivateSpaceRoles: (
    navigation: PrivateStackScreenProps<keyof PrivateStackParamList>['navigation'],
    spaceId: string
  ) => {
    navigation.navigate('PrivateSpaceRoles', { spaceId });
  },

  // Navigate to private space permissions
  navigateToPrivateSpacePermissions: (
    navigation: PrivateStackScreenProps<keyof PrivateStackParamList>['navigation'],
    spaceId: string
  ) => {
    navigation.navigate('PrivateSpacePermissions', { spaceId });
  },

  // Navigate to encryption overview
  navigateToEncryptionOverview: (
    navigation: PrivateStackScreenProps<keyof PrivateStackParamList>['navigation']
  ) => {
    navigation.navigate('EncryptionOverview');
  },

  // Navigate to key management
  navigateToKeyManagement: (
    navigation: PrivateStackScreenProps<keyof PrivateStackParamList>['navigation']
  ) => {
    navigation.navigate('KeyManagement');
  },

  // Navigate to key detail
  navigateToKeyDetail: (
    navigation: PrivateStackScreenProps<keyof PrivateStackParamList>['navigation'],
    keyId: string
  ) => {
    navigation.navigate('KeyDetail', { keyId });
  },

  // Navigate to key generate
  navigateToKeyGenerate: (
    navigation: PrivateStackScreenProps<keyof PrivateStackParamList>['navigation']
  ) => {
    navigation.navigate('KeyGenerate');
  },

  // Navigate to key backup
  navigateToKeyBackup: (
    navigation: PrivateStackScreenProps<keyof PrivateStackParamList>['navigation']
  ) => {
    navigation.navigate('KeyBackup');
  },

  // Navigate to key restore
  navigateToKeyRestore: (
    navigation: PrivateStackScreenProps<keyof PrivateStackParamList>['navigation']
  ) => {
    navigation.navigate('KeyRestore');
  },

  // Navigate to encrypted content list
  navigateToEncryptedContentList: (
    navigation: PrivateStackScreenProps<keyof PrivateStackParamList>['navigation']
  ) => {
    navigation.navigate('EncryptedContentList');
  },

  // Navigate to encrypted content detail
  navigateToEncryptedContentDetail: (
    navigation: PrivateStackScreenProps<keyof PrivateStackParamList>['navigation'],
    contentId: string
  ) => {
    navigation.navigate('EncryptedContentDetail', { contentId });
  },

  // Navigate to E2E settings
  navigateToE2ESettings: (
    navigation: PrivateStackScreenProps<keyof PrivateStackParamList>['navigation']
  ) => {
    navigation.navigate('E2ESettings');
  },

  // Navigate to invites list
  navigateToInvitesList: (
    navigation: PrivateStackScreenProps<keyof PrivateStackParamList>['navigation']
  ) => {
    navigation.navigate('InvitesList');
  },

  // Navigate to create invite
  navigateToInviteCreate: (
    navigation: PrivateStackScreenProps<keyof PrivateStackParamList>['navigation'],
    spaceId: string
  ) => {
    navigation.navigate('InviteCreate', { spaceId });
  },

  // Navigate to invite detail
  navigateToInviteDetail: (
    navigation: PrivateStackScreenProps<keyof PrivateStackParamList>['navigation'],
    inviteId: string
  ) => {
    navigation.navigate('InviteDetail', { inviteId });
  },

  // Navigate to pending invites
  navigateToInvitePending: (
    navigation: PrivateStackScreenProps<keyof PrivateStackParamList>['navigation']
  ) => {
    navigation.navigate('InvitePending');
  },

  // Navigate to accept invite
  navigateToInviteAccept: (
    navigation: PrivateStackScreenProps<keyof PrivateStackParamList>['navigation'],
    inviteCode: string
  ) => {
    navigation.navigate('InviteAccept', { inviteCode });
  },

  // Navigate to invite history
  navigateToInviteHistory: (
    navigation: PrivateStackScreenProps<keyof PrivateStackParamList>['navigation'],
    spaceId?: string
  ) => {
    navigation.navigate('InviteHistory', { spaceId });
  },

  // Navigate to invite settings
  navigateToInviteSettings: (
    navigation: PrivateStackScreenProps<keyof PrivateStackParamList>['navigation']
  ) => {
    navigation.navigate('InviteSettings');
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

const Stack = createNativeStackNavigator<PrivateStackParamList>();

/**
 * Private Navigator Component
 * Groups Private Spaces, Encryption, and Invites navigation
 */
export function PrivateNavigator() {
  return (
    <Stack.Navigator
      screenOptions={PrivateNavigatorSetup.defaultScreenOptions}
      initialRouteName="PrivateSpacesList"
    >
      {/* Private Spaces Group */}
      <Stack.Group screenOptions={PrivateNavigatorSetup.privateSpacesScreenOptions}>
        <Stack.Screen
          name="PrivateSpacesList"
          component={PlaceholderScreen}
          options={{ title: PrivateNavigatorSetup.screenTitles.PrivateSpacesList }}
        />
        <Stack.Screen
          name="PrivateSpaceDetail"
          component={PlaceholderScreen}
          options={({ route }) => ({
            title: `Space: ${route.params.spaceId.slice(0, 8)}...`,
          })}
        />
        <Stack.Screen
          name="PrivateSpaceSettings"
          component={PlaceholderScreen}
          options={{ title: PrivateNavigatorSetup.screenTitles.PrivateSpaceSettings }}
        />
        <Stack.Screen
          name="PrivateSpaceMembers"
          component={PlaceholderScreen}
          options={{ title: PrivateNavigatorSetup.screenTitles.PrivateSpaceMembers }}
        />
        <Stack.Screen
          name="PrivateSpaceMemberDetail"
          component={PlaceholderScreen}
          options={{ title: PrivateNavigatorSetup.screenTitles.PrivateSpaceMemberDetail }}
        />
        <Stack.Screen
          name="PrivateSpaceRoles"
          component={PlaceholderScreen}
          options={{ title: PrivateNavigatorSetup.screenTitles.PrivateSpaceRoles }}
        />
        <Stack.Screen
          name="PrivateSpacePermissions"
          component={PlaceholderScreen}
          options={{ title: PrivateNavigatorSetup.screenTitles.PrivateSpacePermissions }}
        />
      </Stack.Group>

      {/* Encryption Group */}
      <Stack.Group screenOptions={PrivateNavigatorSetup.encryptionScreenOptions}>
        <Stack.Screen
          name="EncryptionOverview"
          component={PlaceholderScreen}
          options={{ title: PrivateNavigatorSetup.screenTitles.EncryptionOverview }}
        />
        <Stack.Screen
          name="KeyManagement"
          component={PlaceholderScreen}
          options={{ title: PrivateNavigatorSetup.screenTitles.KeyManagement }}
        />
        <Stack.Screen
          name="KeyDetail"
          component={PlaceholderScreen}
          options={({ route }) => ({
            title: `Key: ${route.params.keyId.slice(0, 8)}...`,
          })}
        />
        <Stack.Screen
          name="EncryptedContentList"
          component={PlaceholderScreen}
          options={{ title: PrivateNavigatorSetup.screenTitles.EncryptedContentList }}
        />
        <Stack.Screen
          name="EncryptedContentDetail"
          component={PlaceholderScreen}
          options={({ route }) => ({
            title: `Content: ${route.params.contentId.slice(0, 8)}...`,
          })}
        />
      </Stack.Group>

      {/* Invites Group */}
      <Stack.Group screenOptions={PrivateNavigatorSetup.invitesScreenOptions}>
        <Stack.Screen
          name="InvitesList"
          component={PlaceholderScreen}
          options={{ title: PrivateNavigatorSetup.screenTitles.InvitesList }}
        />
        <Stack.Screen
          name="InviteDetail"
          component={PlaceholderScreen}
          options={({ route }) => ({
            title: `Invite: ${route.params.inviteId.slice(0, 8)}...`,
          })}
        />
        <Stack.Screen
          name="InvitePending"
          component={PlaceholderScreen}
          options={{ title: PrivateNavigatorSetup.screenTitles.InvitePending }}
        />
        <Stack.Screen
          name="InviteHistory"
          component={PlaceholderScreen}
          options={{ title: PrivateNavigatorSetup.screenTitles.InviteHistory }}
        />
      </Stack.Group>

      {/* Modal Screens */}
      <Stack.Group screenOptions={PrivateNavigatorSetup.modalScreenOptions}>
        <Stack.Screen
          name="PrivateSpaceCreate"
          component={PlaceholderScreen}
          options={{ title: PrivateNavigatorSetup.screenTitles.PrivateSpaceCreate }}
        />
        <Stack.Screen
          name="KeyGenerate"
          component={PlaceholderScreen}
          options={{ title: PrivateNavigatorSetup.screenTitles.KeyGenerate }}
        />
        <Stack.Screen
          name="KeyBackup"
          component={PlaceholderScreen}
          options={{ title: PrivateNavigatorSetup.screenTitles.KeyBackup }}
        />
        <Stack.Screen
          name="KeyRestore"
          component={PlaceholderScreen}
          options={{ title: PrivateNavigatorSetup.screenTitles.KeyRestore }}
        />
        <Stack.Screen
          name="E2ESettings"
          component={PlaceholderScreen}
          options={{ title: PrivateNavigatorSetup.screenTitles.E2ESettings }}
        />
        <Stack.Screen
          name="InviteCreate"
          component={PlaceholderScreen}
          options={{ title: PrivateNavigatorSetup.screenTitles.InviteCreate }}
        />
        <Stack.Screen
          name="InviteAccept"
          component={PlaceholderScreen}
          options={{ title: PrivateNavigatorSetup.screenTitles.InviteAccept }}
        />
        <Stack.Screen
          name="InviteSettings"
          component={PlaceholderScreen}
          options={{ title: PrivateNavigatorSetup.screenTitles.InviteSettings }}
        />
      </Stack.Group>
    </Stack.Navigator>
  );
}

export default PrivateNavigator;
