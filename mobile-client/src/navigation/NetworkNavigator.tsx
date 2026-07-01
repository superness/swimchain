/**
 * NetworkNavigator - Navigation for Network Features Group
 * Handles: Peers, Sync, and Discovery navigation
 *
 * Routes:
 * - Peers: Peer list, peer details, connection management
 * - Sync: Sync status, chain sync progress, fork detection
 * - Discovery: mDNS discovery, DHT peers, network topology
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
 * Network feature navigation param lists
 */

// Peers-related screens
export type PeersStackParamList = {
  PeersList: undefined;
  PeerDetail: { peerId: string };
  PeerConnect: undefined;
  PeerDisconnect: { peerId: string };
  PeerBan: { peerId: string };
  BannedPeers: undefined;
};

// Sync-related screens
export type SyncStackParamList = {
  SyncStatus: undefined;
  SyncProgress: { chainId?: string };
  ForkDetection: undefined;
  ForkDetail: { forkId: string };
  ChainComparison: { localHeight: number; remoteHeight: number; peerId: string };
  SyncSettings: undefined;
};

// Discovery-related screens
export type DiscoveryStackParamList = {
  DiscoveryOverview: undefined;
  MdnsDiscovery: undefined;
  DhtPeers: undefined;
  DhtPeerDetail: { peerId: string };
  NetworkTopology: undefined;
  BootstrapNodes: undefined;
};

// Combined Network navigation param list
export type NetworkStackParamList = {
  // Peers routes
  Peers: NavigatorScreenParams<PeersStackParamList>;
  PeersList: undefined;
  PeerDetail: { peerId: string };
  PeerConnect: undefined;
  PeerDisconnect: { peerId: string };
  PeerBan: { peerId: string };
  BannedPeers: undefined;

  // Sync routes
  Sync: NavigatorScreenParams<SyncStackParamList>;
  SyncStatus: undefined;
  SyncProgress: { chainId?: string };
  ForkDetection: undefined;
  ForkDetail: { forkId: string };
  ChainComparison: { localHeight: number; remoteHeight: number; peerId: string };
  SyncSettings: undefined;

  // Discovery routes
  Discovery: NavigatorScreenParams<DiscoveryStackParamList>;
  DiscoveryOverview: undefined;
  MdnsDiscovery: undefined;
  DhtPeers: undefined;
  DhtPeerDetail: { peerId: string };
  NetworkTopology: undefined;
  BootstrapNodes: undefined;
};

// ============================================================================
// SCREEN PROPS TYPES
// ============================================================================

export type NetworkStackScreenProps<T extends keyof NetworkStackParamList> =
  NativeStackScreenProps<NetworkStackParamList, T>;

export type PeersStackScreenProps<T extends keyof PeersStackParamList> =
  NativeStackScreenProps<PeersStackParamList, T>;

export type SyncStackScreenProps<T extends keyof SyncStackParamList> =
  NativeStackScreenProps<SyncStackParamList, T>;

export type DiscoveryStackScreenProps<T extends keyof DiscoveryStackParamList> =
  NativeStackScreenProps<DiscoveryStackParamList, T>;

// ============================================================================
// ROUTE DEFINITIONS
// ============================================================================

/**
 * Route configuration for Network features
 */
export const NETWORK_ROUTES = {
  // Peers routes
  PEERS: {
    LIST: 'PeersList',
    DETAIL: 'PeerDetail',
    CONNECT: 'PeerConnect',
    DISCONNECT: 'PeerDisconnect',
    BAN: 'PeerBan',
    BANNED: 'BannedPeers',
  },

  // Sync routes
  SYNC: {
    STATUS: 'SyncStatus',
    PROGRESS: 'SyncProgress',
    FORK_DETECTION: 'ForkDetection',
    FORK_DETAIL: 'ForkDetail',
    CHAIN_COMPARISON: 'ChainComparison',
    SETTINGS: 'SyncSettings',
  },

  // Discovery routes
  DISCOVERY: {
    OVERVIEW: 'DiscoveryOverview',
    MDNS: 'MdnsDiscovery',
    DHT_PEERS: 'DhtPeers',
    DHT_PEER_DETAIL: 'DhtPeerDetail',
    TOPOLOGY: 'NetworkTopology',
    BOOTSTRAP: 'BootstrapNodes',
  },
} as const;

// ============================================================================
// NAVIGATION SELECTORS
// ============================================================================

/**
 * Selectors for extracting route params and state
 */
export const NetworkNavigationSelectors = {
  // Peers selectors
  getPeerDetailParams: (route: NetworkStackScreenProps<'PeerDetail'>['route']) => ({
    peerId: route.params.peerId,
  }),

  getPeerDisconnectParams: (route: NetworkStackScreenProps<'PeerDisconnect'>['route']) => ({
    peerId: route.params.peerId,
  }),

  getPeerBanParams: (route: NetworkStackScreenProps<'PeerBan'>['route']) => ({
    peerId: route.params.peerId,
  }),

  // Sync selectors
  getSyncProgressParams: (route: NetworkStackScreenProps<'SyncProgress'>['route']) => ({
    chainId: route.params?.chainId,
  }),

  getForkDetailParams: (route: NetworkStackScreenProps<'ForkDetail'>['route']) => ({
    forkId: route.params.forkId,
  }),

  getChainComparisonParams: (route: NetworkStackScreenProps<'ChainComparison'>['route']) => ({
    localHeight: route.params.localHeight,
    remoteHeight: route.params.remoteHeight,
    peerId: route.params.peerId,
  }),

  // Discovery selectors
  getDhtPeerDetailParams: (route: NetworkStackScreenProps<'DhtPeerDetail'>['route']) => ({
    peerId: route.params.peerId,
  }),
};

// ============================================================================
// SETUP DEFINITIONS
// ============================================================================

/**
 * Navigator screen options configuration
 */
export const NetworkNavigatorSetup = {
  // Default screen options for Network navigator
  defaultScreenOptions: {
    headerShown: true,
    headerStyle: { backgroundColor: COLORS.background },
    headerTitleStyle: { color: COLORS.text },
    headerTintColor: COLORS.primary,
    contentStyle: { backgroundColor: COLORS.background },
  },

  // Peers group screen options
  peersScreenOptions: {
    headerShown: true,
    headerStyle: { backgroundColor: COLORS.background },
    headerTitleStyle: { color: COLORS.text },
    headerTintColor: COLORS.primary,
  },

  // Sync group screen options
  syncScreenOptions: {
    headerShown: true,
    headerStyle: { backgroundColor: COLORS.background },
    headerTitleStyle: { color: COLORS.text },
    headerTintColor: COLORS.primary,
  },

  // Discovery group screen options
  discoveryScreenOptions: {
    headerShown: true,
    headerStyle: { backgroundColor: COLORS.background },
    headerTitleStyle: { color: COLORS.text },
    headerTintColor: COLORS.primary,
  },

  // Modal presentation options (for peer actions)
  modalScreenOptions: {
    presentation: 'modal' as const,
    headerShown: true,
    headerStyle: { backgroundColor: COLORS.background },
    headerTitleStyle: { color: COLORS.text },
    headerTintColor: COLORS.primary,
  },

  // Screen titles configuration
  screenTitles: {
    // Peers
    PeersList: 'Peers',
    PeerDetail: 'Peer Details',
    PeerConnect: 'Connect to Peer',
    PeerDisconnect: 'Disconnect Peer',
    PeerBan: 'Ban Peer',
    BannedPeers: 'Banned Peers',
    // Sync
    SyncStatus: 'Sync Status',
    SyncProgress: 'Sync Progress',
    ForkDetection: 'Fork Detection',
    ForkDetail: 'Fork Details',
    ChainComparison: 'Chain Comparison',
    SyncSettings: 'Sync Settings',
    // Discovery
    DiscoveryOverview: 'Discovery',
    MdnsDiscovery: 'mDNS Discovery',
    DhtPeers: 'DHT Peers',
    DhtPeerDetail: 'DHT Peer Details',
    NetworkTopology: 'Network Topology',
    BootstrapNodes: 'Bootstrap Nodes',
  } as Record<keyof NetworkStackParamList, string>,
};

// ============================================================================
// NAVIGATION HELPERS
// ============================================================================

/**
 * Helper functions for Network navigation
 */
export const NetworkNavigationHelpers = {
  // Navigate to peer detail
  navigateToPeerDetail: (
    navigation: NetworkStackScreenProps<keyof NetworkStackParamList>['navigation'],
    peerId: string
  ) => {
    navigation.navigate('PeerDetail', { peerId });
  },

  // Navigate to peer connect modal
  navigateToPeerConnect: (
    navigation: NetworkStackScreenProps<keyof NetworkStackParamList>['navigation']
  ) => {
    navigation.navigate('PeerConnect');
  },

  // Navigate to peer disconnect confirmation
  navigateToPeerDisconnect: (
    navigation: NetworkStackScreenProps<keyof NetworkStackParamList>['navigation'],
    peerId: string
  ) => {
    navigation.navigate('PeerDisconnect', { peerId });
  },

  // Navigate to peer ban confirmation
  navigateToPeerBan: (
    navigation: NetworkStackScreenProps<keyof NetworkStackParamList>['navigation'],
    peerId: string
  ) => {
    navigation.navigate('PeerBan', { peerId });
  },

  // Navigate to sync progress
  navigateToSyncProgress: (
    navigation: NetworkStackScreenProps<keyof NetworkStackParamList>['navigation'],
    chainId?: string
  ) => {
    navigation.navigate('SyncProgress', { chainId });
  },

  // Navigate to fork detail
  navigateToForkDetail: (
    navigation: NetworkStackScreenProps<keyof NetworkStackParamList>['navigation'],
    forkId: string
  ) => {
    navigation.navigate('ForkDetail', { forkId });
  },

  // Navigate to chain comparison
  navigateToChainComparison: (
    navigation: NetworkStackScreenProps<keyof NetworkStackParamList>['navigation'],
    localHeight: number,
    remoteHeight: number,
    peerId: string
  ) => {
    navigation.navigate('ChainComparison', { localHeight, remoteHeight, peerId });
  },

  // Navigate to DHT peer detail
  navigateToDhtPeerDetail: (
    navigation: NetworkStackScreenProps<keyof NetworkStackParamList>['navigation'],
    peerId: string
  ) => {
    navigation.navigate('DhtPeerDetail', { peerId });
  },

  // Navigate to network topology view
  navigateToNetworkTopology: (
    navigation: NetworkStackScreenProps<keyof NetworkStackParamList>['navigation']
  ) => {
    navigation.navigate('NetworkTopology');
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

const Stack = createNativeStackNavigator<NetworkStackParamList>();

/**
 * Network Navigator Component
 * Groups Peers, Sync, and Discovery navigation
 */
export function NetworkNavigator() {
  return (
    <Stack.Navigator
      screenOptions={NetworkNavigatorSetup.defaultScreenOptions}
    >
      {/* Peers Group */}
      <Stack.Group screenOptions={NetworkNavigatorSetup.peersScreenOptions}>
        <Stack.Screen
          name="PeersList"
          component={PlaceholderScreen}
          options={{ title: NetworkNavigatorSetup.screenTitles.PeersList }}
        />
        <Stack.Screen
          name="PeerDetail"
          component={PlaceholderScreen}
          options={({ route }) => ({
            title: `Peer: ${route.params.peerId.slice(0, 8)}...`,
          })}
        />
        <Stack.Screen
          name="BannedPeers"
          component={PlaceholderScreen}
          options={{ title: NetworkNavigatorSetup.screenTitles.BannedPeers }}
        />
      </Stack.Group>

      {/* Peers Modals */}
      <Stack.Group screenOptions={NetworkNavigatorSetup.modalScreenOptions}>
        <Stack.Screen
          name="PeerConnect"
          component={PlaceholderScreen}
          options={{ title: NetworkNavigatorSetup.screenTitles.PeerConnect }}
        />
        <Stack.Screen
          name="PeerDisconnect"
          component={PlaceholderScreen}
          options={{ title: NetworkNavigatorSetup.screenTitles.PeerDisconnect }}
        />
        <Stack.Screen
          name="PeerBan"
          component={PlaceholderScreen}
          options={{ title: NetworkNavigatorSetup.screenTitles.PeerBan }}
        />
      </Stack.Group>

      {/* Sync Group */}
      <Stack.Group screenOptions={NetworkNavigatorSetup.syncScreenOptions}>
        <Stack.Screen
          name="SyncStatus"
          component={PlaceholderScreen}
          options={{ title: NetworkNavigatorSetup.screenTitles.SyncStatus }}
        />
        <Stack.Screen
          name="SyncProgress"
          component={PlaceholderScreen}
          options={{ title: NetworkNavigatorSetup.screenTitles.SyncProgress }}
        />
        <Stack.Screen
          name="ForkDetection"
          component={PlaceholderScreen}
          options={{ title: NetworkNavigatorSetup.screenTitles.ForkDetection }}
        />
        <Stack.Screen
          name="ForkDetail"
          component={PlaceholderScreen}
          options={({ route }) => ({
            title: `Fork: ${route.params.forkId.slice(0, 8)}...`,
          })}
        />
        <Stack.Screen
          name="ChainComparison"
          component={PlaceholderScreen}
          options={{ title: NetworkNavigatorSetup.screenTitles.ChainComparison }}
        />
        <Stack.Screen
          name="SyncSettings"
          component={PlaceholderScreen}
          options={{ title: NetworkNavigatorSetup.screenTitles.SyncSettings }}
        />
      </Stack.Group>

      {/* Discovery Group */}
      <Stack.Group screenOptions={NetworkNavigatorSetup.discoveryScreenOptions}>
        <Stack.Screen
          name="DiscoveryOverview"
          component={PlaceholderScreen}
          options={{ title: NetworkNavigatorSetup.screenTitles.DiscoveryOverview }}
        />
        <Stack.Screen
          name="MdnsDiscovery"
          component={PlaceholderScreen}
          options={{ title: NetworkNavigatorSetup.screenTitles.MdnsDiscovery }}
        />
        <Stack.Screen
          name="DhtPeers"
          component={PlaceholderScreen}
          options={{ title: NetworkNavigatorSetup.screenTitles.DhtPeers }}
        />
        <Stack.Screen
          name="DhtPeerDetail"
          component={PlaceholderScreen}
          options={({ route }) => ({
            title: `DHT Peer: ${route.params.peerId.slice(0, 8)}...`,
          })}
        />
        <Stack.Screen
          name="NetworkTopology"
          component={PlaceholderScreen}
          options={{ title: NetworkNavigatorSetup.screenTitles.NetworkTopology }}
        />
        <Stack.Screen
          name="BootstrapNodes"
          component={PlaceholderScreen}
          options={{ title: NetworkNavigatorSetup.screenTitles.BootstrapNodes }}
        />
      </Stack.Group>
    </Stack.Navigator>
  );
}

export default NetworkNavigator;
