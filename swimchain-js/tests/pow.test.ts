/**
 * PoW module tests
 */

import { describe, it, expect, beforeAll } from "vitest";
import {
  initWasm,
  Keypair,
  mineIdentityPow,
  mineIdentityPowWithLimit,
  verifyIdentityPow,
  verifyIdentityPowWithHash,
  getDefaultIdentityPowDifficulty,
  estimateMiningTime,
  formatMiningTimeEstimate,
  createMiner,
} from "../src";

describe("pow", () => {
  beforeAll(async () => {
    await initWasm();
  });

  describe("mineIdentityPow", () => {
    it("mines valid proof at difficulty 8", () => {
      const kp = new Keypair();
      const solution = mineIdentityPow(kp.publicKey(), 8);

      expect(solution.leadingZeros).toBeGreaterThanOrEqual(8);
      expect(solution.hash).toHaveLength(32);
      expect(solution.attempts).toBeGreaterThan(0n);
      expect(solution.elapsedMs).toBeGreaterThanOrEqual(0);

      kp.free();
    });

    it("mined proof is verifiable", () => {
      const kp = new Keypair();
      const solution = mineIdentityPow(kp.publicKey(), 8);

      const isValid = verifyIdentityPow(
        kp.publicKey(),
        solution.timestamp,
        solution.nonce,
        8
      );

      expect(isValid).toBe(true);
      kp.free();
    });

    it("reports hash rate", () => {
      const kp = new Keypair();
      const solution = mineIdentityPow(kp.publicKey(), 8);

      // Hash rate may be 0 if elapsed time is 0 (very fast mining)
      expect(solution.hashRate).toBeGreaterThanOrEqual(0);
      kp.free();
    });
  });

  describe("mineIdentityPowWithLimit", () => {
    it("respects attempt limit", () => {
      const kp = new Keypair();

      // Very high difficulty with low limit should fail
      try {
        mineIdentityPowWithLimit(kp.publicKey(), 64, 100);
        expect.fail("Should have thrown due to limit");
      } catch (error) {
        expect(error).toBeDefined();
      }

      kp.free();
    });
  });

  describe("verifyIdentityPow", () => {
    it("verifies valid proof", () => {
      const kp = new Keypair();
      const solution = mineIdentityPow(kp.publicKey(), 8);

      expect(
        verifyIdentityPow(kp.publicKey(), solution.timestamp, solution.nonce, 8)
      ).toBe(true);

      kp.free();
    });

    it("rejects wrong nonce", () => {
      const kp = new Keypair();
      const solution = mineIdentityPow(kp.publicKey(), 8);

      expect(
        verifyIdentityPow(
          kp.publicKey(),
          solution.timestamp,
          solution.nonce + 1n,
          8
        )
      ).toBe(false);

      kp.free();
    });

    it("rejects wrong timestamp", () => {
      const kp = new Keypair();
      const solution = mineIdentityPow(kp.publicKey(), 8);

      expect(
        verifyIdentityPow(
          kp.publicKey(),
          solution.timestamp + 1n,
          solution.nonce,
          8
        )
      ).toBe(false);

      kp.free();
    });

    it("rejects higher difficulty than proof meets", () => {
      const kp = new Keypair();
      const solution = mineIdentityPow(kp.publicKey(), 8);

      // Proof may not meet higher difficulty
      if (solution.leadingZeros < 32) {
        expect(
          verifyIdentityPow(
            kp.publicKey(),
            solution.timestamp,
            solution.nonce,
            32
          )
        ).toBe(false);
      }

      kp.free();
    });

    it("rejects wrong public key", () => {
      const kp1 = new Keypair();
      const kp2 = new Keypair();
      const solution = mineIdentityPow(kp1.publicKey(), 8);

      expect(
        verifyIdentityPow(kp2.publicKey(), solution.timestamp, solution.nonce, 8)
      ).toBe(false);

      kp1.free();
      kp2.free();
    });
  });

  describe("verifyIdentityPowWithHash", () => {
    it("returns hash for valid proof", () => {
      const kp = new Keypair();
      const solution = mineIdentityPow(kp.publicKey(), 8);

      const hash = verifyIdentityPowWithHash(
        kp.publicKey(),
        solution.timestamp,
        solution.nonce,
        8
      );

      expect(hash).not.toBeNull();
      expect(hash).toEqual(solution.hash);

      kp.free();
    });

    it("returns null for invalid proof", () => {
      const kp = new Keypair();
      const solution = mineIdentityPow(kp.publicKey(), 8);

      const hash = verifyIdentityPowWithHash(
        kp.publicKey(),
        solution.timestamp,
        solution.nonce + 1n,
        8
      );

      // WASM returns undefined when no valid hash found
      expect(hash).toBeFalsy();
      kp.free();
    });
  });

  describe("utility functions", () => {
    it("getDefaultIdentityPowDifficulty returns 20", () => {
      expect(getDefaultIdentityPowDifficulty()).toBe(20);
    });

    it("estimateMiningTime calculates correctly", () => {
      // Difficulty 20 = 2^20 = ~1M attempts
      // At 500K h/s = ~2 seconds
      const estimate = estimateMiningTime(20, 500000);
      expect(estimate).toBeGreaterThan(1);
      expect(estimate).toBeLessThan(5);
    });

    it("formatMiningTimeEstimate returns readable string", () => {
      expect(formatMiningTimeEstimate(8)).toContain("second");
      expect(formatMiningTimeEstimate(20)).toContain("second");
      expect(formatMiningTimeEstimate(30)).toContain("minute");
    });

    it("createMiner creates working miner function", () => {
      const miner = createMiner({ difficulty: 8 });
      const kp = new Keypair();

      const solution = miner(kp.publicKey());
      expect(solution.leadingZeros).toBeGreaterThanOrEqual(8);

      kp.free();
    });
  });
});
