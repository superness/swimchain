/**
 * Minimal JSON-RPC client for a swimchain node, using the same signature
 * authentication scheme as wiki-client/src/lib/rpc.ts:
 *
 *   sign("swimchain-rpc:" + method + ":" + sha256hex(JSON.stringify(params)) + ":" + timestamp)
 *   headers: X-CS-Identity / X-CS-Timestamp / X-CS-Signature
 *
 * Identity: a hex-encoded 32-byte Ed25519 seed (same identity model the wiki
 * write path validates against — the `signature` param of submit_post is
 * checked against `author_id`, so the seed's keypair IS the page author).
 * Ed25519 via node:crypto (raw seed wrapped in PKCS#8 DER).
 *
 * Rate limiting: the node returns HTTP 429 with Retry-After for write bursts;
 * this client honors it at the transport level (same behavior as the e2e
 * suite's patchRateLimitRetry helper).
 */

import { createHash, createPrivateKey, createPublicKey, sign as edSign, randomBytes } from 'node:crypto';

/** PKCS#8 DER prefix for a raw Ed25519 private key (RFC 8410). */
const ED25519_PKCS8_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex');

export function keypairFromSeed(seedHex) {
  const seed = Buffer.from(seedHex, 'hex');
  if (seed.length !== 32) throw new Error('seed must be 32 bytes of hex');
  const privateKey = createPrivateKey({
    key: Buffer.concat([ED25519_PKCS8_PREFIX, seed]),
    format: 'der',
    type: 'pkcs8',
  });
  const spki = createPublicKey(privateKey).export({ format: 'der', type: 'spki' });
  const publicKey = spki.subarray(spki.length - 32);
  return {
    seedHex,
    publicKeyHex: publicKey.toString('hex'),
    publicKeyBytes: Uint8Array.from(publicKey),
    sign(message) {
      return edSign(null, Buffer.from(message, 'utf-8'), privateKey).toString('hex');
    },
  };
}

export function generateSeedHex() {
  return randomBytes(32).toString('hex');
}

export class SwimchainRpc {
  /**
   * @param {{ endpoint: string, keypair: ReturnType<typeof keypairFromSeed>,
   *           timeoutMs?: number, maxRetries?: number }} opts
   */
  constructor({ endpoint, keypair, timeoutMs = 60000, maxRetries = 5 }) {
    this.endpoint = endpoint;
    this.keypair = keypair;
    this.timeoutMs = timeoutMs;
    this.maxRetries = maxRetries;
    this.requestId = 1;
  }

  async call(method, params = {}) {
    let lastError;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        return await this.callOnce(method, params);
      } catch (err) {
        lastError = err;
        const retryAfter = err?.retryAfterMs;
        const isRateLimit = retryAfter !== undefined || /429|rate.?limit/i.test(String(err?.message));
        if (!isRateLimit || attempt === this.maxRetries) throw err;
        await new Promise((r) => setTimeout(r, retryAfter ?? 2000 * (attempt + 1)));
      }
    }
    throw lastError;
  }

  async callOnce(method, params) {
    const request = { jsonrpc: '2.0', method, params, id: this.requestId++ };

    // Signature auth — byte-for-byte the wiki-client rpc.ts scheme. The node
    // recovers the raw params JSON from the request body, so the string
    // hashed here and the `params` serialization in the body MUST be the
    // same JSON.stringify output.
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const paramsHashHex = createHash('sha256').update(JSON.stringify(params), 'utf-8').digest('hex');
    const message = `swimchain-rpc:${method}:${paramsHashHex}:${timestamp}`;

    const res = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CS-Identity': this.keypair.publicKeyHex,
        'X-CS-Timestamp': timestamp,
        'X-CS-Signature': this.keypair.sign(message),
      },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(this.timeoutMs),
    });

    if (res.status === 429) {
      const err = new Error('HTTP 429: rate limited');
      const retryAfter = Number(res.headers.get('retry-after'));
      err.retryAfterMs = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 2000;
      throw err;
    }
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status}: ${res.statusText}${body ? ` - ${body}` : ''}`);
    }
    const json = await res.json();
    if (json.error) {
      throw new Error(`RPC Error ${json.error.code}: ${json.error.message}`);
    }
    return json.result;
  }
}
