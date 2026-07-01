/**
 * BridgeNavigator - Navigation for Bridge Features Group
 * Handles: Cross-chain and External integration navigation
 *
 * Routes:
 * - CrossChain: Bridge transfers, token mapping, chain status
 * - External: External integrations, API connections, webhooks
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
 * Bridge feature navigation param lists
 */

// CrossChain-related screens
export type CrossChainStackParamList = {
  CrossChainOverview: undefined;
  BridgeTransfer: { sourceChain?: string; targetChain?: string };
  TransferHistory: undefined;
  TransferDetail: { transferId: string };
  TokenMapping: undefined;
  TokenMappingDetail: { tokenId: string };
  ChainStatus: undefined;
  ChainDetail: { chainId: string };
  BridgeSettings: undefined;
};

// External-related screens
export type ExternalStackParamList = {
  ExternalOverview: undefined;
  ApiConnections: undefined;
  ApiConnectionDetail: { connectionId: string };
  ApiConnectionCreate: undefined;
  Webhooks: undefined;
  WebhookDetail: { webhookId: string };
  WebhookCreate: undefined;
  ExternalServices: undefined;
  ServiceDetail: { serviceId: string };
  ExternalSettings: undefined;
};

// Combined Bridge navigation param list
export type BridgeStackParamList = {
  // CrossChain routes
  CrossChain: NavigatorScreenParams<CrossChainStackParamList>;
  CrossChainOverview: undefined;
  BridgeTransfer: { sourceChain?: string; targetChain?: string };
  TransferHistory: undefined;
  TransferDetail: { transferId: string };
  TokenMapping: undefined;
  TokenMappingDetail: { tokenId: string };
  ChainStatus: undefined;
  ChainDetail: { chainId: string };
  BridgeSettings: undefined;

  // External routes
  External: NavigatorScreenParams<ExternalStackParamList>;
  ExternalOverview: undefined;
  ApiConnections: undefined;
  ApiConnectionDetail: { connectionId: string };
  ApiConnectionCreate: undefined;
  Webhooks: undefined;
  WebhookDetail: { webhookId: string };
  WebhookCreate: undefined;
  ExternalServices: undefined;
  ServiceDetail: { serviceId: string };
  ExternalSettings: undefined;
};

// ============================================================================
// SCREEN PROPS TYPES
// ============================================================================

export type BridgeStackScreenProps<T extends keyof BridgeStackParamList> =
  NativeStackScreenProps<BridgeStackParamList, T>;

export type CrossChainStackScreenProps<T extends keyof CrossChainStackParamList> =
  NativeStackScreenProps<CrossChainStackParamList, T>;

export type ExternalStackScreenProps<T extends keyof ExternalStackParamList> =
  NativeStackScreenProps<ExternalStackParamList, T>;

// ============================================================================
// ROUTE DEFINITIONS
// ============================================================================

/**
 * Route configuration for Bridge features
 */
export const BRIDGE_ROUTES = {
  // CrossChain routes
  CROSS_CHAIN: {
    OVERVIEW: 'CrossChainOverview',
    TRANSFER: 'BridgeTransfer',
    TRANSFER_HISTORY: 'TransferHistory',
    TRANSFER_DETAIL: 'TransferDetail',
    TOKEN_MAPPING: 'TokenMapping',
    TOKEN_MAPPING_DETAIL: 'TokenMappingDetail',
    CHAIN_STATUS: 'ChainStatus',
    CHAIN_DETAIL: 'ChainDetail',
    SETTINGS: 'BridgeSettings',
  },

  // External routes
  EXTERNAL: {
    OVERVIEW: 'ExternalOverview',
    API_CONNECTIONS: 'ApiConnections',
    API_CONNECTION_DETAIL: 'ApiConnectionDetail',
    API_CONNECTION_CREATE: 'ApiConnectionCreate',
    WEBHOOKS: 'Webhooks',
    WEBHOOK_DETAIL: 'WebhookDetail',
    WEBHOOK_CREATE: 'WebhookCreate',
    SERVICES: 'ExternalServices',
    SERVICE_DETAIL: 'ServiceDetail',
    SETTINGS: 'ExternalSettings',
  },
} as const;

// ============================================================================
// NAVIGATION SELECTORS
// ============================================================================

/**
 * Selectors for extracting route params and state
 */
export const BridgeNavigationSelectors = {
  // CrossChain selectors
  getBridgeTransferParams: (route: BridgeStackScreenProps<'BridgeTransfer'>['route']) => ({
    sourceChain: route.params?.sourceChain,
    targetChain: route.params?.targetChain,
  }),

  getTransferDetailParams: (route: BridgeStackScreenProps<'TransferDetail'>['route']) => ({
    transferId: route.params.transferId,
  }),

  getTokenMappingDetailParams: (route: BridgeStackScreenProps<'TokenMappingDetail'>['route']) => ({
    tokenId: route.params.tokenId,
  }),

  getChainDetailParams: (route: BridgeStackScreenProps<'ChainDetail'>['route']) => ({
    chainId: route.params.chainId,
  }),

  // External selectors
  getApiConnectionDetailParams: (route: BridgeStackScreenProps<'ApiConnectionDetail'>['route']) => ({
    connectionId: route.params.connectionId,
  }),

  getWebhookDetailParams: (route: BridgeStackScreenProps<'WebhookDetail'>['route']) => ({
    webhookId: route.params.webhookId,
  }),

  getServiceDetailParams: (route: BridgeStackScreenProps<'ServiceDetail'>['route']) => ({
    serviceId: route.params.serviceId,
  }),
};

// ============================================================================
// SETUP DEFINITIONS
// ============================================================================

/**
 * Navigator screen options configuration
 */
export const BridgeNavigatorSetup = {
  // Default screen options for Bridge navigator
  defaultScreenOptions: {
    headerShown: true,
    headerStyle: { backgroundColor: COLORS.background },
    headerTitleStyle: { color: COLORS.text },
    headerTintColor: COLORS.primary,
    contentStyle: { backgroundColor: COLORS.background },
  },

  // CrossChain group screen options
  crossChainScreenOptions: {
    headerShown: true,
    headerStyle: { backgroundColor: COLORS.background },
    headerTitleStyle: { color: COLORS.text },
    headerTintColor: COLORS.primary,
  },

  // External group screen options
  externalScreenOptions: {
    headerShown: true,
    headerStyle: { backgroundColor: COLORS.background },
    headerTitleStyle: { color: COLORS.text },
    headerTintColor: COLORS.primary,
  },

  // Modal presentation options (for transfers and creation)
  modalScreenOptions: {
    presentation: 'modal' as const,
    headerShown: true,
    headerStyle: { backgroundColor: COLORS.background },
    headerTitleStyle: { color: COLORS.text },
    headerTintColor: COLORS.primary,
  },

  // Screen titles configuration
  screenTitles: {
    // CrossChain
    CrossChainOverview: 'Cross-Chain Bridge',
    BridgeTransfer: 'Bridge Transfer',
    TransferHistory: 'Transfer History',
    TransferDetail: 'Transfer Details',
    TokenMapping: 'Token Mapping',
    TokenMappingDetail: 'Token Details',
    ChainStatus: 'Chain Status',
    ChainDetail: 'Chain Details',
    BridgeSettings: 'Bridge Settings',
    // External
    ExternalOverview: 'External Integrations',
    ApiConnections: 'API Connections',
    ApiConnectionDetail: 'Connection Details',
    ApiConnectionCreate: 'Create Connection',
    Webhooks: 'Webhooks',
    WebhookDetail: 'Webhook Details',
    WebhookCreate: 'Create Webhook',
    ExternalServices: 'External Services',
    ServiceDetail: 'Service Details',
    ExternalSettings: 'External Settings',
  } as Record<keyof BridgeStackParamList, string>,
};

// ============================================================================
// NAVIGATION HELPERS
// ============================================================================

/**
 * Helper functions for Bridge navigation
 */
export const BridgeNavigationHelpers = {
  // Navigate to bridge transfer
  navigateToBridgeTransfer: (
    navigation: BridgeStackScreenProps<keyof BridgeStackParamList>['navigation'],
    sourceChain?: string,
    targetChain?: string
  ) => {
    navigation.navigate('BridgeTransfer', { sourceChain, targetChain });
  },

  // Navigate to transfer detail
  navigateToTransferDetail: (
    navigation: BridgeStackScreenProps<keyof BridgeStackParamList>['navigation'],
    transferId: string
  ) => {
    navigation.navigate('TransferDetail', { transferId });
  },

  // Navigate to token mapping detail
  navigateToTokenMappingDetail: (
    navigation: BridgeStackScreenProps<keyof BridgeStackParamList>['navigation'],
    tokenId: string
  ) => {
    navigation.navigate('TokenMappingDetail', { tokenId });
  },

  // Navigate to chain detail
  navigateToChainDetail: (
    navigation: BridgeStackScreenProps<keyof BridgeStackParamList>['navigation'],
    chainId: string
  ) => {
    navigation.navigate('ChainDetail', { chainId });
  },

  // Navigate to API connection detail
  navigateToApiConnectionDetail: (
    navigation: BridgeStackScreenProps<keyof BridgeStackParamList>['navigation'],
    connectionId: string
  ) => {
    navigation.navigate('ApiConnectionDetail', { connectionId });
  },

  // Navigate to create API connection modal
  navigateToApiConnectionCreate: (
    navigation: BridgeStackScreenProps<keyof BridgeStackParamList>['navigation']
  ) => {
    navigation.navigate('ApiConnectionCreate');
  },

  // Navigate to webhook detail
  navigateToWebhookDetail: (
    navigation: BridgeStackScreenProps<keyof BridgeStackParamList>['navigation'],
    webhookId: string
  ) => {
    navigation.navigate('WebhookDetail', { webhookId });
  },

  // Navigate to create webhook modal
  navigateToWebhookCreate: (
    navigation: BridgeStackScreenProps<keyof BridgeStackParamList>['navigation']
  ) => {
    navigation.navigate('WebhookCreate');
  },

  // Navigate to service detail
  navigateToServiceDetail: (
    navigation: BridgeStackScreenProps<keyof BridgeStackParamList>['navigation'],
    serviceId: string
  ) => {
    navigation.navigate('ServiceDetail', { serviceId });
  },

  // Navigate to cross-chain overview
  navigateToCrossChainOverview: (
    navigation: BridgeStackScreenProps<keyof BridgeStackParamList>['navigation']
  ) => {
    navigation.navigate('CrossChainOverview');
  },

  // Navigate to external overview
  navigateToExternalOverview: (
    navigation: BridgeStackScreenProps<keyof BridgeStackParamList>['navigation']
  ) => {
    navigation.navigate('ExternalOverview');
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

const Stack = createNativeStackNavigator<BridgeStackParamList>();

/**
 * Bridge Navigator Component
 * Groups CrossChain and External navigation
 */
export function BridgeNavigator() {
  return (
    <Stack.Navigator
      screenOptions={BridgeNavigatorSetup.defaultScreenOptions}
    >
      {/* CrossChain Group */}
      <Stack.Group screenOptions={BridgeNavigatorSetup.crossChainScreenOptions}>
        <Stack.Screen
          name="CrossChainOverview"
          component={PlaceholderScreen}
          options={{ title: BridgeNavigatorSetup.screenTitles.CrossChainOverview }}
        />
        <Stack.Screen
          name="TransferHistory"
          component={PlaceholderScreen}
          options={{ title: BridgeNavigatorSetup.screenTitles.TransferHistory }}
        />
        <Stack.Screen
          name="TransferDetail"
          component={PlaceholderScreen}
          options={({ route }) => ({
            title: `Transfer: ${route.params.transferId.slice(0, 8)}...`,
          })}
        />
        <Stack.Screen
          name="TokenMapping"
          component={PlaceholderScreen}
          options={{ title: BridgeNavigatorSetup.screenTitles.TokenMapping }}
        />
        <Stack.Screen
          name="TokenMappingDetail"
          component={PlaceholderScreen}
          options={({ route }) => ({
            title: `Token: ${route.params.tokenId.slice(0, 8)}...`,
          })}
        />
        <Stack.Screen
          name="ChainStatus"
          component={PlaceholderScreen}
          options={{ title: BridgeNavigatorSetup.screenTitles.ChainStatus }}
        />
        <Stack.Screen
          name="ChainDetail"
          component={PlaceholderScreen}
          options={({ route }) => ({
            title: `Chain: ${route.params.chainId}`,
          })}
        />
        <Stack.Screen
          name="BridgeSettings"
          component={PlaceholderScreen}
          options={{ title: BridgeNavigatorSetup.screenTitles.BridgeSettings }}
        />
      </Stack.Group>

      {/* CrossChain Modals */}
      <Stack.Group screenOptions={BridgeNavigatorSetup.modalScreenOptions}>
        <Stack.Screen
          name="BridgeTransfer"
          component={PlaceholderScreen}
          options={{ title: BridgeNavigatorSetup.screenTitles.BridgeTransfer }}
        />
      </Stack.Group>

      {/* External Group */}
      <Stack.Group screenOptions={BridgeNavigatorSetup.externalScreenOptions}>
        <Stack.Screen
          name="ExternalOverview"
          component={PlaceholderScreen}
          options={{ title: BridgeNavigatorSetup.screenTitles.ExternalOverview }}
        />
        <Stack.Screen
          name="ApiConnections"
          component={PlaceholderScreen}
          options={{ title: BridgeNavigatorSetup.screenTitles.ApiConnections }}
        />
        <Stack.Screen
          name="ApiConnectionDetail"
          component={PlaceholderScreen}
          options={({ route }) => ({
            title: `Connection: ${route.params.connectionId.slice(0, 8)}...`,
          })}
        />
        <Stack.Screen
          name="Webhooks"
          component={PlaceholderScreen}
          options={{ title: BridgeNavigatorSetup.screenTitles.Webhooks }}
        />
        <Stack.Screen
          name="WebhookDetail"
          component={PlaceholderScreen}
          options={({ route }) => ({
            title: `Webhook: ${route.params.webhookId.slice(0, 8)}...`,
          })}
        />
        <Stack.Screen
          name="ExternalServices"
          component={PlaceholderScreen}
          options={{ title: BridgeNavigatorSetup.screenTitles.ExternalServices }}
        />
        <Stack.Screen
          name="ServiceDetail"
          component={PlaceholderScreen}
          options={({ route }) => ({
            title: `Service: ${route.params.serviceId.slice(0, 8)}...`,
          })}
        />
        <Stack.Screen
          name="ExternalSettings"
          component={PlaceholderScreen}
          options={{ title: BridgeNavigatorSetup.screenTitles.ExternalSettings }}
        />
      </Stack.Group>

      {/* External Modals */}
      <Stack.Group screenOptions={BridgeNavigatorSetup.modalScreenOptions}>
        <Stack.Screen
          name="ApiConnectionCreate"
          component={PlaceholderScreen}
          options={{ title: BridgeNavigatorSetup.screenTitles.ApiConnectionCreate }}
        />
        <Stack.Screen
          name="WebhookCreate"
          component={PlaceholderScreen}
          options={{ title: BridgeNavigatorSetup.screenTitles.WebhookCreate }}
        />
      </Stack.Group>
    </Stack.Navigator>
  );
}

export default BridgeNavigator;
