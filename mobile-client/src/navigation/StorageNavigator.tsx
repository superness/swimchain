/**
 * StorageNavigator - Navigation for Storage Features Group
 * Handles: Storage, Search Index, and Archiver navigation
 *
 * Routes:
 * - Storage: Storage overview, sled database, caching, aggregation
 * - SearchIndex: Tantivy search, search settings, indexing status
 * - Archiver: Archive browser, archive creation, archive restore
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
 * Storage feature navigation param lists
 */

// Storage-related screens (sled database, caching)
export type StorageSubStackParamList = {
  StorageOverview: undefined;
  StorageStats: undefined;
  SledDatabase: undefined;
  CacheManagement: undefined;
  CacheDetail: { cacheType: string };
  AggregationCache: undefined;
  StorageSettings: undefined;
};

// Search Index-related screens
export type SearchIndexStackParamList = {
  SearchIndexOverview: undefined;
  SearchQuery: { initialQuery?: string };
  SearchResults: { query: string; filters?: Record<string, string> };
  IndexingStatus: undefined;
  IndexStats: undefined;
  SearchSettings: undefined;
  RebuildIndex: undefined;
};

// Archiver-related screens
export type ArchiverStackParamList = {
  ArchiverOverview: undefined;
  ArchiveList: undefined;
  ArchiveDetail: { archiveId: string };
  CreateArchive: undefined;
  RestoreArchive: { archiveId: string };
  ArchiveSettings: undefined;
  ExportData: undefined;
  ImportData: undefined;
};

// Combined Storage navigation param list
export type StorageStackParamList = {
  // Storage routes
  Storage: NavigatorScreenParams<StorageSubStackParamList>;
  StorageOverview: undefined;
  StorageStats: undefined;
  SledDatabase: undefined;
  CacheManagement: undefined;
  CacheDetail: { cacheType: string };
  AggregationCache: undefined;
  StorageSettings: undefined;

  // Search Index routes
  SearchIndex: NavigatorScreenParams<SearchIndexStackParamList>;
  SearchIndexOverview: undefined;
  SearchQuery: { initialQuery?: string };
  SearchResults: { query: string; filters?: Record<string, string> };
  IndexingStatus: undefined;
  IndexStats: undefined;
  SearchSettings: undefined;
  RebuildIndex: undefined;

  // Archiver routes
  Archiver: NavigatorScreenParams<ArchiverStackParamList>;
  ArchiverOverview: undefined;
  ArchiveList: undefined;
  ArchiveDetail: { archiveId: string };
  CreateArchive: undefined;
  RestoreArchive: { archiveId: string };
  ArchiveSettings: undefined;
  ExportData: undefined;
  ImportData: undefined;
};

// ============================================================================
// SCREEN PROPS TYPES
// ============================================================================

export type StorageNavigatorScreenProps<T extends keyof StorageStackParamList> =
  NativeStackScreenProps<StorageStackParamList, T>;

export type StorageSubStackScreenProps<T extends keyof StorageSubStackParamList> =
  NativeStackScreenProps<StorageSubStackParamList, T>;

export type SearchIndexStackScreenProps<T extends keyof SearchIndexStackParamList> =
  NativeStackScreenProps<SearchIndexStackParamList, T>;

export type ArchiverStackScreenProps<T extends keyof ArchiverStackParamList> =
  NativeStackScreenProps<ArchiverStackParamList, T>;

// ============================================================================
// ROUTE DEFINITIONS
// ============================================================================

/**
 * Route configuration for Storage features
 */
export const STORAGE_ROUTES = {
  // Storage routes
  STORAGE: {
    OVERVIEW: 'StorageOverview',
    STATS: 'StorageStats',
    SLED_DATABASE: 'SledDatabase',
    CACHE_MANAGEMENT: 'CacheManagement',
    CACHE_DETAIL: 'CacheDetail',
    AGGREGATION_CACHE: 'AggregationCache',
    SETTINGS: 'StorageSettings',
  },

  // Search Index routes
  SEARCH_INDEX: {
    OVERVIEW: 'SearchIndexOverview',
    QUERY: 'SearchQuery',
    RESULTS: 'SearchResults',
    INDEXING_STATUS: 'IndexingStatus',
    INDEX_STATS: 'IndexStats',
    SETTINGS: 'SearchSettings',
    REBUILD: 'RebuildIndex',
  },

  // Archiver routes
  ARCHIVER: {
    OVERVIEW: 'ArchiverOverview',
    LIST: 'ArchiveList',
    DETAIL: 'ArchiveDetail',
    CREATE: 'CreateArchive',
    RESTORE: 'RestoreArchive',
    SETTINGS: 'ArchiveSettings',
    EXPORT: 'ExportData',
    IMPORT: 'ImportData',
  },
} as const;

// ============================================================================
// NAVIGATION SELECTORS
// ============================================================================

/**
 * Selectors for extracting route params and state
 */
export const StorageNavigationSelectors = {
  // Storage selectors
  getCacheDetailParams: (route: StorageNavigatorScreenProps<'CacheDetail'>['route']) => ({
    cacheType: route.params.cacheType,
  }),

  // Search Index selectors
  getSearchQueryParams: (route: StorageNavigatorScreenProps<'SearchQuery'>['route']) => ({
    initialQuery: route.params?.initialQuery,
  }),

  getSearchResultsParams: (route: StorageNavigatorScreenProps<'SearchResults'>['route']) => ({
    query: route.params.query,
    filters: route.params.filters,
  }),

  // Archiver selectors
  getArchiveDetailParams: (route: StorageNavigatorScreenProps<'ArchiveDetail'>['route']) => ({
    archiveId: route.params.archiveId,
  }),

  getRestoreArchiveParams: (route: StorageNavigatorScreenProps<'RestoreArchive'>['route']) => ({
    archiveId: route.params.archiveId,
  }),
};

// ============================================================================
// SETUP DEFINITIONS
// ============================================================================

/**
 * Navigator screen options configuration
 */
export const StorageNavigatorSetup = {
  // Default screen options for Storage navigator
  defaultScreenOptions: {
    headerShown: true,
    headerStyle: { backgroundColor: COLORS.background },
    headerTitleStyle: { color: COLORS.text },
    headerTintColor: COLORS.primary,
    contentStyle: { backgroundColor: COLORS.background },
  },

  // Storage group screen options
  storageScreenOptions: {
    headerShown: true,
    headerStyle: { backgroundColor: COLORS.background },
    headerTitleStyle: { color: COLORS.text },
    headerTintColor: COLORS.primary,
  },

  // Search Index group screen options
  searchIndexScreenOptions: {
    headerShown: true,
    headerStyle: { backgroundColor: COLORS.background },
    headerTitleStyle: { color: COLORS.text },
    headerTintColor: COLORS.primary,
  },

  // Archiver group screen options
  archiverScreenOptions: {
    headerShown: true,
    headerStyle: { backgroundColor: COLORS.background },
    headerTitleStyle: { color: COLORS.text },
    headerTintColor: COLORS.primary,
  },

  // Modal presentation options (for create/restore actions)
  modalScreenOptions: {
    presentation: 'modal' as const,
    headerShown: true,
    headerStyle: { backgroundColor: COLORS.background },
    headerTitleStyle: { color: COLORS.text },
    headerTintColor: COLORS.primary,
  },

  // Screen titles configuration
  screenTitles: {
    // Storage
    Storage: 'Storage',
    StorageOverview: 'Storage',
    StorageStats: 'Storage Statistics',
    SledDatabase: 'Sled Database',
    CacheManagement: 'Cache Management',
    CacheDetail: 'Cache Details',
    AggregationCache: 'Aggregation Cache',
    StorageSettings: 'Storage Settings',
    // Search Index
    SearchIndex: 'Search Index',
    SearchIndexOverview: 'Search Index',
    SearchQuery: 'Search',
    SearchResults: 'Search Results',
    IndexingStatus: 'Indexing Status',
    IndexStats: 'Index Statistics',
    SearchSettings: 'Search Settings',
    RebuildIndex: 'Rebuild Index',
    // Archiver
    Archiver: 'Archiver',
    ArchiverOverview: 'Archiver',
    ArchiveList: 'Archives',
    ArchiveDetail: 'Archive Details',
    CreateArchive: 'Create Archive',
    RestoreArchive: 'Restore Archive',
    ArchiveSettings: 'Archive Settings',
    ExportData: 'Export Data',
    ImportData: 'Import Data',
  } as Record<keyof StorageStackParamList, string>,
};

// ============================================================================
// NAVIGATION HELPERS
// ============================================================================

/**
 * Helper functions for Storage navigation
 */
export const StorageNavigationHelpers = {
  // Navigate to storage stats
  navigateToStorageStats: (
    navigation: StorageNavigatorScreenProps<keyof StorageStackParamList>['navigation']
  ) => {
    navigation.navigate('StorageStats');
  },

  // Navigate to cache detail
  navigateToCacheDetail: (
    navigation: StorageNavigatorScreenProps<keyof StorageStackParamList>['navigation'],
    cacheType: string
  ) => {
    navigation.navigate('CacheDetail', { cacheType });
  },

  // Navigate to sled database view
  navigateToSledDatabase: (
    navigation: StorageNavigatorScreenProps<keyof StorageStackParamList>['navigation']
  ) => {
    navigation.navigate('SledDatabase');
  },

  // Navigate to search with initial query
  navigateToSearch: (
    navigation: StorageNavigatorScreenProps<keyof StorageStackParamList>['navigation'],
    initialQuery?: string
  ) => {
    navigation.navigate('SearchQuery', { initialQuery });
  },

  // Navigate to search results
  navigateToSearchResults: (
    navigation: StorageNavigatorScreenProps<keyof StorageStackParamList>['navigation'],
    query: string,
    filters?: Record<string, string>
  ) => {
    navigation.navigate('SearchResults', { query, filters });
  },

  // Navigate to indexing status
  navigateToIndexingStatus: (
    navigation: StorageNavigatorScreenProps<keyof StorageStackParamList>['navigation']
  ) => {
    navigation.navigate('IndexingStatus');
  },

  // Navigate to rebuild index modal
  navigateToRebuildIndex: (
    navigation: StorageNavigatorScreenProps<keyof StorageStackParamList>['navigation']
  ) => {
    navigation.navigate('RebuildIndex');
  },

  // Navigate to archive list
  navigateToArchiveList: (
    navigation: StorageNavigatorScreenProps<keyof StorageStackParamList>['navigation']
  ) => {
    navigation.navigate('ArchiveList');
  },

  // Navigate to archive detail
  navigateToArchiveDetail: (
    navigation: StorageNavigatorScreenProps<keyof StorageStackParamList>['navigation'],
    archiveId: string
  ) => {
    navigation.navigate('ArchiveDetail', { archiveId });
  },

  // Navigate to create archive modal
  navigateToCreateArchive: (
    navigation: StorageNavigatorScreenProps<keyof StorageStackParamList>['navigation']
  ) => {
    navigation.navigate('CreateArchive');
  },

  // Navigate to restore archive modal
  navigateToRestoreArchive: (
    navigation: StorageNavigatorScreenProps<keyof StorageStackParamList>['navigation'],
    archiveId: string
  ) => {
    navigation.navigate('RestoreArchive', { archiveId });
  },

  // Navigate to export data
  navigateToExportData: (
    navigation: StorageNavigatorScreenProps<keyof StorageStackParamList>['navigation']
  ) => {
    navigation.navigate('ExportData');
  },

  // Navigate to import data
  navigateToImportData: (
    navigation: StorageNavigatorScreenProps<keyof StorageStackParamList>['navigation']
  ) => {
    navigation.navigate('ImportData');
  },
};

// ============================================================================
// PLACEHOLDER SCREENS (to be replaced with actual implementations)
// ============================================================================

// Placeholder components for screens not yet implemented
const PlaceholderScreen = ({ route }: { route: { name: string } }) => {
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

const Stack = createNativeStackNavigator<StorageStackParamList>();

/**
 * Storage Navigator Component
 * Groups Storage, Search Index, and Archiver navigation
 */
export function StorageNavigator() {
  return (
    <Stack.Navigator
      screenOptions={StorageNavigatorSetup.defaultScreenOptions}
    >
      {/* Storage Group */}
      <Stack.Group screenOptions={StorageNavigatorSetup.storageScreenOptions}>
        <Stack.Screen
          name="StorageOverview"
          component={PlaceholderScreen}
          options={{ title: StorageNavigatorSetup.screenTitles.StorageOverview }}
        />
        <Stack.Screen
          name="StorageStats"
          component={PlaceholderScreen}
          options={{ title: StorageNavigatorSetup.screenTitles.StorageStats }}
        />
        <Stack.Screen
          name="SledDatabase"
          component={PlaceholderScreen}
          options={{ title: StorageNavigatorSetup.screenTitles.SledDatabase }}
        />
        <Stack.Screen
          name="CacheManagement"
          component={PlaceholderScreen}
          options={{ title: StorageNavigatorSetup.screenTitles.CacheManagement }}
        />
        <Stack.Screen
          name="CacheDetail"
          component={PlaceholderScreen}
          options={({ route }) => ({
            title: `Cache: ${route.params.cacheType}`,
          })}
        />
        <Stack.Screen
          name="AggregationCache"
          component={PlaceholderScreen}
          options={{ title: StorageNavigatorSetup.screenTitles.AggregationCache }}
        />
        <Stack.Screen
          name="StorageSettings"
          component={PlaceholderScreen}
          options={{ title: StorageNavigatorSetup.screenTitles.StorageSettings }}
        />
      </Stack.Group>

      {/* Search Index Group */}
      <Stack.Group screenOptions={StorageNavigatorSetup.searchIndexScreenOptions}>
        <Stack.Screen
          name="SearchIndexOverview"
          component={PlaceholderScreen}
          options={{ title: StorageNavigatorSetup.screenTitles.SearchIndexOverview }}
        />
        <Stack.Screen
          name="SearchQuery"
          component={PlaceholderScreen}
          options={{ title: StorageNavigatorSetup.screenTitles.SearchQuery }}
        />
        <Stack.Screen
          name="SearchResults"
          component={PlaceholderScreen}
          options={({ route }) => ({
            title: `Results: "${route.params.query}"`,
          })}
        />
        <Stack.Screen
          name="IndexingStatus"
          component={PlaceholderScreen}
          options={{ title: StorageNavigatorSetup.screenTitles.IndexingStatus }}
        />
        <Stack.Screen
          name="IndexStats"
          component={PlaceholderScreen}
          options={{ title: StorageNavigatorSetup.screenTitles.IndexStats }}
        />
        <Stack.Screen
          name="SearchSettings"
          component={PlaceholderScreen}
          options={{ title: StorageNavigatorSetup.screenTitles.SearchSettings }}
        />
      </Stack.Group>

      {/* Search Index Modals */}
      <Stack.Group screenOptions={StorageNavigatorSetup.modalScreenOptions}>
        <Stack.Screen
          name="RebuildIndex"
          component={PlaceholderScreen}
          options={{ title: StorageNavigatorSetup.screenTitles.RebuildIndex }}
        />
      </Stack.Group>

      {/* Archiver Group */}
      <Stack.Group screenOptions={StorageNavigatorSetup.archiverScreenOptions}>
        <Stack.Screen
          name="ArchiverOverview"
          component={PlaceholderScreen}
          options={{ title: StorageNavigatorSetup.screenTitles.ArchiverOverview }}
        />
        <Stack.Screen
          name="ArchiveList"
          component={PlaceholderScreen}
          options={{ title: StorageNavigatorSetup.screenTitles.ArchiveList }}
        />
        <Stack.Screen
          name="ArchiveDetail"
          component={PlaceholderScreen}
          options={({ route }) => ({
            title: `Archive: ${route.params.archiveId.slice(0, 8)}...`,
          })}
        />
        <Stack.Screen
          name="ArchiveSettings"
          component={PlaceholderScreen}
          options={{ title: StorageNavigatorSetup.screenTitles.ArchiveSettings }}
        />
      </Stack.Group>

      {/* Archiver Modals */}
      <Stack.Group screenOptions={StorageNavigatorSetup.modalScreenOptions}>
        <Stack.Screen
          name="CreateArchive"
          component={PlaceholderScreen}
          options={{ title: StorageNavigatorSetup.screenTitles.CreateArchive }}
        />
        <Stack.Screen
          name="RestoreArchive"
          component={PlaceholderScreen}
          options={{ title: StorageNavigatorSetup.screenTitles.RestoreArchive }}
        />
        <Stack.Screen
          name="ExportData"
          component={PlaceholderScreen}
          options={{ title: StorageNavigatorSetup.screenTitles.ExportData }}
        />
        <Stack.Screen
          name="ImportData"
          component={PlaceholderScreen}
          options={{ title: StorageNavigatorSetup.screenTitles.ImportData }}
        />
      </Stack.Group>
    </Stack.Navigator>
  );
}

export default StorageNavigator;
