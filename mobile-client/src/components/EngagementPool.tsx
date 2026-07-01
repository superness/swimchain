/**
 * EngagementPool - Displays and manages engagement pool
 * Per SPEC_09: 60s total engagement, contributor attribution
 */

import React, { memo, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated';

import { Button } from './Button';
import { HeatBar } from './HeatBar';
import { MiningProgress as MiningProgressType } from '../native/NativeArgon2';
import { COLORS, SPACING, BORDER_RADIUS, TYPOGRAPHY, TOUCH_TARGET_MIN, ANIMATION } from '../theme';
import { ENGAGEMENT_POOL, DIFFICULTY, BATTERY_ESTIMATES } from '../constants/protocol';

export interface ContributionOption {
  seconds: 5 | 15 | 30;
  label: string;
  subLabel: string;
}

// Button labels with battery estimates per CLIENT_DESIGN.md
const CONTRIBUTION_OPTIONS: ContributionOption[] = [
  { seconds: 5, label: '+5s', subLabel: '~5s PoW, <1% battery' },
  { seconds: 15, label: '+15s', subLabel: '~15s PoW, ~2% battery' },
  { seconds: 30, label: '+30s', subLabel: '~30s PoW, ~5% battery' },
];

export interface Contributor {
  address: string;
  seconds: number;
}

export interface EngagementPoolProps {
  poolId: string;
  currentSeconds: number;
  requiredSeconds?: number;
  contributors: Contributor[];
  onContribute: (seconds: 5 | 15 | 30) => void;
  isContributing: boolean;
  contributionProgress?: MiningProgressType | null;
  lastEngagement?: number;
}

function EngagementPoolComponent({
  poolId,
  currentSeconds,
  requiredSeconds = ENGAGEMENT_POOL.requiredSeconds,
  contributors,
  onContribute,
  isContributing,
  contributionProgress,
  lastEngagement,
}: EngagementPoolProps) {
  // Calculate fill percentage
  const fillPercentage = useMemo(
    () => Math.min(100, (currentSeconds / requiredSeconds) * 100),
    [currentSeconds, requiredSeconds]
  );

  // Format contributor attribution
  const attribution = useMemo(() => {
    if (contributors.length === 0) return null;

    const firstContributor = contributors[0];
    const truncated = `${firstContributor.address.slice(0, 8)}...${firstContributor.address.slice(-4)}`;

    if (contributors.length === 1) {
      return `Kept alive by ${truncated}`;
    }

    const othersCount = contributors.length - 1;
    return `Kept alive by ${truncated} and ${othersCount} other${othersCount > 1 ? 's' : ''}`;
  }, [contributors]);

  // Animate fill
  const fillWidth = useSharedValue(fillPercentage);

  React.useEffect(() => {
    fillWidth.value = withTiming(fillPercentage, { duration: ANIMATION.normal });
  }, [fillPercentage, fillWidth]);

  const animatedFillStyle = useAnimatedStyle(() => ({
    width: `${fillWidth.value}%`,
  }));

  // Handle contribution button press
  const handleContribute = useCallback(
    (seconds: 5 | 15 | 30) => {
      if (!isContributing) {
        onContribute(seconds);
      }
    },
    [isContributing, onContribute]
  );

  // Check if pool is full
  const isFull = currentSeconds >= requiredSeconds;

  return (
    <View style={styles.container}>
      {/* Pool Progress */}
      <View style={styles.progressSection}>
        <View style={styles.progressHeader}>
          <Text style={styles.label}>Engagement Pool</Text>
          <Text style={styles.poolStatus}>
            {currentSeconds}s / {requiredSeconds}s
          </Text>
        </View>

        <View style={styles.progressBar}>
          <Animated.View
            style={[
              styles.progressFill,
              isFull ? styles.progressFillFull : styles.progressFillPartial,
              animatedFillStyle,
            ]}
          />
        </View>

        {/* Attribution */}
        {attribution && (
          <Text style={styles.attribution}>{attribution}</Text>
        )}
      </View>

      {/* Contribution Buttons */}
      {!isFull && (
        <View style={styles.buttonSection}>
          <Text style={styles.contributeLabel}>Contribute engagement:</Text>
          <View style={styles.buttonRow}>
            {CONTRIBUTION_OPTIONS.map((option) => (
              <View key={option.seconds} style={styles.buttonWrapper}>
                <Button
                  title={option.label}
                  variant={isContributing ? 'secondary' : 'outline'}
                  size="sm"
                  disabled={isContributing}
                  loading={isContributing}
                  onPress={() => handleContribute(option.seconds)}
                  style={styles.contributeButton}
                />
                <Text style={styles.buttonSubLabel}>{option.subLabel}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Mining Progress */}
      {isContributing && contributionProgress && (
        <View style={styles.miningSection}>
          <Text style={styles.miningLabel}>Mining...</Text>
          <Text style={styles.miningStats}>
            {Math.round(contributionProgress.hashesPerSecond * 10) / 10} H/s
            {contributionProgress.estimatedRemainingMs > 0 &&
              ` · ~${Math.ceil(contributionProgress.estimatedRemainingMs / 1000)}s remaining`}
          </Text>
        </View>
      )}

      {/* Pool Full Message */}
      {isFull && (
        <View style={styles.fullMessage}>
          <Text style={styles.fullText}>Pool is full!</Text>
          <Text style={styles.fullSubtext}>
            This content has enough engagement to stay visible
          </Text>
        </View>
      )}
    </View>
  );
}

export const EngagementPool = memo(EngagementPoolComponent);

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    gap: SPACING.md,
  },
  progressSection: {
    gap: SPACING.xs,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  label: {
    fontSize: TYPOGRAPHY.fontSize.sm,
    fontWeight: TYPOGRAPHY.fontWeight.semibold,
    color: COLORS.text,
  },
  poolStatus: {
    fontSize: TYPOGRAPHY.fontSize.sm,
    color: COLORS.textSecondary,
  },
  progressBar: {
    height: 8,
    backgroundColor: COLORS.borderLight,
    borderRadius: BORDER_RADIUS.full,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: BORDER_RADIUS.full,
  },
  progressFillPartial: {
    backgroundColor: COLORS.heat.warm,
  },
  progressFillFull: {
    backgroundColor: COLORS.success,
  },
  attribution: {
    fontSize: TYPOGRAPHY.fontSize.xs,
    color: COLORS.textTertiary,
    fontStyle: 'italic',
  },
  buttonSection: {
    gap: SPACING.sm,
  },
  contributeLabel: {
    fontSize: TYPOGRAPHY.fontSize.sm,
    color: COLORS.textSecondary,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  buttonWrapper: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  contributeButton: {
    width: '100%',
  },
  buttonSubLabel: {
    fontSize: TYPOGRAPHY.fontSize.xs,
    color: COLORS.textTertiary,
    textAlign: 'center',
  },
  miningSection: {
    backgroundColor: COLORS.mining.background,
    borderRadius: BORDER_RADIUS.sm,
    padding: SPACING.sm,
    alignItems: 'center',
  },
  miningLabel: {
    fontSize: TYPOGRAPHY.fontSize.sm,
    fontWeight: TYPOGRAPHY.fontWeight.semibold,
    color: COLORS.mining.text,
  },
  miningStats: {
    fontSize: TYPOGRAPHY.fontSize.xs,
    color: COLORS.mining.text,
    opacity: 0.8,
  },
  fullMessage: {
    alignItems: 'center',
    paddingVertical: SPACING.sm,
  },
  fullText: {
    fontSize: TYPOGRAPHY.fontSize.base,
    fontWeight: TYPOGRAPHY.fontWeight.semibold,
    color: COLORS.success,
  },
  fullSubtext: {
    fontSize: TYPOGRAPHY.fontSize.sm,
    color: COLORS.textSecondary,
  },
});

export default EngagementPool;
