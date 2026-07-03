/**
 * Tests for Action PoW (SPEC_03)
 *
 * Tests the Argon2id-based proof-of-work system used for all content actions.
 * Uses TEST_CONFIG (1 MiB, 1 iter, 1 parallelism) for fast test runs.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  ActionType,
  TEST_CONFIG,
  serializeChallenge,
  leadingZeros,
  createChallenge,
  generateNonceSpace,
  computePoolPowTarget,
  solutionToRpcParams,
  getDifficulty,
  getConfig,
  estimateMiningTime,
  hexToBytes,
  bytesToHex,
  sha256,
} from '../action-pow';

describe('serializeChallenge', () => {
  it('should produce 82-byte canonical format', async () => {
    const challenge = await createChallenge(
      ActionType.Post,
      new TextEncoder().encode('hello'),
      new Uint8Array(32).fill(0x01),
      10,
    );
    const serialized = serializeChallenge(challenge);
    expect(serialized.length).toBe(82);
    expect(serialized[0]).toBe(ActionType.Post);
  });

  it('should place action type at byte 0', async () => {
    const challenge = await createChallenge(
      ActionType.SpaceCreation,
      new TextEncoder().encode('space'),
      new Uint8Array(32).fill(0x02),
      12,
    );
    const serialized = serializeChallenge(challenge);
    expect(serialized[0]).toBe(ActionType.SpaceCreation);
  });

  it('should place content hash at bytes 1-32', async () => {
    const content = new TextEncoder().encode('test content');
    const challenge = await createChallenge(
      ActionType.Reply,
      content,
      new Uint8Array(32).fill(0x03),
      8,
    );
    const serialized = serializeChallenge(challenge);
    const contentHash = await sha256(content);
    expect(serialized.slice(1, 33)).toEqual(contentHash);
  });

  it('should place authorId at bytes 33-64', async () => {
    const authorId = new Uint8Array(32);
    for (let i = 0; i < 32; i++) authorId[i] = i;
    const challenge = await createChallenge(
      ActionType.Post,
      new TextEncoder().encode('author test'),
      authorId,
      10,
    );
    const serialized = serializeChallenge(challenge);
    expect(serialized.slice(33, 65)).toEqual(authorId);
  });
});

describe('leadingZeros', () => {
  it('should return 0 for 0xFF byte', () => {
    expect(leadingZeros(new Uint8Array([0xFF]))).toBe(0);
  });

  it('should return 8 for 0x00 byte', () => {
    expect(leadingZeros(new Uint8Array([0x00]))).toBe(8);
  });

  it('should return 4 for 0x0F byte', () => {
    expect(leadingZeros(new Uint8Array([0x0F]))).toBe(4);
  });

  it('should count across multiple bytes', () => {
    expect(leadingZeros(new Uint8Array([0x00, 0x00, 0x10]))).toBe(16 + 3);
  });

  it('should handle full 32-byte hash', () => {
    const hash = new Uint8Array(32);
    hash[3] = 0x80;
    expect(leadingZeros(hash)).toBe(24);
  });
});

describe('generateNonceSpace', () => {
  it('should produce 8 random bytes', () => {
    const ns = generateNonceSpace();
    expect(ns.length).toBe(8);
  });

  it('should produce different values each call', () => {
    const ns1 = generateNonceSpace();
    const ns2 = generateNonceSpace();
    expect(ns1).not.toEqual(ns2);
  });
});

describe('getDifficulty', () => {
  it('should return testnet difficulty for testnet', () => {
    expect(getDifficulty(ActionType.Post, true)).toBe(10);
    expect(getDifficulty(ActionType.Reply, true)).toBe(8);
    expect(getDifficulty(ActionType.Engage, true)).toBe(6);
  });

  it('should return mainnet difficulty for mainnet', () => {
    expect(getDifficulty(ActionType.Post, false)).toBe(20);
    expect(getDifficulty(ActionType.SpaceCreation, false)).toBe(22);
  });
});

describe('getConfig', () => {
  it('should return test config for testnet', () => {
    const cfg = getConfig(true);
    expect(cfg.memoryKib).toBe(8192);
    expect(cfg.parallelism).toBe(2);
  });

  it('should return production config for mainnet', () => {
    const cfg = getConfig(false);
    expect(cfg.memoryKib).toBe(65536);
    expect(cfg.parallelism).toBe(4);
  });
});

describe('estimateMiningTime', () => {
  it('should estimate expected time based on difficulty', () => {
    const time = estimateMiningTime(10, 1);
    expect(time).toBeCloseTo(1024, 0);
  });

  it('should scale with hash rate', () => {
    const time1 = estimateMiningTime(10, 1);
    const time2 = estimateMiningTime(10, 10);
    expect(time2).toBeCloseTo(time1 / 10, 0);
  });
});

describe('computePoolPowTarget', () => {
  it('should produce a 32-byte hash', async () => {
    const target = await computePoolPowTarget(
      new Uint8Array(32).fill(0xaa),
      new Uint8Array(32).fill(0xbb),
    );
    expect(target.length).toBe(32);
  });

  it('should be deterministic for same inputs', async () => {
    const content = new Uint8Array(32).fill(0xcc);
    const pool = new Uint8Array(32).fill(0xdd);
    const target1 = await computePoolPowTarget(content, pool);
    const target2 = await computePoolPowTarget(content, pool);
    expect(target1).toEqual(target2);
  });

  it('should change when prevBlockHash differs', async () => {
    const content = new Uint8Array(32).fill(0xee);
    const pool = new Uint8Array(32).fill(0xff);
    const prev1 = new Uint8Array(32).fill(0x11);
    const prev2 = new Uint8Array(32).fill(0x22);
    const target1 = await computePoolPowTarget(content, pool, prev1);
    const target2 = await computePoolPowTarget(content, pool, prev2);
    expect(target1).not.toEqual(target2);
  });
});

describe('solutionToRpcParams', () => {
  it('should convert solution to flat params', async () => {
    const author = new Uint8Array(32).fill(0x02);
    const ns = generateNonceSpace();
    const challenge = {
      actionType: ActionType.Post as const,
      contentHash: await sha256(new TextEncoder().encode('test')),
      authorId: author,
      timestamp: 1000000,
      difficulty: 10,
      nonceSpace: ns,
    };
    const hash = new Uint8Array(32);
    hash[0] = 0x00;

    const solution = { challenge, nonce: 42n, hash };
    const params = solutionToRpcParams(solution);

    expect(params.pow_nonce).toBe(42);
    expect(params.pow_difficulty).toBe(10);
    expect(params.timestamp).toBe(1000000);
    expect(typeof params.pow_nonce_space).toBe('string');
    expect(typeof params.pow_hash).toBe('string');
  });
});

describe('hexToBytes / bytesToHex', () => {
  it('should round-trip hex conversion', () => {
    const hex = 'deadbeef0123456789abcdef';
    const bytes = hexToBytes(hex);
    expect(bytesToHex(bytes)).toBe(hex);
  });

  it('should handle empty hex', () => {
    expect(bytesToHex(new Uint8Array(0))).toBe('');
    expect(hexToBytes('')).toEqual(new Uint8Array(0));
  });

  it('should pad single-digit hex bytes', () => {
    expect(bytesToHex(new Uint8Array([0x01]))).toBe('01');
  });
});
