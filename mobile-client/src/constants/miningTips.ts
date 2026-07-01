/**
 * Mining Tips - Educational messages shown during PoW
 * Per Step 8: Rotate every 5 seconds during mining
 */

export const MINING_TIPS = [
  "This proof-of-work prevents spam without needing moderators.",
  "You're not just waiting—you're defending the network.",
  "Every post costs compute, making advertising economically irrational.",
  "The delay is intentional: it makes posting deliberate, not impulsive.",
  "Your device is doing cryptographic work. It may get warm—that's normal.",
  "Unlike likes or upvotes, PoW engagement can't be faked.",
  "This computation ensures only genuine participants can post.",
  "The work you do helps keep the conversation quality high.",
  "No central servers means no single point of control or failure.",
  "Your identity is secured by cryptographic keys, not passwords.",
] as const;

export const TIP_ROTATION_INTERVAL_MS = 5000; // 5 seconds

/**
 * Get a random tip
 */
export function getRandomTip(): string {
  const index = Math.floor(Math.random() * MINING_TIPS.length);
  return MINING_TIPS[index];
}

/**
 * Get tips in sequence
 */
export function createTipSequence(): () => string {
  let index = 0;
  return () => {
    const tip = MINING_TIPS[index];
    index = (index + 1) % MINING_TIPS.length;
    return tip;
  };
}
