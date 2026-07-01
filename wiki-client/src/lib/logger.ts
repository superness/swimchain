/**
 * Client Logger - Sends logs to desktop app for file persistence
 *
 * Usage:
 *   import { logger } from '@/lib/logger';
 *   logger.info('User logged in');
 *   logger.error('Failed to load content', error);
 *   logger.warn('Rate limit approaching');
 *   logger.debug('Cache hit for', contentHash);
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogMessage {
  type: 'SWIMCHAIN_LOG';
  level: LogLevel;
  message: string;
  client: string;
}

const CLIENT_NAME = 'search-client';

// Check if running in an iframe (embedded in desktop app)
const isEmbedded = window.parent !== window;

function formatMessage(_level: LogLevel, args: unknown[]): string {
  const parts = args.map(arg => {
    if (arg instanceof Error) {
      return `${arg.message}\n${arg.stack || ''}`;
    }
    if (typeof arg === 'object') {
      try {
        return JSON.stringify(arg);
      } catch {
        return String(arg);
      }
    }
    return String(arg);
  });
  return parts.join(' ');
}

function sendLog(level: LogLevel, ...args: unknown[]): void {
  const message = formatMessage(level, args);

  // Always log to console
  const consoleFn = level === 'debug' ? console.debug
    : level === 'info' ? console.info
    : level === 'warn' ? console.warn
    : console.error;
  consoleFn(`[${CLIENT_NAME}]`, ...args);

  // Send to parent window if embedded
  if (isEmbedded) {
    const logMessage: LogMessage = {
      type: 'SWIMCHAIN_LOG',
      level,
      message,
      client: CLIENT_NAME,
    };
    try {
      window.parent.postMessage(logMessage, '*');
    } catch (e) {
      // Ignore postMessage errors (e.g., cross-origin restrictions)
    }
  }
}

export const logger = {
  debug: (...args: unknown[]) => sendLog('debug', ...args),
  info: (...args: unknown[]) => sendLog('info', ...args),
  warn: (...args: unknown[]) => sendLog('warn', ...args),
  error: (...args: unknown[]) => sendLog('error', ...args),

  // Log with explicit level
  log: (level: LogLevel, ...args: unknown[]) => sendLog(level, ...args),
};

// Also export as default
export default logger;
