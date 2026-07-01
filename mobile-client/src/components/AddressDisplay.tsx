/**
 * AddressDisplay - Displays Swimchain addresses
 * Per Step 14: Multiple display formats
 */

import React, { useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, Clipboard } from 'react-native';
import ReactNativeHapticFeedback from 'react-native-haptic-feedback';

import { TouchPressable } from './TouchPressable';
import { COLORS, SPACING, BORDER_RADIUS, TYPOGRAPHY } from '../theme';
import { ADDRESS } from '../constants/protocol';

export type AddressFormat = 'full' | 'truncated' | 'minimal';

export interface AddressDisplayProps {
  /** Swimchain address */
  address: string;
  /** Display format */
  format?: AddressFormat;
  /** Show copy button */
  copyable?: boolean;
  /** Callback after copy */
  onCopy?: () => void;
  /** Custom label */
  label?: string;
}

/**
 * Format address based on display format
 */
function formatAddress(address: string, format: AddressFormat): string {
  switch (format) {
    case 'full':
      return address;
    case 'truncated':
      // cs1q9x7...2k4m (14 chars)
      return `${address.slice(0, 8)}...${address.slice(-4)}`;
    case 'minimal':
      // ...2k4m (7 chars)
      return `...${address.slice(-4)}`;
  }
}

export function AddressDisplay({
  address,
  format = 'truncated',
  copyable = true,
  onCopy,
  label,
}: AddressDisplayProps) {
  const displayAddress = useMemo(
    () => formatAddress(address, format),
    [address, format]
  );

  const handleCopy = useCallback(() => {
    Clipboard.setString(address);
    ReactNativeHapticFeedback.trigger('notificationSuccess', {
      enableVibrateFallback: true,
      ignoreAndroidSystemSettings: false,
    });
    onCopy?.();
  }, [address, onCopy]);

  const content = (
    <View style={styles.container}>
      {label && <Text style={styles.label}>{label}</Text>}
      <View style={styles.addressRow}>
        <Text
          style={[
            styles.address,
            format === 'full' && styles.addressFull,
          ]}
          selectable={!copyable}
        >
          {displayAddress}
        </Text>
        {copyable && (
          <Text style={styles.copyIcon}>📋</Text>
        )}
      </View>
    </View>
  );

  if (copyable) {
    return (
      <TouchPressable
        style={styles.touchable}
        onPress={handleCopy}
        haptic="none" // We handle haptics ourselves
        accessibilityLabel={`Copy address ${displayAddress}`}
        accessibilityHint="Double tap to copy full address"
      >
        {content}
      </TouchPressable>
    );
  }

  return content;
}

const styles = StyleSheet.create({
  touchable: {
    minHeight: 36,
  },
  container: {
    gap: 2,
  },
  label: {
    fontSize: TYPOGRAPHY.fontSize.xs,
    color: COLORS.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    backgroundColor: COLORS.surface,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderRadius: BORDER_RADIUS.sm,
  },
  address: {
    fontSize: TYPOGRAPHY.fontSize.sm,
    fontFamily: 'monospace',
    color: COLORS.text,
  },
  addressFull: {
    fontSize: TYPOGRAPHY.fontSize.xs,
  },
  copyIcon: {
    fontSize: 14,
  },
});

export default AddressDisplay;
