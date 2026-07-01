/**
 * StewardshipProfile - User's garden and tending stats
 *
 * Replaces traditional follower/karma metrics with
 * stewardship-focused statistics.
 */

import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import Animated, {
  FadeInDown,
} from 'react-native-reanimated';

import { COLORS, SPACING, TYPOGRAPHY, BORDER_RADIUS } from '../../theme';
import { BreathIndicator } from './BreathIndicator';

// Garden item represents content the user has created
interface GardenItem {
  id: string;
  title: string;
  createdAt: number;
  survivalProbability: number;
  depth: 'surface' | 'shallows' | 'deep' | 'archive' | 'returned';
}

// Tending stats
interface TendingStats {
  breathsGiven: number;
  rescuesJoined: number;
  rescuesSucceeded: number;
  uniquePostsTended: number;
}

// Space affinity
interface SpaceAffinity {
  spaceId: string;
  breathsGiven: number;
  strength: number; // 0-1
}

interface StewardshipProfileProps {
  address: string;
  joinedAt: number;
  garden: GardenItem[];
  stats: TendingStats;
  topSpaces: SpaceAffinity[];
}

// Count garden items by depth
function countByDepth(garden: GardenItem[]): Record<string, number> {
  return garden.reduce((acc, item) => {
    acc[item.depth] = (acc[item.depth] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
}

export function StewardshipProfile({
  address,
  joinedAt,
  garden,
  stats,
  topSpaces,
}: StewardshipProfileProps) {
  const gardenCounts = useMemo(() => countByDepth(garden), [garden]);
  const joinedDate = useMemo(() => {
    const date = new Date(joinedAt);
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }, [joinedAt]);

  // Format address
  const formatAddress = (addr: string) => `@${addr.slice(0, 8)}...${addr.slice(-6)}`;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Header */}
      <Animated.View style={styles.header} entering={FadeInDown.delay(0)}>
        <Text style={styles.address}>{formatAddress(address)}</Text>
        <Text style={styles.joinedText}>Steward since {joinedDate}</Text>
      </Animated.View>

      {/* Garden Section */}
      <Animated.View style={styles.section} entering={FadeInDown.delay(100)}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Your Garden</Text>
        </View>
        <View style={styles.gardenGrid}>
          <GardenStat
            icon="🏛️"
            count={gardenCounts.archive || 0}
            label="reached Archive"
            color="#FBBF24"
          />
          <GardenStat
            icon="🦑"
            count={gardenCounts.deep || 0}
            label="in The Deep"
            color="#A78BFA"
          />
          <GardenStat
            icon="🐚"
            count={gardenCounts.shallows || 0}
            label="in Shallows"
            color="#34D399"
          />
          <GardenStat
            icon="🌊"
            count={gardenCounts.surface || 0}
            label="at Surface"
            color="#60A5FA"
          />
          <GardenStat
            icon="🍂"
            count={gardenCounts.returned || 0}
            label="returned to earth"
            color="#9CA3AF"
          />
        </View>
      </Animated.View>

      {/* Live Garden Preview */}
      {garden.filter(g => g.depth !== 'returned').length > 0 && (
        <Animated.View style={styles.section} entering={FadeInDown.delay(200)}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Living Thoughts</Text>
          </View>
          <View style={styles.livingGarden}>
            {garden
              .filter(g => g.depth !== 'returned')
              .slice(0, 5)
              .map((item, index) => (
                <View key={item.id} style={styles.livingItem}>
                  <BreathIndicator survivalProbability={item.survivalProbability} size="sm" showWave={false} />
                  <Text style={styles.livingTitle} numberOfLines={1}>
                    {item.title}
                  </Text>
                </View>
              ))}
          </View>
        </Animated.View>
      )}

      {/* Tending Stats */}
      <Animated.View style={styles.section} entering={FadeInDown.delay(300)}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Tending Stats</Text>
        </View>
        <View style={styles.statsGrid}>
          <StatBox
            value={stats.breathsGiven.toLocaleString()}
            label="Breaths given"
            icon="💨"
          />
          <StatBox
            value={stats.rescuesJoined.toString()}
            label="Rescues joined"
            icon="🚨"
          />
          <StatBox
            value={stats.rescuesSucceeded.toString()}
            label="Rescues succeeded"
            icon="✨"
          />
          <StatBox
            value={stats.uniquePostsTended.toString()}
            label="Unique posts tended"
            icon="🌿"
          />
        </View>
      </Animated.View>

      {/* Space Affinity */}
      {topSpaces.length > 0 && (
        <Animated.View style={styles.section} entering={FadeInDown.delay(400)}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Spaces You Tend</Text>
          </View>
          <View style={styles.spacesContainer}>
            {topSpaces.map((space) => (
              <SpaceAffinityBar
                key={space.spaceId}
                spaceId={space.spaceId}
                strength={space.strength}
                breathsGiven={space.breathsGiven}
              />
            ))}
          </View>
        </Animated.View>
      )}

      {/* Philosophy footer */}
      <Animated.View style={styles.footer} entering={FadeInDown.delay(500)}>
        <Text style={styles.footerText}>
          You are what you tend to.
        </Text>
      </Animated.View>
    </ScrollView>
  );
}

// Garden stat component
interface GardenStatProps {
  icon: string;
  count: number;
  label: string;
  color: string;
}

function GardenStat({ icon, count, label, color }: GardenStatProps) {
  return (
    <View style={styles.gardenStat}>
      <Text style={styles.gardenIcon}>{icon}</Text>
      <Text style={[styles.gardenCount, { color }]}>{count}</Text>
      <Text style={styles.gardenLabel}>{label}</Text>
    </View>
  );
}

// Stat box component
interface StatBoxProps {
  value: string;
  label: string;
  icon: string;
}

function StatBox({ value, label, icon }: StatBoxProps) {
  return (
    <View style={styles.statBox}>
      <Text style={styles.statIcon}>{icon}</Text>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

// Space affinity bar
interface SpaceAffinityBarProps {
  spaceId: string;
  strength: number;
  breathsGiven: number;
}

function SpaceAffinityBar({ spaceId, strength, breathsGiven }: SpaceAffinityBarProps) {
  const dots = Math.round(strength * 5);

  return (
    <View style={styles.spaceRow}>
      <Text style={styles.spaceName}>s/{spaceId}</Text>
      <View style={styles.spaceStrength}>
        {[0, 1, 2, 3, 4].map((i) => (
          <View
            key={i}
            style={[
              styles.strengthDot,
              i < dots && styles.strengthDotActive,
            ]}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    padding: SPACING.md,
    gap: SPACING.lg,
  },
  header: {
    alignItems: 'center',
    paddingVertical: SPACING.lg,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  address: {
    fontSize: TYPOGRAPHY.fontSize.xl,
    fontWeight: '700',
    color: COLORS.text,
  },
  joinedText: {
    fontSize: TYPOGRAPHY.fontSize.sm,
    color: COLORS.textSecondary,
    marginTop: SPACING.xs,
  },
  section: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.lg,
    overflow: 'hidden',
  },
  sectionHeader: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  sectionTitle: {
    fontSize: TYPOGRAPHY.fontSize.sm,
    fontWeight: '600',
    color: COLORS.text,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  gardenGrid: {
    padding: SPACING.md,
    gap: SPACING.sm,
  },
  gardenStat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  gardenIcon: {
    fontSize: 20,
    width: 28,
  },
  gardenCount: {
    fontSize: TYPOGRAPHY.fontSize.lg,
    fontWeight: '700',
    minWidth: 30,
  },
  gardenLabel: {
    fontSize: TYPOGRAPHY.fontSize.sm,
    color: COLORS.textSecondary,
  },
  livingGarden: {
    padding: SPACING.md,
    gap: SPACING.sm,
  },
  livingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  livingTitle: {
    flex: 1,
    fontSize: TYPOGRAPHY.fontSize.sm,
    color: COLORS.text,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: SPACING.sm,
  },
  statBox: {
    width: '50%',
    padding: SPACING.sm,
    alignItems: 'center',
  },
  statIcon: {
    fontSize: 24,
    marginBottom: SPACING.xs,
  },
  statValue: {
    fontSize: TYPOGRAPHY.fontSize.xl,
    fontWeight: '700',
    color: COLORS.text,
  },
  statLabel: {
    fontSize: TYPOGRAPHY.fontSize.xs,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
  spacesContainer: {
    padding: SPACING.md,
    gap: SPACING.sm,
  },
  spaceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  spaceName: {
    fontSize: TYPOGRAPHY.fontSize.sm,
    color: COLORS.text,
    fontWeight: '500',
  },
  spaceStrength: {
    flexDirection: 'row',
    gap: 4,
  },
  strengthDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.border,
  },
  strengthDotActive: {
    backgroundColor: '#14B8A6',
  },
  footer: {
    alignItems: 'center',
    paddingVertical: SPACING.lg,
  },
  footerText: {
    fontSize: TYPOGRAPHY.fontSize.sm,
    color: COLORS.textTertiary,
    fontStyle: 'italic',
  },
});

export default StewardshipProfile;
