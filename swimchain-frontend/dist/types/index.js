/**
 * Core type definitions for the Swimchain Chat Client
 * Discord-like real-time messaging experience
 */
// ============================================
// Constants
// ============================================
/** Pool target seconds for content persistence */
export const POOL_TARGET_SECONDS = 60;
/** Quick engagement contribution in seconds */
export const ENGAGE_QUICK_SECONDS = 5;
/** Standard engagement contribution in seconds */
export const ENGAGE_STANDARD_SECONDS = 15;
/** Typing indicator disappears after this many ms */
export const TYPING_TIMEOUT_MS = 5000;
/** Re-broadcast typing every N ms while typing */
export const TYPING_BROADCAST_INTERVAL_MS = 3000;
/** Presence heartbeat interval in ms */
export const PRESENCE_HEARTBEAT_MS = 30000;
/** Transition to 'away' after this many ms of no activity */
export const PRESENCE_AWAY_THRESHOLD_MS = 120000;
/** Poll for new messages every N ms (MVP, future: WebSocket) */
export const POLL_INTERVAL_MS = 5000;
/** Update heat values every N ms */
export const HEAT_UPDATE_INTERVAL_MS = 60000;
/** PoW difficulty for reactions (~1s on mobile, <1s on desktop) */
export const REACTION_DIFFICULTY = 8;
/** PoW difficulty for messages (~15s on desktop) */
export const MESSAGE_DIFFICULTY = 10;
/**
 * Get heat visual state from heat percentage
 */
export function getHeatState(heatPercent) {
    if (heatPercent >= 80)
        return 'full'; // 80-100%
    if (heatPercent >= 60)
        return 'warm'; // 60-79%
    if (heatPercent >= 20)
        return 'cooling'; // 20-59%
    if (heatPercent >= 5)
        return 'fading'; // 5-19%
    return 'decayed'; // <5%
}
/**
 * Get CSS class for heat-based opacity
 */
export function getHeatClass(heatPercent) {
    if (heatPercent >= 80)
        return 'heat-100';
    if (heatPercent >= 60)
        return 'heat-80';
    if (heatPercent >= 40)
        return 'heat-60';
    if (heatPercent >= 20)
        return 'heat-40';
    if (heatPercent >= 5)
        return 'heat-20';
    return 'heat-5';
}
/**
 * Default chat preferences
 */
export const DEFAULT_CHAT_PREFERENCES = {
    showTypingIndicators: true,
    showPresence: true,
    notificationSounds: true,
    powDifficulty: MESSAGE_DIFFICULTY,
};
//# sourceMappingURL=index.js.map