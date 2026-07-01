/**
 * RescueMission - Collaborative content rescue
 *
 * When content is gasping, multiple users can join forces
 * to contribute PoW and save it together.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, Modal, Pressable } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  Easing,
  FadeIn,
  FadeOut,
} from 'react-native-reanimated';
import ReactNativeHapticFeedback from 'react-native-haptic-feedback';

import { COLORS, SPACING, TYPOGRAPHY, BORDER_RADIUS } from '../../theme';
import { BreathIndicator } from './BreathIndicator';

interface Steward {
  address: string;
  breathsContributing: number;
  joinedAt: number;
}

interface RescueMissionProps {
  /** Content being rescued */
  contentId: string;
  title: string;
  authorAddress: string;
  /** Current survival probability */
  survivalProbability: number;
  /** Breaths needed to stabilize (seconds) */
  breathsNeeded: number;
  /** Breaths already contributed */
  breathsContributed: number;
  /** Other stewards currently helping */
  activeStewards: Steward[];
  /** Whether current user is participating */
  isParticipating: boolean;
  /** Callback to join rescue */
  onJoinRescue: () => void;
  /** Callback to leave/let rest */
  onLetRest: () => void;
  /** Callback when rescue succeeds */
  onRescueSuccess?: () => void;
  /** Callback when rescue fails */
  onRescueFail?: () => void;
  /** Whether visible */
  visible: boolean;
  /** Close modal */
  onClose: () => void;
}

export function RescueMission({
  contentId,
  title,
  authorAddress,
  survivalProbability,
  breathsNeeded,
  breathsContributed,
  activeStewards,
  isParticipating,
  onJoinRescue,
  onLetRest,
  onRescueSuccess,
  onRescueFail,
  visible,
  onClose,
}: RescueMissionProps) {
  const [countdown, setCountdown] = useState(60); // Rescue window in seconds
  const progress = breathsContributed / breathsNeeded;

  // Animation values
  const urgencyPulse = useSharedValue(1);
  const progressWidth = useSharedValue(progress * 100);

  // Update progress animation
  useEffect(() => {
    progressWidth.value = withTiming(progress * 100, { duration: 500 });
  }, [progress]);

  // Urgency pulse for the warning
  useEffect(() => {
    urgencyPulse.value = withRepeat(
      withSequence(
        withTiming(1.05, { duration: 500, easing: Easing.inOut(Easing.ease) }),
        withTiming(1, { duration: 500, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      false
    );
  }, []);

  // Countdown timer
  useEffect(() => {
    if (!visible) return;

    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          if (progress < 1) {
            onRescueFail?.();
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [visible, progress, onRescueFail]);

  // Check for success
  useEffect(() => {
    if (progress >= 1) {
      ReactNativeHapticFeedback.trigger('notificationSuccess');
      onRescueSuccess?.();
    }
  }, [progress, onRescueSuccess]);

  // Haptic when new steward joins
  useEffect(() => {
    if (activeStewards.length > 0) {
      ReactNativeHapticFeedback.trigger('impactMedium');
    }
  }, [activeStewards.length]);

  // Handle join
  const handleJoin = useCallback(() => {
    ReactNativeHapticFeedback.trigger('impactHeavy');
    onJoinRescue();
  }, [onJoinRescue]);

  // Handle let rest
  const handleLetRest = useCallback(() => {
    ReactNativeHapticFeedback.trigger('impactLight');
    onLetRest();
    onClose();
  }, [onLetRest, onClose]);

  // Animated styles
  const urgencyStyle = useAnimatedStyle(() => ({
    transform: [{ scale: urgencyPulse.value }],
  }));

  const progressStyle = useAnimatedStyle(() => ({
    width: `${progressWidth.value}%`,
  }));

  // Format address
  const formatAddress = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      accessibilityViewIsModal={true}
    >
      <View style={styles.overlay}>
        <Animated.View
          style={styles.container}
          entering={FadeIn.duration(300)}
          exiting={FadeOut.duration(200)}
        >
          {/* Warning header */}
          <Animated.View style={[styles.warningHeader, urgencyStyle]}>
            <Text style={styles.warningIcon}>⚠️</Text>
            <Text style={styles.warningText}>RESCUE MISSION ACTIVE</Text>
          </Animated.View>

          {/* Content preview */}
          <View style={styles.contentPreview}>
            <Text style={styles.contentTitle} numberOfLines={2}>
              "{title}"
            </Text>
            <Text style={styles.contentAuthor}>
              by @{formatAddress(authorAddress)}
            </Text>
            <View style={styles.breathIndicatorContainer}>
              <BreathIndicator survivalProbability={survivalProbability} size="sm" />
              <Text style={styles.gaspingText}>is gasping for breath!</Text>
            </View>
          </View>

          {/* Progress bar */}
          <View style={styles.progressSection}>
            <View style={styles.progressBar}>
              <Animated.View style={[styles.progressFill, progressStyle]} />
            </View>
            <View style={styles.progressLabels}>
              <Text style={styles.progressText}>
                {activeStewards.length} steward{activeStewards.length !== 1 ? 's' : ''} tending now...
              </Text>
              <Text style={styles.progressText}>
                Need {Math.max(0, Math.round(breathsNeeded - breathsContributed))} more seconds
              </Text>
            </View>
          </View>

          {/* Active stewards */}
          {activeStewards.length > 0 && (
            <View style={styles.stewardsSection}>
              {activeStewards.slice(0, 5).map((steward, index) => (
                <Animated.View
                  key={steward.address}
                  style={styles.stewardRow}
                  entering={FadeIn.delay(index * 100)}
                >
                  <Text style={styles.stewardAddress}>
                    @{formatAddress(steward.address)}
                  </Text>
                  <Text style={styles.stewardBreaths}>
                    is tending... {'●'.repeat(Math.min(steward.breathsContributing, 5))}
                  </Text>
                </Animated.View>
              ))}
              {activeStewards.length > 5 && (
                <Text style={styles.moreStewards}>
                  + {activeStewards.length - 5} more stewards
                </Text>
              )}
            </View>
          )}

          {/* Countdown */}
          <View style={styles.countdownSection}>
            <Text style={[styles.countdownText, countdown < 15 && styles.countdownUrgent]}>
              {countdown}s remaining
            </Text>
          </View>

          {/* Actions */}
          <View style={styles.actions}>
            <Pressable
              style={[styles.button, styles.joinButton, isParticipating && styles.participatingButton]}
              onPress={handleJoin}
              disabled={isParticipating}
            >
              <Text style={styles.joinButtonText}>
                {isParticipating ? 'Tending...' : 'Join Rescue'}
              </Text>
            </Pressable>

            <Pressable style={[styles.button, styles.restButton]} onPress={handleLetRest}>
              <Text style={styles.restButtonText}>Let it rest</Text>
            </Pressable>
          </View>

          {/* Philosophy note */}
          <Text style={styles.note}>
            Not all content needs saving. Choose what's worth your effort.
          </Text>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.lg,
  },
  container: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: COLORS.background,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg,
    gap: SPACING.md,
  },
  warningHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.sm,
    backgroundColor: '#7C2D12',
    borderRadius: BORDER_RADIUS.md,
  },
  warningIcon: {
    fontSize: 20,
  },
  warningText: {
    fontSize: TYPOGRAPHY.fontSize.sm,
    fontWeight: '700',
    color: '#FBBF24',
    letterSpacing: 1,
  },
  contentPreview: {
    alignItems: 'center',
    gap: SPACING.xs,
  },
  contentTitle: {
    fontSize: TYPOGRAPHY.fontSize.lg,
    fontWeight: '600',
    color: COLORS.text,
    textAlign: 'center',
  },
  contentAuthor: {
    fontSize: TYPOGRAPHY.fontSize.sm,
    color: COLORS.textSecondary,
  },
  breathIndicatorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginTop: SPACING.xs,
  },
  gaspingText: {
    fontSize: TYPOGRAPHY.fontSize.sm,
    color: '#F59E0B',
    fontWeight: '500',
  },
  progressSection: {
    gap: SPACING.xs,
  },
  progressBar: {
    height: 8,
    backgroundColor: COLORS.border,
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#14B8A6',
    borderRadius: 4,
  },
  progressLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  progressText: {
    fontSize: TYPOGRAPHY.fontSize.xs,
    color: COLORS.textSecondary,
  },
  stewardsSection: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.sm,
    gap: SPACING.xs,
  },
  stewardRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  stewardAddress: {
    fontSize: TYPOGRAPHY.fontSize.sm,
    color: COLORS.text,
  },
  stewardBreaths: {
    fontSize: TYPOGRAPHY.fontSize.sm,
    color: '#14B8A6',
  },
  moreStewards: {
    fontSize: TYPOGRAPHY.fontSize.xs,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginTop: SPACING.xs,
  },
  countdownSection: {
    alignItems: 'center',
  },
  countdownText: {
    fontSize: TYPOGRAPHY.fontSize.lg,
    fontWeight: '700',
    color: COLORS.text,
  },
  countdownUrgent: {
    color: '#EF4444',
  },
  actions: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  button: {
    flex: 1,
    paddingVertical: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    alignItems: 'center',
  },
  joinButton: {
    backgroundColor: '#14B8A6',
  },
  participatingButton: {
    backgroundColor: '#0D9488',
  },
  joinButtonText: {
    fontSize: TYPOGRAPHY.fontSize.base,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  restButton: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  restButtonText: {
    fontSize: TYPOGRAPHY.fontSize.base,
    fontWeight: '500',
    color: COLORS.textSecondary,
  },
  note: {
    fontSize: TYPOGRAPHY.fontSize.xs,
    color: COLORS.textTertiary,
    textAlign: 'center',
    fontStyle: 'italic',
  },
});

export default RescueMission;
