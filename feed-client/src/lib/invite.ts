/**
 * Invite link tokens (SWIM-INV-2)
 *
 * An invite token is base64url(JSON):
 *   {"v":1,"offer_id":"...","sponsor":"<pubkey hex>","net":"testnet"}
 *
 * Shared as https://swimchain.io/i/#<token> — the token lives in the URL
 * fragment so it never hits server logs.
 */

/** Base URL for invite links. The token is carried in the fragment. */
export const INVITE_BASE_URL = 'https://swimchain.io/i/';

/** Decoded invite token payload */
export interface InvitePayload {
  v: number;
  offer_id: string;
  sponsor: string;
  net: string;
}

/** Encode a Uint8Array as base64url (no padding) */
function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) {
    binary += String.fromCharCode(b);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
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
 * Encode an invite payload into a shareable token.
 */
export function encodeInviteToken(payload: InvitePayload): string {
  const json = JSON.stringify({
    v: payload.v,
    offer_id: payload.offer_id,
    sponsor: payload.sponsor,
    net: payload.net,
  });
  return bytesToBase64Url(new TextEncoder().encode(json));
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
 * Build the shareable invite URL for a token.
 */
export function buildInviteUrl(token: string): string {
  return `${INVITE_BASE_URL}#${token}`;
}

/**
 * Extract a bare token from whatever the user pasted:
 * - a bare token
 * - a full invite URL (https://swimchain.io/i/#<token>)
 * - an app URL fragment form (#invite=<token>)
 * Returns null if the input is empty.
 */
export function extractInviteToken(raw: string): string | null {
  let value = raw.trim();
  if (!value) return null;

  // Full URL or anything with a fragment: take what's after the last '#'
  const hashIdx = value.lastIndexOf('#');
  if (hashIdx >= 0) {
    value = value.slice(hashIdx + 1);
  }

  // App deep-link form: #invite=<token>
  if (value.startsWith('invite=')) {
    value = value.slice('invite='.length);
  }

  try {
    value = decodeURIComponent(value);
  } catch {
    // Keep as-is if it isn't URL-encoded
  }

  value = value.trim();
  return value.length > 0 ? value : null;
}

/**
 * Parse whatever the user pasted (token, URL, or fragment) into a payload.
 * Throws on malformed input; returns null only for empty input.
 */
export function parseInviteInput(raw: string): InvitePayload | null {
  const token = extractInviteToken(raw);
  if (!token) return null;
  return decodeInviteToken(token);
}
