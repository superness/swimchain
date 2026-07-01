/**
 * SearchScreen - Search spaces and threads
 */

import React, { useState, useCallback } from 'react';
import { View, Text, TextInput, StyleSheet, FlatList } from 'react-native';
import { useNavigation } from '@react-navigation/native';

import { SpaceCard, SpaceData } from '../components/SpaceCard';
import { ThreadCard, ThreadData } from '../components/ThreadCard';
import { TouchPressable } from '../components/TouchPressable';
import { COLORS, SPACING, BORDER_RADIUS, TYPOGRAPHY, TOUCH_TARGET_MIN } from '../theme';

// Mock data
const MOCK_SPACES: SpaceData[] = [
  { id: 'general', name: 'general', description: 'General discussion', threadCount: 42, lastActivity: Date.now() - 300000, isSubscribed: true },
  { id: 'tech', name: 'tech', description: 'Technology', threadCount: 28, lastActivity: Date.now() - 600000, isSubscribed: false },
  { id: 'music', name: 'music', description: 'Music', threadCount: 15, lastActivity: Date.now() - 900000, isSubscribed: false },
  { id: 'gaming', name: 'gaming', description: 'Video games', threadCount: 22, lastActivity: Date.now() - 1200000, isSubscribed: false },
];

type SearchTab = 'spaces' | 'threads';

export default function SearchScreen() {
  const navigation = useNavigation();
  const [query, setQuery] = useState('');
  const [activeTab, setActiveTab] = useState<SearchTab>('spaces');
  const [results, setResults] = useState<SpaceData[]>(MOCK_SPACES);

  const handleSearch = useCallback((text: string) => {
    setQuery(text);
    // Filter results based on query
    const filtered = MOCK_SPACES.filter(
      (s) =>
        s.name.toLowerCase().includes(text.toLowerCase()) ||
        s.description?.toLowerCase().includes(text.toLowerCase())
    );
    setResults(filtered);
  }, []);

  const handleSpacePress = useCallback(
    (space: SpaceData) => {
      navigation.navigate('SpaceView' as never, { spaceId: space.id } as never);
    },
    [navigation]
  );

  return (
    <View style={styles.container}>
      {/* Search Input */}
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search spaces..."
          placeholderTextColor={COLORS.textTertiary}
          value={query}
          onChangeText={handleSearch}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
        />
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        <TouchPressable
          style={[styles.tab, activeTab === 'spaces' && styles.tabActive]}
          onPress={() => setActiveTab('spaces')}
          haptic="selection"
        >
          <Text
            style={[
              styles.tabText,
              activeTab === 'spaces' && styles.tabTextActive,
            ]}
          >
            Spaces
          </Text>
        </TouchPressable>
        <TouchPressable
          style={[styles.tab, activeTab === 'threads' && styles.tabActive]}
          onPress={() => setActiveTab('threads')}
          haptic="selection"
        >
          <Text
            style={[
              styles.tabText,
              activeTab === 'threads' && styles.tabTextActive,
            ]}
          >
            Threads
          </Text>
        </TouchPressable>
      </View>

      {/* Results */}
      {activeTab === 'spaces' && (
        <FlatList
          data={results}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <SpaceCard space={item} onPress={() => handleSpacePress(item)} />
          )}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyText}>No spaces found</Text>
            </View>
          }
        />
      )}

      {activeTab === 'threads' && (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>Thread search coming soon</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  searchContainer: {
    padding: SPACING.md,
  },
  searchInput: {
    height: TOUCH_TARGET_MIN,
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.md,
    paddingHorizontal: SPACING.md,
    fontSize: TYPOGRAPHY.fontSize.base,
    color: COLORS.text,
  },
  tabs: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  tab: {
    flex: 1,
    minHeight: TOUCH_TARGET_MIN,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: COLORS.primary,
  },
  tabText: {
    fontSize: TYPOGRAPHY.fontSize.base,
    fontWeight: TYPOGRAPHY.fontWeight.medium,
    color: COLORS.textSecondary,
  },
  tabTextActive: {
    color: COLORS.primary,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.xl,
  },
  emptyText: {
    fontSize: TYPOGRAPHY.fontSize.base,
    color: COLORS.textSecondary,
  },
});
