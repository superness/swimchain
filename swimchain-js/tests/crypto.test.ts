/**
 * Crypto module tests
 */

import { describe, it, expect, beforeAll } from "vitest";
import {
  initWasm,
  sha256,
  leadingZeros,
  verifyPowDifficulty,
  contentId,
  doubleSha256,
  bytesToHex,
  hexToBytes,
  bytesEqual,
  concatBytes,
} from "../src";

describe("crypto", () => {
  beforeAll(async () => {
    await initWasm();
  });

  describe("sha256", () => {
    it("hashes empty string correctly", () => {
      const hash = sha256(new Uint8Array(0));
      const hex = bytesToHex(hash);
      // Known SHA-256 of empty string
      expect(hex).toBe(
        "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
      );
    });

    it("hashes 'abc' correctly", () => {
      const hash = sha256(new TextEncoder().encode("abc"));
      const hex = bytesToHex(hash);
      // Known SHA-256 of "abc"
      expect(hex).toBe(
        "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
      );
    });

    it("produces 32-byte output", () => {
      const hash = sha256(new TextEncoder().encode("test"));
      expect(hash).toHaveLength(32);
    });

    it("is deterministic", () => {
      const data = new TextEncoder().encode("test data");
      expect(sha256(data)).toEqual(sha256(data));
    });
  });

  describe("leadingZeros", () => {
    it("counts zeros in zero hash", () => {
      const hash = new Uint8Array(32);
      expect(leadingZeros(hash)).toBe(256);
    });

    it("counts 16 zeros for two zero bytes", () => {
      const hash = new Uint8Array(32).fill(0xff);
      hash[0] = 0;
      hash[1] = 0;
      expect(leadingZeros(hash)).toBe(16);
    });

    it("counts 4 zeros for 0x0F", () => {
      const hash = new Uint8Array(32).fill(0xff);
      hash[0] = 0x0f;
      expect(leadingZeros(hash)).toBe(4);
    });

    it("counts 0 zeros for 0xFF", () => {
      const hash = new Uint8Array(32).fill(0xff);
      expect(leadingZeros(hash)).toBe(0);
    });
  });

  describe("verifyPowDifficulty", () => {
    it("accepts hash meeting difficulty", () => {
      const hash = new Uint8Array(32).fill(0xff);
      hash[0] = 0;
      hash[1] = 0;
      expect(verifyPowDifficulty(hash, 16)).toBe(true);
      expect(verifyPowDifficulty(hash, 15)).toBe(true);
    });

    it("rejects hash not meeting difficulty", () => {
      const hash = new Uint8Array(32).fill(0xff);
      hash[0] = 0;
      hash[1] = 0;
      expect(verifyPowDifficulty(hash, 17)).toBe(false);
    });
  });

  describe("contentId", () => {
    it("returns sha256-prefixed ID", () => {
      const id = contentId(new TextEncoder().encode("test"));
      expect(id.startsWith("sha256:")).toBe(true);
    });

    it("has correct length", () => {
      const id = contentId(new TextEncoder().encode("test"));
      expect(id).toHaveLength(7 + 64); // "sha256:" + 64 hex chars
    });
  });

  describe("doubleSha256", () => {
    it("applies SHA-256 twice", () => {
      const data = new TextEncoder().encode("test");
      const single = sha256(data);
      const doubleHash = sha256(single);
      expect(doubleSha256(data)).toEqual(doubleHash);
    });
  });

  describe("hex utilities", () => {
    it("roundtrip bytesToHex/hexToBytes", () => {
      const original = new Uint8Array([1, 2, 3, 255, 0, 128]);
      const hex = bytesToHex(original);
      const restored = hexToBytes(hex);
      expect(restored).toEqual(original);
    });

    it("bytesToHex produces lowercase", () => {
      const hex = bytesToHex(new Uint8Array([0xab, 0xcd]));
      expect(hex).toBe("abcd");
    });

    it("hexToBytes rejects odd length", () => {
      expect(() => hexToBytes("abc")).toThrow();
    });

    it("hexToBytes rejects invalid chars", () => {
      expect(() => hexToBytes("gg")).toThrow();
    });
  });

  describe("array utilities", () => {
    it("bytesEqual compares correctly", () => {
      const a = new Uint8Array([1, 2, 3]);
      const b = new Uint8Array([1, 2, 3]);
      const c = new Uint8Array([1, 2, 4]);
      const d = new Uint8Array([1, 2]);

      expect(bytesEqual(a, b)).toBe(true);
      expect(bytesEqual(a, c)).toBe(false);
      expect(bytesEqual(a, d)).toBe(false);
    });

    it("concatBytes joins arrays", () => {
      const a = new Uint8Array([1, 2]);
      const b = new Uint8Array([3, 4]);
      const c = new Uint8Array([5]);

      expect(concatBytes(a, b, c)).toEqual(new Uint8Array([1, 2, 3, 4, 5]));
    });

    it("concatBytes handles empty arrays", () => {
      const a = new Uint8Array([1, 2]);
      const empty = new Uint8Array(0);

      expect(concatBytes(a, empty)).toEqual(a);
      expect(concatBytes(empty, a)).toEqual(a);
    });
  });
});
