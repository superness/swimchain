/**
 * ContextMenu - Accessibility alternative to swipe gestures
 * Long press reveals context menu with all actions
 */

import React from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TouchPressable } from './TouchPressable';
import { COLORS, SPACING, BORDER_RADIUS, TYPOGRAPHY, TOUCH_TARGET_MIN, SHADOWS } from '../theme';

export interface ContextMenuItem {
  id: string;
  label: string;
  icon?: string;
  destructive?: boolean;
  onPress: () => void;
}

export interface ContextMenuProps {
  visible: boolean;
  items: ContextMenuItem[];
  onClose: () => void;
  title?: string;
}

export function ContextMenu({ visible, items, onClose, title }: ContextMenuProps) {
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <TouchableOpacity
        style={styles.overlay}
        activeOpacity={1}
        onPress={onClose}
      >
        <View
          style={[
            styles.container,
            { marginBottom: insets.bottom + SPACING.md },
          ]}
        >
          {title && <Text style={styles.title}>{title}</Text>}

          {items.map((item, index) => (
            <TouchPressable
              key={item.id}
              style={[
                styles.item,
                index === items.length - 1 && styles.itemLast,
              ]}
              onPress={() => {
                onClose();
                item.onPress();
              }}
              haptic="selection"
            >
              {item.icon && <Text style={styles.icon}>{item.icon}</Text>}
              <Text
                style={[
                  styles.label,
                  item.destructive && styles.labelDestructive,
                ]}
              >
                {item.label}
              </Text>
            </TouchPressable>
          ))}

          <TouchPressable
            style={styles.cancelButton}
            onPress={onClose}
            haptic="light"
          >
            <Text style={styles.cancelLabel}>Cancel</Text>
          </TouchPressable>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'flex-end',
    padding: SPACING.md,
  },
  container: {
    backgroundColor: COLORS.surfaceElevated,
    borderRadius: BORDER_RADIUS.lg,
    overflow: 'hidden',
    ...SHADOWS.lg,
  },
  title: {
    fontSize: TYPOGRAPHY.fontSize.sm,
    color: COLORS.textSecondary,
    textAlign: 'center',
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: TOUCH_TARGET_MIN,
    paddingHorizontal: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
    gap: SPACING.sm,
  },
  itemLast: {
    borderBottomWidth: 0,
  },
  icon: {
    fontSize: 20,
    width: 28,
    textAlign: 'center',
  },
  label: {
    fontSize: TYPOGRAPHY.fontSize.md,
    color: COLORS.text,
    flex: 1,
  },
  labelDestructive: {
    color: COLORS.error,
  },
  cancelButton: {
    minHeight: TOUCH_TARGET_MIN,
    marginTop: SPACING.sm,
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelLabel: {
    fontSize: TYPOGRAPHY.fontSize.md,
    fontWeight: TYPOGRAPHY.fontWeight.semibold,
    color: COLORS.primary,
  },
});

export default ContextMenu;
