/**
 * An ed25519 signer for the browser, from a passphrase — Task 7's capture
 * needs the two windows to write as the two identities the two-node smoke
 * already sponsored, and the shell has no key store of its own yet.
 *
 * DEV-ONLY, and deliberately weak: a passphrase is hashed straight into a seed
 * with no KDF, so anyone who knows the label holds the key. That is fine for a
 * regtest capture with a published dev genesis and is NOT how a shipped Shoal
 * should mint a player identity — a real one adopts the node's identity through
 * the shell (see project memory "node-mode identity"), which is a different
 * task with different security properties.
 *
 * ## Why WebCrypto rather than a library
 *
 * `shoal-client` has three runtime dependencies (react, react-dom, hash-wasm)
 * and adding `@noble/curves` for this would make it the sixth copy of the same
 * primitives in this repo (open item §6 already objects to the fifth).
 * WebCrypto has shipped unflagged Ed25519 since Chrome 137 / Firefox 130 /
 * Safari 17, and this is dev-only code behind a query parameter — so the
 * narrower support window costs nothing and the dependency does not grow.
 *
 * ## The two DER facts this file depends on
 *
 * An ed25519 PKCS#8 private key is a FIXED 16-byte prefix followed by the raw
 * 32-byte seed — the same constant `scripts/two-client-smoke.ts` uses with
 * `node:crypto`, which is what makes a browser window and the smoke script
 * derive the SAME identity from the same label.
 *
 * The public key cannot be read back off an imported private `CryptoKey`
 * directly, but a JWK export of an OKP key carries it in `x` (base64url), so
 * that is where `publicKeyHex` comes from. This requires `extractable: true`,
 * which is why the key is imported extractable — another reason this is
 * dev-only.
 */
import type { SignFn } from '../lib/shoalSend';

/** DER prefix for a PKCS#8-wrapped raw ed25519 seed. */
const PKCS8_ED25519_PREFIX = new Uint8Array([
  0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06,
  0x03, 0x2b, 0x65, 0x70, 0x04, 0x22, 0x04, 0x20,
]);

export interface BrowserIdentity {
  readonly publicKeyHex: string;
  readonly sign: SignFn;
}

function hex(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += b.toString(16).padStart(2, '0');
  return s;
}

function base64UrlToBytes(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64.padEnd(Math.ceil(b64.length / 4) * 4, '='));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * The identity `label` denotes. `sha256('shoal-two:' + label)` is the seed —
 * byte for byte the derivation `scripts/two-client-smoke.ts`'s `player()`
 * uses, so `identityFromLabel('alice')` in a window and `player('alice')` in
 * the smoke are the same swimmer, already sponsored, already in the room.
 *
 * Throws if the platform has no Ed25519 in WebCrypto rather than falling back
 * to something weaker — a silent downgrade would produce signatures the node
 * rejects, one write at a time, with no obvious cause.
 */
export async function identityFromLabel(label: string): Promise<BrowserIdentity> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error('identityFromLabel: no WebCrypto (needs a secure context)');

  const seed = new Uint8Array(
    await subtle.digest('SHA-256', new TextEncoder().encode(`shoal-two:${label}`)),
  );
  const der = new Uint8Array(PKCS8_ED25519_PREFIX.length + seed.length);
  der.set(PKCS8_ED25519_PREFIX, 0);
  der.set(seed, PKCS8_ED25519_PREFIX.length);

  let key: CryptoKey;
  try {
    key = await subtle.importKey('pkcs8', der, { name: 'Ed25519' }, true, ['sign']);
  } catch (e) {
    throw new Error(
      'identityFromLabel: this browser has no WebCrypto Ed25519 '
      + '(Chrome 137+, Firefox 130+, Safari 17+ have it): ' + String(e),
    );
  }

  const jwk = await subtle.exportKey('jwk', key);
  if (typeof jwk.x !== 'string') throw new Error('identityFromLabel: JWK export carried no public key');

  return {
    publicKeyHex: hex(base64UrlToBytes(jwk.x)),
    sign: async (msg: Uint8Array): Promise<Uint8Array> =>
      new Uint8Array(await subtle.sign('Ed25519', key, msg as BufferSource)),
  };
}
