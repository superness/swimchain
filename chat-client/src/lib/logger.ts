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

const CLIENT_NAME = 'chat-client';

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

/**
 * Mirror raw console.* and uncaught errors to the desktop log file, so runtime
 * errors from code that uses `console` directly (not `logger`) are still
 * captured for debugging. Call once at startup; no-op outside the desktop
 * iframe. Forwards straight to the parent (bypassing sendLog) to avoid recursion.
 */
export function captureConsole(): void {
  const w = window as unknown as { __swimLogCapture?: boolean };
  if (!isEmbedded || w.__swimLogCapture) return;
  w.__swimLogCapture = true;

  const forward = (level: LogLevel, args: unknown[]): void => {
    try {
      window.parent.postMessage(
        { type: 'SWIMCHAIN_LOG', level, message: formatMessage(level, args), client: CLIENT_NAME } as LogMessage,
        '*',
      );
    } catch {
      /* ignore */
    }
  };

  (['log', 'info', 'warn', 'error', 'debug'] as const).forEach((name) => {
    const orig = console[name].bind(console);
    console[name] = (...args: unknown[]) => {
      orig(...args);
      forward(name === 'log' ? 'info' : (name as LogLevel), args);
    };
  });
  window.addEventListener('error', (e) =>
    forward('error', [`window.onerror: ${e.message}`, (e.error as Error)?.stack ?? `${e.filename}:${e.lineno}`]),
  );
  window.addEventListener('unhandledrejection', (e) =>
    forward('error', ['unhandledrejection:', (e as PromiseRejectionEvent).reason]),
  );
}

// Also export as default
export default logger;
