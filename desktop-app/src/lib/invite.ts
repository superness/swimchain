/**
 * Invite link tokens (SWIM-INV-3, desktop)
 *
 * An invite token is base64url(JSON):
 *   {"v":1,"offer_id":"...","sponsor":"<pubkey hex>","net":"testnet"}
 *
 * The newcomer receives it three ways, all of which resolve to the same
 * bare token:
 *   - The full web link:   https://swimchain.io/i/#<token>
 *   - The deep link:       swimchain://invite/<token>
 *   - A pasted bare token: <token>
 *
 * This is a dependency-free port of feed-client/src/lib/invite.ts so the
 * desktop shell can decode invites without pulling in the web client's
 * crypto stack.
 */

/** Decoded invite token payload */
export interface InvitePayload {
  v: number;
  offer_id: string;
  sponsor: string;
  net: string;
}

/** Decode a base64url string (with or without padding) to a Uint8Array */
function base64UrlToBytes(input: string): Uint8Array {
  const base64 = input.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Decode an invite token back into its payload.
 * Throws with a descriptive message on malformed input.
 */
export function decodeInviteToken(token: string): InvitePayload {
  let json: string;
  try {
    json = new TextDecoder().decode(base64UrlToBytes(token.trim()));
  } catch {
    throw new Error('Invalid invite code: not valid base64url');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error('Invalid invite code: not valid JSON');
  }

  const obj = parsed as Partial<InvitePayload> | null;
  if (
    !obj ||
    typeof obj !== 'object' ||
    typeof obj.v !== 'number' ||
    typeof obj.offer_id !== 'string' ||
    typeof obj.sponsor !== 'string' ||
    typeof obj.net !== 'string' ||
    obj.offer_id.length === 0 ||
    obj.sponsor.length === 0
  ) {
    throw new Error('Invalid invite code: missing fields');
  }
  if (obj.v !== 1) {
    throw new Error(`Unsupported invite version: ${obj.v}`);
  }

  return {
    v: obj.v,
    offer_id: obj.offer_id,
    sponsor: obj.sponsor,
    net: obj.net,
  };
}

/**
 * Extract a bare token from whatever the user pasted or the OS handed us:
 * - a bare token
 * - a full invite URL (https://swimchain.io/i/#<token>)
 * - an app URL fragment form (#invite=<token>)
 * - a deep link (swimchain://invite/<token>)
 * Returns null if the input is empty.
 */
export function extractInviteToken(raw: string): string | null {
  let value = raw.trim();
  if (!value) return null;

  // Deep link form: swimchain://invite/<token>
  const deepMatch = value.match(/^swimchain:\/\/invite\/(.+)$/i);
  if (deepMatch && deepMatch[1]) {
    value = deepMatch[1];
  } else {
    // Full URL or anything with a fragment: take what's after the last '#'
    const hashIdx = value.lastIndexOf('#');
    if (hashIdx >= 0) {
      value = value.slice(hashIdx + 1);
    }
  }

  // App deep-link fragment form: #invite=<token>
  if (value.startsWith('invite=')) {
    value = value.slice('invite='.length);
  }

  // Strip a trailing slash or query the OS may append to a deep link.
  value = value.replace(/[/?#].*$/, '');

  try {
    value = decodeURIComponent(value);
  } catch {
    // Keep as-is if it isn't URL-encoded
  }

  value = value.trim();
  return value.length > 0 ? value : null;
}

/**
 * Parse whatever the user pasted (token, URL, fragment, or deep link) into a
 * payload. Throws on malformed input; returns null only for empty input.
 */
export function parseInviteInput(raw: string): InvitePayload | null {
  const token = extractInviteToken(raw);
  if (!token) return null;
  return decodeInviteToken(token);
}
