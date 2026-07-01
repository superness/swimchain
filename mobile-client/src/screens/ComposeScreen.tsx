/**
 * ComposeScreen - Create new post or reply with PoW
 * Per Step 8: Mining progress with tips and cancel
 */

import React, { useState, useCallback } from 'react';
import { View, Text, TextInput, StyleSheet, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';

import { Button } from '../components/Button';
import { MiningProgress } from '../components/MiningProgress';
import { useMobilePow } from '../hooks/useMobilePow';
import { useKeypair } from '../hooks/useKeypair';
import { getRpcClient } from '../services/SwimchainRpc';
import { COLORS, SPACING, BORDER_RADIUS, TYPOGRAPHY, TOUCH_TARGET_MIN } from '../theme';
import { CONTENT_LIMITS, DIFFICULTY } from '../constants/protocol';
import type { RootStackScreenProps } from '../navigation/types';

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}

type Props = RootStackScreenProps<'Compose'>;

export default function ComposeScreen() {
  const navigation = useNavigation<Props['navigation']>();
  const route = useRoute<Props['route']>();
  const { spaceId, replyTo } = route.params ?? {};

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [isMining, setIsMining] = useState(false);

  const {
    state: powState,
    progress,
    mine,
    cancel,
    estimateDuration,
    estimateBattery,
    isNativeAvailable,
  } = useMobilePow();

  const { keypair, publicKeyHex, address, isReady: keypairReady } = useKeypair();
  const rpc = getRpcClient();

  const isReply = !!replyTo;
  const difficulty = isReply ? DIFFICULTY.reply : DIFFICULTY.post;
  const estimatedMs = estimateDuration(difficulty);
  const estimatedBatteryUsage = estimateBattery(estimatedMs);

  const canSubmit =
    (isReply ? body.trim().length > 0 : title.trim().length > 0 && body.trim().length > 0) &&
    !isMining &&
    keypairReady;

  const handleSubmit = useCallback(async () => {
    if (!canSubmit || !keypair || !publicKeyHex || !address) {
      Alert.alert('Error', 'Identity not ready. Please set up your identity first.');
      return;
    }

    setIsMining(true);

    try {
      // 1. Get challenge from network
      const actionType = isReply ? 'reply' : 'post';
      const challengeResult = await rpc.getChallenge(actionType);

      // 2. Decode challenge and mine PoW
      const challengeBytes = hexToBytes(challengeResult.challenge);

      let powSolution;
      if (isNativeAvailable) {
        try {
          powSolution = await mine(challengeBytes, challengeResult.difficulty);
        } catch (error) {
          if ((error as Error).message?.includes('cancelled')) {
            return;
          }
          throw error;
        }
      } else {
        // Fallback not supported for real posts
        throw new Error('Native PoW module required for posting');
      }

      // 3. Sign the content
      const timestamp = Math.floor(Date.now() / 1000);
      const contentStr = isReply
        ? `reply:${replyTo}:${body}:${timestamp}`
        : `post:${spaceId}:${title}:${body}:${timestamp}`;
      const contentBytes = new TextEncoder().encode(contentStr);
      const signature = keypair.sign(contentBytes);
      const signatureHex = bytesToHex(signature);

      // 4. Submit to network
      if (isReply && replyTo) {
        await rpc.submitReply({
          parentId: replyTo,
          body,
          authorId: address,
          powNonce: parseInt(powSolution.nonce, 10),
          powHash: powSolution.hash,
          signature: signatureHex,
          timestamp,
        });
      } else if (spaceId) {
        await rpc.submitPost({
          spaceId,
          title,
          body,
          authorId: address,
          powNonce: parseInt(powSolution.nonce, 10),
          powHash: powSolution.hash,
          signature: signatureHex,
          timestamp,
        });
      } else {
        throw new Error('Missing spaceId for post');
      }

      // Success!
      Alert.alert(
        'Posted!',
        isReply ? 'Your reply has been submitted.' : 'Your post has been submitted.',
        [{ text: 'OK', onPress: () => navigation.goBack() }]
      );
    } catch (error) {
      console.error('Submit error:', error);
      Alert.alert('Error', `Failed to submit: ${(error as Error).message}`);
    } finally {
      setIsMining(false);
    }
  }, [canSubmit, keypair, publicKeyHex, address, isReply, replyTo, spaceId, title, body, isNativeAvailable, mine, rpc, navigation]);

  const handleCancel = useCallback(() => {
    if (isMining) {
      cancel();
      setIsMining(false);
    }
  }, [isMining, cancel]);

  const handleContinueBrowsing = useCallback(() => {
    // Navigate back while mining continues in background
    // TODO: Implement background mining with notifications
    navigation.goBack();
  }, [navigation]);

  // Show mining progress overlay
  if (isMining && powState === 'mining') {
    return (
      <MiningProgress
        progress={progress}
        estimatedDuration={estimatedMs}
        estimatedBattery={estimatedBatteryUsage}
        onCancel={handleCancel}
        onContinueBrowsing={handleContinueBrowsing}
        isActive={true}
      />
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.content}>
        {/* Space indicator */}
        {spaceId && (
          <View style={styles.spaceIndicator}>
            <Text style={styles.spaceText}>Posting to s/{spaceId}</Text>
          </View>
        )}

        {/* Title (for new posts only) */}
        {!isReply && (
          <TextInput
            style={styles.titleInput}
            placeholder="Title"
            placeholderTextColor={COLORS.textTertiary}
            value={title}
            onChangeText={setTitle}
            maxLength={CONTENT_LIMITS.titleMaxLength}
            returnKeyType="next"
          />
        )}

        {/* Body */}
        <TextInput
          style={styles.bodyInput}
          placeholder={isReply ? 'Write your reply...' : 'Write your post...'}
          placeholderTextColor={COLORS.textTertiary}
          value={body}
          onChangeText={setBody}
          maxLength={CONTENT_LIMITS.bodyMaxLength}
          multiline
          textAlignVertical="top"
        />

        {/* Character count */}
        <Text style={styles.charCount}>
          {body.length} / {CONTENT_LIMITS.bodyMaxLength}
        </Text>

        {/* Mining estimate */}
        <View style={styles.estimate}>
          <Text style={styles.estimateLabel}>Estimated mining time:</Text>
          <Text style={styles.estimateValue}>
            ~{Math.ceil(estimatedMs / 1000)}s ({estimatedBatteryUsage.toFixed(1)}% battery)
          </Text>
        </View>

        {/* Submit button */}
        <Button
          title={isReply ? 'Submit Reply' : 'Submit Post'}
          variant="primary"
          disabled={!canSubmit}
          loading={isMining}
          onPress={handleSubmit}
          style={styles.submitButton}
        />

        {!isNativeAvailable && (
          <Text style={styles.warning}>
            Native PoW module not available. Using fallback (slower).
          </Text>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    flex: 1,
    padding: SPACING.md,
    gap: SPACING.md,
  },
  spaceIndicator: {
    backgroundColor: COLORS.surface,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderRadius: BORDER_RADIUS.sm,
    alignSelf: 'flex-start',
  },
  spaceText: {
    fontSize: TYPOGRAPHY.fontSize.sm,
    color: COLORS.textSecondary,
  },
  titleInput: {
    height: TOUCH_TARGET_MIN,
    fontSize: TYPOGRAPHY.fontSize.lg,
    fontWeight: TYPOGRAPHY.fontWeight.semibold,
    color: COLORS.text,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  bodyInput: {
    flex: 1,
    fontSize: TYPOGRAPHY.fontSize.base,
    color: COLORS.text,
    lineHeight: TYPOGRAPHY.fontSize.base * TYPOGRAPHY.lineHeight.relaxed,
    minHeight: 150,
  },
  charCount: {
    fontSize: TYPOGRAPHY.fontSize.xs,
    color: COLORS.textTertiary,
    textAlign: 'right',
  },
  estimate: {
    backgroundColor: COLORS.surface,
    padding: SPACING.sm,
    borderRadius: BORDER_RADIUS.sm,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  estimateLabel: {
    fontSize: TYPOGRAPHY.fontSize.sm,
    color: COLORS.textSecondary,
  },
  estimateValue: {
    fontSize: TYPOGRAPHY.fontSize.sm,
    fontWeight: TYPOGRAPHY.fontWeight.medium,
    color: COLORS.text,
  },
  submitButton: {
    minHeight: TOUCH_TARGET_MIN,
  },
  warning: {
    fontSize: TYPOGRAPHY.fontSize.xs,
    color: COLORS.warning,
    textAlign: 'center',
  },
});
