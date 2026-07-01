/**
 * Tidal UX Components
 *
 * A novel social media interaction paradigm built for Swimchain's
 * engagement pool and proof-of-work mechanics.
 *
 * Core Concepts:
 * - Content "breathes" and can die without community tending
 * - Users hold to tend (contribute PoW) instead of tapping to like
 * - Depth replaces chronology - older surviving content is "deeper"
 * - Rescue missions enable collaborative real-time saving
 * - Stewardship replaces followers/karma
 */

// The heartbeat of Tidal - visualizes content vitality
export { BreathIndicator, type BreathState } from './BreathIndicator';

// Hold-to-tend interaction with haptic feedback
export { TendGesture } from './TendGesture';

// Depth-based content navigation
export { DepthFeed, type DepthLayer, type DepthItem } from './DepthFeed';

// Collaborative content rescue
export { RescueMission } from './RescueMission';

// User profile focused on stewardship
export { StewardshipProfile } from './StewardshipProfile';
