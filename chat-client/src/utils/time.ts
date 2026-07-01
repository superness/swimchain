/**
 * Time utility functions for the Chat Client
 */

/**
 * Format a Unix timestamp as relative time
 * e.g., "just now", "5m ago", "2h ago", "yesterday", "Dec 15"
 */
export function formatRelativeTime(timestamp: number): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = now - timestamp;

  if (diff < 60) {
    return 'just now';
  }

  if (diff < 3600) {
    const minutes = Math.floor(diff / 60);
    return `${minutes}m ago`;
  }

  if (diff < 86400) {
    const hours = Math.floor(diff / 3600);
    return `${hours}h ago`;
  }

  if (diff < 172800) {
    return 'yesterday';
  }

  // Format as date
  const date = new Date(timestamp * 1000);
  const month = date.toLocaleString('en-US', { month: 'short' });
  const day = date.getDate();

  // If this year, just show month and day
  const thisYear = new Date().getFullYear();
  if (date.getFullYear() === thisYear) {
    return `${month} ${day}`;
  }

  return `${month} ${day}, ${date.getFullYear()}`;
}

/**
 * Format timestamp as time only (e.g., "2:34 PM")
 */
export function formatTime(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

/**
 * Format timestamp for message display
 * Returns time for today, "Yesterday at TIME" for yesterday,
 * or "DATE at TIME" for older messages
 */
export function formatMessageTime(timestamp: number): string {
  const now = new Date();
  const date = new Date(timestamp * 1000);
  const time = formatTime(timestamp);

  // Check if same day
  if (
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear()
  ) {
    return `Today at ${time}`;
  }

  // Check if yesterday
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (
    date.getDate() === yesterday.getDate() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getFullYear() === yesterday.getFullYear()
  ) {
    return `Yesterday at ${time}`;
  }

  // Older date
  const month = date.toLocaleString('en-US', { month: 'short' });
  const day = date.getDate();

  if (date.getFullYear() === now.getFullYear()) {
    return `${month} ${day} at ${time}`;
  }

  return `${month} ${day}, ${date.getFullYear()} at ${time}`;
}

/**
 * Get date separator text for message grouping
 * Returns "TODAY", "YESTERDAY", or formatted date
 */
export function getDateSeparator(timestamp: number): string {
  const now = new Date();
  const date = new Date(timestamp * 1000);

  // Check if today
  if (
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear()
  ) {
    return 'TODAY';
  }

  // Check if yesterday
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (
    date.getDate() === yesterday.getDate() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getFullYear() === yesterday.getFullYear()
  ) {
    return 'YESTERDAY';
  }

  // Format full date
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  }).toUpperCase();
}

/**
 * Check if two timestamps are on the same day
 */
export function isSameDay(ts1: number, ts2: number): boolean {
  const d1 = new Date(ts1 * 1000);
  const d2 = new Date(ts2 * 1000);
  return (
    d1.getDate() === d2.getDate() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getFullYear() === d2.getFullYear()
  );
}

/**
 * Check if messages should be grouped (same author within 5 minutes)
 */
export function shouldGroupMessages(
  prevTimestamp: number,
  currTimestamp: number,
  prevAuthor: string,
  currAuthor: string,
): boolean {
  if (prevAuthor !== currAuthor) return false;
  const diff = currTimestamp - prevTimestamp;
  return diff < 300; // 5 minutes
}

/**
 * Format "Last seen X ago" text for presence
 */
export function formatLastSeen(timestamp: number): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = now - timestamp;

  if (diff < 60) {
    return 'Last seen just now';
  }

  if (diff < 3600) {
    const minutes = Math.floor(diff / 60);
    return `Last seen ${minutes}m ago`;
  }

  if (diff < 86400) {
    const hours = Math.floor(diff / 3600);
    return `Last seen ${hours}h ago`;
  }

  const days = Math.floor(diff / 86400);
  if (days === 1) {
    return 'Last seen yesterday';
  }

  return `Last seen ${days} days ago`;
}

/**
 * Format remaining time for mining progress
 */
export function formatRemainingTime(ms: number): string {
  const seconds = Math.ceil(ms / 1000);
  if (seconds <= 0) return 'finishing...';
  if (seconds === 1) return '1s remaining';
  return `${seconds}s remaining`;
}
