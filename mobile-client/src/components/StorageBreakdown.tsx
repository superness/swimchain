/**
 * StorageBreakdown - Visual breakdown of storage usage
 * Per Step 13: Pie chart showing storage categories
 */

import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import Svg, { Circle, G, Text as SvgText } from 'react-native-svg';

import { COLORS, SPACING, TYPOGRAPHY, BORDER_RADIUS } from '../theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CHART_SIZE = Math.min(200, SCREEN_WIDTH * 0.5);
const STROKE_WIDTH = 30;
const RADIUS = (CHART_SIZE - STROKE_WIDTH) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export interface StorageCategory {
  id: string;
  label: string;
  bytes: number;
  color: string;
  canClear: boolean;
}

export interface StorageBreakdownProps {
  categories: StorageCategory[];
  totalBytes: number;
  limitBytes: number;
  onClear?: (categoryId: string) => void;
}

export function StorageBreakdown({
  categories,
  totalBytes,
  limitBytes,
}: StorageBreakdownProps) {
  // Calculate percentages
  const categoryData = useMemo(() => {
    let startAngle = 0;
    return categories.map((cat) => {
      const percentage = (cat.bytes / totalBytes) * 100;
      const dashArray = (percentage / 100) * CIRCUMFERENCE;
      const dashOffset = -startAngle * (CIRCUMFERENCE / 360);
      startAngle += (percentage / 100) * 360;
      return {
        ...cat,
        percentage,
        dashArray,
        dashOffset,
      };
    });
  }, [categories, totalBytes]);

  const usagePercentage = (totalBytes / limitBytes) * 100;

  return (
    <View style={styles.container}>
      {/* Pie Chart */}
      <View style={styles.chartContainer}>
        <Svg width={CHART_SIZE} height={CHART_SIZE}>
          <G rotation={-90} origin={`${CHART_SIZE / 2}, ${CHART_SIZE / 2}`}>
            {categoryData.map((cat, index) => (
              <Circle
                key={cat.id}
                cx={CHART_SIZE / 2}
                cy={CHART_SIZE / 2}
                r={RADIUS}
                stroke={cat.color}
                strokeWidth={STROKE_WIDTH}
                fill="none"
                strokeDasharray={`${cat.dashArray} ${CIRCUMFERENCE}`}
                strokeDashoffset={cat.dashOffset}
              />
            ))}
          </G>
        </Svg>

        {/* Center text */}
        <View style={styles.centerContent}>
          <Text style={styles.centerValue}>
            {formatBytes(totalBytes)}
          </Text>
          <Text style={styles.centerLabel}>
            of {formatBytes(limitBytes)}
          </Text>
        </View>
      </View>

      {/* Usage Bar */}
      <View style={styles.usageContainer}>
        <View style={styles.usageHeader}>
          <Text style={styles.usageLabel}>Storage Used</Text>
          <Text
            style={[
              styles.usageValue,
              usagePercentage >= 85 && styles.usageWarning,
            ]}
          >
            {usagePercentage.toFixed(1)}%
          </Text>
        </View>
        <View style={styles.usageBar}>
          <View
            style={[
              styles.usageFill,
              {
                width: `${Math.min(100, usagePercentage)}%`,
                backgroundColor:
                  usagePercentage >= 85 ? COLORS.warning : COLORS.primary,
              },
            ]}
          />
        </View>
      </View>

      {/* Legend */}
      <View style={styles.legend}>
        {categoryData.map((cat) => (
          <View key={cat.id} style={styles.legendItem}>
            <View
              style={[styles.legendColor, { backgroundColor: cat.color }]}
            />
            <View style={styles.legendText}>
              <Text style={styles.legendLabel}>{cat.label}</Text>
              <Text style={styles.legendValue}>
                {formatBytes(cat.bytes)} ({cat.percentage.toFixed(1)}%)
              </Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

const styles = StyleSheet.create({
  container: {
    gap: SPACING.lg,
  },
  chartContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  centerContent: {
    position: 'absolute',
    alignItems: 'center',
  },
  centerValue: {
    fontSize: TYPOGRAPHY.fontSize.lg,
    fontWeight: TYPOGRAPHY.fontWeight.bold,
    color: COLORS.text,
  },
  centerLabel: {
    fontSize: TYPOGRAPHY.fontSize.sm,
    color: COLORS.textSecondary,
  },
  usageContainer: {
    gap: SPACING.xs,
  },
  usageHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  usageLabel: {
    fontSize: TYPOGRAPHY.fontSize.sm,
    color: COLORS.textSecondary,
  },
  usageValue: {
    fontSize: TYPOGRAPHY.fontSize.sm,
    fontWeight: TYPOGRAPHY.fontWeight.medium,
    color: COLORS.text,
  },
  usageWarning: {
    color: COLORS.warning,
  },
  usageBar: {
    height: 8,
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.full,
    overflow: 'hidden',
  },
  usageFill: {
    height: '100%',
    borderRadius: BORDER_RADIUS.full,
  },
  legend: {
    gap: SPACING.sm,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  legendColor: {
    width: 16,
    height: 16,
    borderRadius: 4,
  },
  legendText: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  legendLabel: {
    fontSize: TYPOGRAPHY.fontSize.sm,
    color: COLORS.text,
  },
  legendValue: {
    fontSize: TYPOGRAPHY.fontSize.sm,
    color: COLORS.textSecondary,
  },
});

export default StorageBreakdown;
