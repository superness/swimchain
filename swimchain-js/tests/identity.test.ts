/**
 * Identity module tests
 */

import { describe, it, expect, beforeAll } from "vitest";
import {
  initWasm,
  Keypair,
  encodeAddress,
  decodeAddress,
  verifySignature,
  isValidAddress,
  validateAddress,
} from "../src";

describe("identity", () => {
  beforeAll(async () => {
    await initWasm();
  });

  describe("Keypair", () => {
    it("generates a new keypair", () => {
      const kp = new Keypair();
      expect(kp.publicKey()).toHaveLength(32);
      kp.free();
    });

    it("generates unique keypairs", () => {
      const kp1 = new Keypair();
      const kp2 = new Keypair();
      expect(kp1.publicKey()).not.toEqual(kp2.publicKey());
      kp1.free();
      kp2.free();
    });

    it("generates addresses starting with cs1", () => {
      const kp = new Keypair();
      const addr = kp.address();
      expect(addr.startsWith("cs1")).toBe(true);
      kp.free();
    });

    it("creates deterministic keypair from seed", () => {
      const seed = new Uint8Array(32).fill(42);
      const kp1 = Keypair.fromSeed(seed);
      const kp2 = Keypair.fromSeed(seed);

      expect(kp1.publicKey()).toEqual(kp2.publicKey());
      expect(kp1.address()).toEqual(kp2.address());

      kp1.free();
      kp2.free();
    });
  });

  describe("Address encoding", () => {
    it("roundtrip address encoding", () => {
      const kp = new Keypair();
      const pk = kp.publicKey();
      const addr = encodeAddress(pk);

      expect(addr.startsWith("cs1")).toBe(true);

      const decoded = decodeAddress(addr);
      expect(decoded).toEqual(pk);

      kp.free();
    });

    it("rejects invalid address prefix", () => {
      expect(() => decodeAddress("bc1qqqq")).toThrow();
    });

    it("rejects invalid address checksum", () => {
      const kp = new Keypair();
      const addr = kp.address();
      const corrupted = addr.slice(0, -1) + (addr.endsWith("q") ? "p" : "q");
      expect(() => decodeAddress(corrupted)).toThrow();
      kp.free();
    });
  });

  describe("Signature verification", () => {
    it("verifies valid signature", () => {
      const kp = new Keypair();
      const message = new TextEncoder().encode("test message");
      const sig = kp.sign(message);

      expect(verifySignature(kp.publicKey(), message, sig)).toBe(true);
      kp.free();
    });

    it("rejects wrong message", () => {
      const kp = new Keypair();
      const message = new TextEncoder().encode("test message");
      const wrongMessage = new TextEncoder().encode("wrong message");
      const sig = kp.sign(message);

      expect(verifySignature(kp.publicKey(), wrongMessage, sig)).toBe(false);
      kp.free();
    });

    it("rejects wrong public key", () => {
      const kp1 = new Keypair();
      const kp2 = new Keypair();
      const message = new TextEncoder().encode("test message");
      const sig = kp1.sign(message);

      expect(verifySignature(kp2.publicKey(), message, sig)).toBe(false);
      kp1.free();
      kp2.free();
    });

    it("rejects corrupted signature", () => {
      const kp = new Keypair();
      const message = new TextEncoder().encode("test message");
      const sig = kp.sign(message);
      sig[0] ^= 0xff; // Corrupt first byte

      expect(verifySignature(kp.publicKey(), message, sig)).toBe(false);
      kp.free();
    });
  });

  describe("Address validation", () => {
    it("validates correct address", () => {
      const kp = new Keypair();
      expect(isValidAddress(kp.address())).toBe(true);
      kp.free();
    });

    it("rejects invalid strings", () => {
      expect(isValidAddress("invalid")).toBe(false);
      expect(isValidAddress("")).toBe(false);
      expect(isValidAddress("cs1")).toBe(false);
    });

    it("returns detailed validation result", () => {
      const kp = new Keypair();
      const result = validateAddress(kp.address());

      expect(result.valid).toBe(true);
      expect(result.publicKey).toEqual(kp.publicKey());
      expect(result.error).toBeUndefined();

      const invalidResult = validateAddress("invalid");
      expect(invalidResult.valid).toBe(false);
      expect(invalidResult.error).toBeDefined();

      kp.free();
    });
  });
});
