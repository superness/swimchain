/**
 * Swimchain Mobile Theme Constants
 * Per CLIENT_DESIGN.md §6.1: 44pt minimum touch targets
 */

export const TOUCH_TARGET_MIN = 44; // points - minimum touch target size

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
} as const;

export const COLORS = {
  // Primary brand color
  primary: '#0066CC',
  primaryLight: '#3399FF',
  primaryDark: '#004C99',

  // Heat decay colors (per SPEC_09)
  heat: {
    full: '#FF4500',     // OrangeRed - full heat (0-20% decay)
    warm: '#FF8C00',     // DarkOrange - warm (20-40% decay)
    cooling: '#FFD700',  // Gold - cooling (40-60% decay)
    fading: '#808080',   // Gray - fading (60-80% decay)
    decayed: '#404040',  // DarkGray - nearly decayed (80-100% decay)
  },

  // Backgrounds
  background: '#FFFFFF',
  backgroundSecondary: '#F8F9FA',
  surface: '#F5F5F5',
  surfaceElevated: '#FFFFFF',

  // Text
  text: '#1A1A1A',
  textSecondary: '#666666',
  textTertiary: '#767676', // WCAG AA compliant (4.5:1 contrast ratio)
  textInverse: '#FFFFFF',

  // Status colors
  success: '#28A745',
  warning: '#FFC107',
  error: '#DC3545',
  info: '#17A2B8',

  // Borders
  border: '#E0E0E0',
  borderLight: '#F0F0F0',

  // Mining progress
  mining: {
    background: '#1A1A2E',
    progress: '#4CAF50',
    text: '#FFFFFF',
  },
} as const;

export const TYPOGRAPHY = {
  // Font sizes
  fontSize: {
    xs: 11,
    sm: 13,
    base: 15,
    md: 17,
    lg: 20,
    xl: 24,
    xxl: 32,
  },

  // Font weights
  fontWeight: {
    regular: '400' as const,
    medium: '500' as const,
    semibold: '600' as const,
    bold: '700' as const,
  },

  // Line heights
  lineHeight: {
    tight: 1.2,
    normal: 1.5,
    relaxed: 1.75,
  },
} as const;

export const BORDER_RADIUS = {
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  full: 9999,
} as const;

export const SHADOWS = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 1,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 5,
  },
} as const;

// Animation durations (ms)
export const ANIMATION = {
  fast: 150,
  normal: 250,
  slow: 400,
} as const;

// Layout constants
export const LAYOUT = {
  // Thread card height for FlatList getItemLayout
  threadCardHeight: 88,

  // Tab bar height
  tabBarHeight: 56,

  // Header height
  headerHeight: 56,

  // Max content width for readability
  maxContentWidth: 600,

  // Threading depth limit (per CLIENT_DESIGN.md §6.7)
  maxThreadingDepth: 2,
} as const;
