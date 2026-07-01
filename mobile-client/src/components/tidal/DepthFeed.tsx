/**
 * DepthFeed - Depth-based content navigation
 *
 * Content is organized by depth (time survived) rather than
 * chronological order. Users dive deeper to find proven content.
 */

import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, SectionList, RefreshControl } from 'react-native';
import Animated, {
  useAnimatedScrollHandler,
  useSharedValue,
  useAnimatedStyle,
  interpolate,
  Extrapolate,
} from 'react-native-reanimated';

import { COLORS, SPACING, TYPOGRAPHY } from '../../theme';

// Depth layers based on content age/survival
export type DepthLayer = 'surface' | 'shallows' | 'deep' | 'archive';

export interface DepthItem {
  id: string;
  title: string;
  authorAddress: string;
  createdAt: number;
  survivalProbability: number;
  depth: DepthLayer;
}

interface DepthFeedProps<T extends DepthItem> {
  items: T[];
  renderItem: (item: T, depth: DepthLayer) => React.ReactElement;
  onRefresh?: () => void;
  refreshing?: boolean;
  onDepthChange?: (depth: DepthLayer) => void;
  ListEmptyComponent?: React.ReactElement;
}

// Layer metadata
const LAYER_CONFIG: Record<DepthLayer, {
  icon: string;
  title: string;
  subtitle: string;
  color: string;
  backgroundColor: string;
}> = {
  surface: {
    icon: '🌊',
    title: 'SURFACE',
    subtitle: 'Fresh Content',
    color: '#60A5FA',
    backgroundColor: '#1E3A5F',
  },
  shallows: {
    icon: '🐚',
    title: 'SHALLOWS',
    subtitle: 'Finding Footing',
    color: '#34D399',
    backgroundColor: '#1A3D32',
  },
  deep: {
    icon: '🦑',
    title: 'THE DEEP',
    subtitle: 'Proven Survivors',
    color: '#A78BFA',
    backgroundColor: '#2D2458',
  },
  archive: {
    icon: '🏛️',
    title: 'THE ARCHIVE',
    subtitle: 'Permanent',
    color: '#FBBF24',
    backgroundColor: '#433D1B',
  },
};

// Categorize items by depth layer based on age and survival
function categorizeByDepth<T extends DepthItem>(items: T[]): Map<DepthLayer, T[]> {
  const now = Date.now();
  const categories = new Map<DepthLayer, T[]>([
    ['surface', []],
    ['shallows', []],
    ['deep', []],
    ['archive', []],
  ]);

  items.forEach((item) => {
    const ageHours = (now - item.createdAt) / (1000 * 60 * 60);

    let layer: DepthLayer;
    if (ageHours < 1) {
      layer = 'surface';
    } else if (ageHours < 6) {
      layer = 'shallows';
    } else if (ageHours < 24) {
      layer = 'deep';
    } else {
      layer = 'archive';
    }

    categories.get(layer)?.push({ ...item, depth: layer });
  });

  return categories;
}

const AnimatedSectionList = Animated.createAnimatedComponent(SectionList);

export function DepthFeed<T extends DepthItem>({
  items,
  renderItem,
  onRefresh,
  refreshing = false,
  onDepthChange,
  ListEmptyComponent,
}: DepthFeedProps<T>) {
  const scrollY = useSharedValue(0);
  const [currentDepth, setCurrentDepth] = useState<DepthLayer>('surface');

  // Categorize items
  const sections = useMemo(() => {
    const categories = categorizeByDepth(items);
    const result: { depth: DepthLayer; data: T[] }[] = [];

    // Only include sections with items
    (['surface', 'shallows', 'deep', 'archive'] as DepthLayer[]).forEach((depth) => {
      const layerItems = categories.get(depth) || [];
      if (layerItems.length > 0) {
        result.push({ depth, data: layerItems as T[] });
      }
    });

    return result;
  }, [items]);

  // Scroll handler
  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollY.value = event.contentOffset.y;
    },
  });

  // Track which section is visible
  const handleViewableItemsChanged = useCallback(({ viewableItems }: any) => {
    if (viewableItems.length > 0) {
      const firstVisible = viewableItems[0];
      if (firstVisible.section?.depth && firstVisible.section.depth !== currentDepth) {
        setCurrentDepth(firstVisible.section.depth);
        onDepthChange?.(firstVisible.section.depth);
      }
    }
  }, [currentDepth, onDepthChange]);

  // Render section header
  const renderSectionHeader = useCallback(({ section }: { section: { depth: DepthLayer; data: T[] } }) => {
    const config = LAYER_CONFIG[section.depth];
    return (
      <DepthHeader
        depth={section.depth}
        config={config}
        itemCount={section.data.length}
      />
    );
  }, []);

  // Render item wrapper
  const renderItemWrapper = useCallback(({ item, section }: { item: T; section: { depth: DepthLayer } }) => {
    return (
      <View style={styles.itemWrapper}>
        {renderItem(item, section.depth)}
      </View>
    );
  }, [renderItem]);

  // Depth indicator style
  const depthIndicatorStyle = useAnimatedStyle(() => {
    const progress = interpolate(
      scrollY.value,
      [0, 200, 600, 1200],
      [0, 0.33, 0.66, 1],
      Extrapolate.CLAMP
    );

    return {
      top: `${progress * 80 + 10}%`,
    };
  });

  const currentConfig = LAYER_CONFIG[currentDepth];

  return (
    <View style={styles.container}>
      {/* Depth indicator sidebar */}
      <View style={styles.depthIndicator}>
        <View style={styles.depthTrack}>
          <Animated.View style={[styles.depthMarker, depthIndicatorStyle, { backgroundColor: currentConfig.color }]} />
        </View>
        <View style={styles.depthLabels}>
          <Text style={[styles.depthLabel, currentDepth === 'surface' && { color: LAYER_CONFIG.surface.color }]}>🌊</Text>
          <Text style={[styles.depthLabel, currentDepth === 'shallows' && { color: LAYER_CONFIG.shallows.color }]}>🐚</Text>
          <Text style={[styles.depthLabel, currentDepth === 'deep' && { color: LAYER_CONFIG.deep.color }]}>🦑</Text>
          <Text style={[styles.depthLabel, currentDepth === 'archive' && { color: LAYER_CONFIG.archive.color }]}>🏛️</Text>
        </View>
      </View>

      {/* Main feed */}
      <AnimatedSectionList
        sections={sections}
        keyExtractor={(item: T) => item.id}
        renderItem={renderItemWrapper}
        renderSectionHeader={renderSectionHeader}
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        onViewableItemsChanged={handleViewableItemsChanged}
        viewabilityConfig={{
          itemVisiblePercentThreshold: 50,
        }}
        refreshControl={
          onRefresh ? (
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={currentConfig.color}
              colors={[currentConfig.color]}
            />
          ) : undefined
        }
        ListEmptyComponent={ListEmptyComponent || <EmptyDepth />}
        stickySectionHeadersEnabled
        style={styles.list}
        contentContainerStyle={styles.listContent}
      />
    </View>
  );
}

// Section header component
interface DepthHeaderProps {
  depth: DepthLayer;
  config: typeof LAYER_CONFIG[DepthLayer];
  itemCount: number;
}

function DepthHeader({ depth, config, itemCount }: DepthHeaderProps) {
  return (
    <View style={[styles.sectionHeader, { backgroundColor: config.backgroundColor }]}>
      <View style={styles.sectionHeaderLeft}>
        <Text style={styles.sectionIcon}>{config.icon}</Text>
        <View>
          <Text style={[styles.sectionTitle, { color: config.color }]}>
            {config.title}
          </Text>
          <Text style={styles.sectionSubtitle}>{config.subtitle}</Text>
        </View>
      </View>
      <Text style={[styles.sectionCount, { color: config.color }]}>
        {itemCount} {itemCount === 1 ? 'thought' : 'thoughts'}
      </Text>
    </View>
  );
}

// Empty state
function EmptyDepth() {
  return (
    <View style={styles.emptyContainer}>
      <Text style={styles.emptyIcon}>🌱</Text>
      <Text style={styles.emptyTitle}>This space is quiet.</Text>
      <Text style={styles.emptySubtitle}>
        Be the first to plant a thought here.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: COLORS.background,
  },
  depthIndicator: {
    width: 40,
    paddingVertical: SPACING.lg,
    alignItems: 'center',
    backgroundColor: COLORS.backgroundSecondary,
  },
  depthTrack: {
    flex: 1,
    width: 2,
    backgroundColor: COLORS.border,
    borderRadius: 1,
    position: 'relative',
  },
  depthMarker: {
    position: 'absolute',
    left: -4,
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  depthLabels: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingVertical: SPACING.lg,
  },
  depthLabel: {
    fontSize: 16,
    opacity: 0.5,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingBottom: SPACING.xl,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  sectionHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  sectionIcon: {
    fontSize: 20,
  },
  sectionTitle: {
    fontSize: TYPOGRAPHY.fontSize.sm,
    fontWeight: '700',
    letterSpacing: 1,
  },
  sectionSubtitle: {
    fontSize: TYPOGRAPHY.fontSize.xs,
    color: COLORS.textSecondary,
  },
  sectionCount: {
    fontSize: TYPOGRAPHY.fontSize.xs,
    fontWeight: '500',
  },
  itemWrapper: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.xl * 3,
    paddingHorizontal: SPACING.lg,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: SPACING.md,
  },
  emptyTitle: {
    fontSize: TYPOGRAPHY.fontSize.lg,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: SPACING.xs,
  },
  emptySubtitle: {
    fontSize: TYPOGRAPHY.fontSize.base,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
});

export default DepthFeed;
