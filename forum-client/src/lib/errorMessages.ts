/**
 * User-friendly error message formatting
 *
 * Maps technical RPC errors to human-readable messages.
 * This helps users understand what went wrong and what to do about it.
 */

// Known RPC error codes
const RPC_ERROR_CODES: Record<number, { message: string; action?: string }> = {
  // Standard JSON-RPC errors
  [-32700]: { message: 'Invalid request format', action: 'Please try again' },
  [-32600]: { message: 'Invalid request', action: 'Please try again' },
  [-32601]: { message: 'Feature not available', action: 'This feature may not be supported by your node' },
  [-32602]: { message: 'Invalid parameters', action: 'Please check your input and try again' },
  [-32603]: { message: 'Internal error', action: 'Please try again later' },

  // Custom Swimchain errors
  [-32001]: { message: 'Authentication required', action: 'Please create or import an identity to continue' },
  [-32002]: { message: 'Not sponsored', action: 'You need to be sponsored before you can create content' },
  [-32003]: { message: 'Content not found', action: 'This content may have decayed or been removed' },
  [-32004]: { message: 'Space not found', action: 'This space does not exist' },
  [-32005]: { message: 'Invalid signature', action: 'Please try signing in again' },
  [-32006]: { message: 'Rate limited', action: 'Please wait a moment and try again' },
  [-32007]: { message: 'Insufficient proof-of-work', action: 'Mining is still in progress' },
};

// HTTP status code messages
const HTTP_STATUS_MESSAGES: Record<number, string> = {
  400: 'Invalid request',
  401: 'Authentication required',
  403: 'Access denied',
  404: 'Not found',
  408: 'Request timed out',
  429: 'Too many requests',
  500: 'Server error',
  502: 'Unable to reach node',
  503: 'Service unavailable',
  504: 'Request timed out',
};

/**
 * Parse an error message and extract useful information
 */
export function parseError(error: string | Error | unknown): {
  message: string;
  action?: string;
  isNetworkError: boolean;
  isAuthError: boolean;
} {
  const errorStr = error instanceof Error ? error.message : String(error);

  // Check for JSON-RPC error in the message
  const jsonRpcMatch = errorStr.match(/\{"jsonrpc":"2\.0","error":\{"code":(-?\d+),"message":"([^"]+)"/);
  if (jsonRpcMatch) {
    const codeStr = jsonRpcMatch[1];
    const rpcMessage = jsonRpcMatch[2];
    if (codeStr && rpcMessage) {
      const code = parseInt(codeStr, 10);
      const knownError = RPC_ERROR_CODES[code];
      if (knownError) {
        return {
          message: knownError.message,
          action: knownError.action,
          isNetworkError: false,
          isAuthError: code === -32001 || code === -32005,
        };
      }
      // Use the RPC error message if we don't have a known mapping
      return {
        message: rpcMessage,
        isNetworkError: false,
        isAuthError: code === -32001,
      };
    }
  }

  // Check for HTTP status code
  const httpMatch = errorStr.match(/HTTP (\d{3})(?::|:?\s|$)/i);
  const httpStatus = httpMatch?.[1];
  if (httpStatus) {
    const status = parseInt(httpStatus, 10);
    const message = HTTP_STATUS_MESSAGES[status] || `Request failed (${status})`;
    return {
      message,
      action: status === 401 ? 'Please create or import an identity' : undefined,
      isNetworkError: status >= 500,
      isAuthError: status === 401 || status === 403,
    };
  }

  // Check for common network errors
  if (errorStr.includes('Failed to fetch') || errorStr.includes('NetworkError')) {
    return {
      message: 'Unable to connect to node',
      action: 'Please check that your node is running',
      isNetworkError: true,
      isAuthError: false,
    };
  }

  if (errorStr.includes('timeout') || errorStr.includes('ETIMEDOUT')) {
    return {
      message: 'Request timed out',
      action: 'Please try again',
      isNetworkError: true,
      isAuthError: false,
    };
  }

  // Check for specific content errors
  if (errorStr.includes('not found') || errorStr.includes('does not exist')) {
    return {
      message: 'Content not found',
      action: 'This content may have decayed or been removed',
      isNetworkError: false,
      isAuthError: false,
    };
  }

  if (errorStr.includes('sponsored')) {
    return {
      message: 'Sponsorship required',
      action: 'Ask an existing member to sponsor your identity',
      isNetworkError: false,
      isAuthError: false,
    };
  }

  // Default - return a cleaned up version of the original error
  // Strip any JSON-RPC wrapper text
  let cleanMessage = errorStr
    .replace(/^Failed to \w+:\s*/i, '')
    .replace(/HTTP \d{3}:\s*\w+\s*-?\s*/i, '')
    .replace(/\{"jsonrpc".*$/i, '')
    .trim();

  // Capitalize first letter
  if (cleanMessage.length > 0) {
    cleanMessage = cleanMessage.charAt(0).toUpperCase() + cleanMessage.slice(1);
  }

  return {
    message: cleanMessage || 'An unexpected error occurred',
    action: 'Please try again',
    isNetworkError: false,
    isAuthError: false,
  };
}

/**
 * Format an error for display to users
 */
export function formatErrorMessage(error: string | Error | unknown): string {
  const { message } = parseError(error);
  return message;
}

/**
 * Get an action suggestion for an error
 */
export function getErrorAction(error: string | Error | unknown): string | undefined {
  const { action } = parseError(error);
  return action;
}

/**
 * Check if an error is an authentication error
 */
export function isAuthenticationError(error: string | Error | unknown): boolean {
  const { isAuthError } = parseError(error);
  return isAuthError;
}

/**
 * Check if an error is a network connectivity error
 */
export function isNetworkError(error: string | Error | unknown): boolean {
  const { isNetworkError } = parseError(error);
  return isNetworkError;
}
