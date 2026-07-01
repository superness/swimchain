/**
 * Decay module tests
 */

import { describe, it, expect, beforeAll } from "vitest";
import {
  initWasm,
  calculateDecay,
  calculateDecayWithHalfLife,
  getDecayConstants,
  survivalProbability,
  halfLivesFromProbability,
  isDecayedAtProbability,
  formatDecayState,
  formatDuration,
} from "../src";

describe("decay", () => {
  beforeAll(async () => {
    await initWasm();
  });

  describe("calculateDecay", () => {
    it("floor protection for 24h old content", () => {
      const nowSecs = Math.floor(Date.now() / 1000);
      const created = nowSecs - 24 * 60 * 60; // 24h ago

      const state = calculateDecay(created, created, nowSecs);

      expect(state.isProtected).toBe(true);
      expect(state.isDecayed).toBe(false);
      expect(state.currentHeat).toBe(1.0);
      expect(state.ageSeconds).toBe(24 * 60 * 60);
    });

    it("32-day decay matches spec", () => {
      const nowSecs = Math.floor(Date.now() / 1000);
      const created = nowSecs - 32 * 24 * 60 * 60; // 32 days ago

      const state = calculateDecay(created, created, nowSecs);

      expect(state.isProtected).toBe(false);
      expect(state.isDecayed).toBe(true);

      // Per SPEC_02: effective decay time = 30 days (32 - 2 floor)
      // Half-lives = 30d / 7d ≈ 4.286
      // Survival = 0.5^4.286 ≈ 0.051
      expect(state.currentHeat).toBeGreaterThan(0.04);
      expect(state.currentHeat).toBeLessThan(0.06);
    });

    it("engagement resets decay", () => {
      const nowSecs = Math.floor(Date.now() / 1000);
      const created = nowSecs - 32 * 24 * 60 * 60; // 32 days ago
      const engaged = nowSecs - 5 * 24 * 60 * 60; // 5 days ago

      const state = calculateDecay(created, engaged, nowSecs);

      expect(state.isProtected).toBe(false);
      expect(state.isDecayed).toBe(false);

      // Effective decay time = 5d - 2d = 3d
      // Half-lives = 3d / 7d ≈ 0.428
      // Survival = 0.5^0.428 ≈ 0.74
      expect(state.currentHeat).toBeGreaterThan(0.7);
      expect(state.currentHeat).toBeLessThan(0.8);
    });

    it("uses current time when not specified", () => {
      const nowSecs = Math.floor(Date.now() / 1000);
      const created = nowSecs - 100;

      const state = calculateDecay(created, created);
      expect(state.ageSeconds).toBeGreaterThanOrEqual(100);
      expect(state.ageSeconds).toBeLessThan(110); // Allow small timing variance
    });
  });

  describe("calculateDecayWithHalfLife", () => {
    it("custom half-life affects decay rate", () => {
      const nowSecs = Math.floor(Date.now() / 1000);
      const created = nowSecs - 14 * 24 * 60 * 60; // 14 days ago

      const state7d = calculateDecay(created, created, nowSecs);
      const state14d = calculateDecayWithHalfLife(
        created,
        created,
        nowSecs,
        14 * 24 * 60 * 60
      );

      // 14-day half-life should result in higher survival
      expect(state14d.currentHeat).toBeGreaterThan(state7d.currentHeat);
    });
  });

  describe("getDecayConstants", () => {
    it("returns correct protocol values", () => {
      const constants = getDecayConstants();

      expect(constants.floorSecs).toBe(172800); // 48 hours
      expect(constants.halfLifeSecs).toBe(604800); // 7 days
      expect(constants.threshold).toBe(0.0625); // 6.25%
    });
  });

  describe("utility functions", () => {
    it("survivalProbability calculates correctly", () => {
      expect(survivalProbability(0)).toBe(1);
      expect(survivalProbability(1)).toBe(0.5);
      expect(survivalProbability(2)).toBe(0.25);
      expect(survivalProbability(4)).toBeCloseTo(0.0625);
    });

    it("halfLivesFromProbability calculates correctly", () => {
      expect(halfLivesFromProbability(1)).toBeCloseTo(0);
      expect(halfLivesFromProbability(0.5)).toBe(1);
      expect(halfLivesFromProbability(0.25)).toBe(2);
    });

    it("halfLivesFromProbability rejects invalid input", () => {
      expect(() => halfLivesFromProbability(0)).toThrow();
      expect(() => halfLivesFromProbability(-0.5)).toThrow();
      expect(() => halfLivesFromProbability(1.5)).toThrow();
    });

    it("isDecayedAtProbability checks threshold", () => {
      expect(isDecayedAtProbability(0.07)).toBe(false);
      expect(isDecayedAtProbability(0.0625)).toBe(false);
      expect(isDecayedAtProbability(0.06)).toBe(true);
      expect(isDecayedAtProbability(0.01)).toBe(true);
    });
  });

  describe("formatting", () => {
    it("formatDuration formats correctly", () => {
      expect(formatDuration(30)).toBe("30s");
      expect(formatDuration(120)).toBe("2m");
      expect(formatDuration(3600)).toBe("1h");
      expect(formatDuration(3660)).toBe("1h 1m");
      expect(formatDuration(86400)).toBe("1d");
      expect(formatDuration(90000)).toBe("1d 1h");
    });

    it("formatDecayState describes protected content", () => {
      const state = {
        isProtected: true,
        isDecayed: false,
        currentHeat: 1,
        ageSeconds: 3600,
        halfLivesElapsed: 0,
        timeSinceEngagement: 3600,
        decayPercent: 0,
        description: "",
        timeUntilDecay: Number.MAX_SAFE_INTEGER,
      };

      expect(formatDecayState(state)).toContain("Protected");
    });

    it("formatDecayState describes decayed content", () => {
      const state = {
        isProtected: false,
        isDecayed: true,
        currentHeat: 0.05,
        ageSeconds: 3000000,
        halfLivesElapsed: 4.3,
        timeSinceEngagement: 3000000,
        decayPercent: 95,
        description: "",
        timeUntilDecay: 0,
      };

      expect(formatDecayState(state)).toContain("Decayed");
    });

    it("formatDecayState describes active content", () => {
      const state = {
        isProtected: false,
        isDecayed: false,
        currentHeat: 0.75,
        ageSeconds: 500000,
        halfLivesElapsed: 0.42,
        timeSinceEngagement: 500000,
        decayPercent: 25,
        description: "",
        timeUntilDecay: 1800000,
      };

      expect(formatDecayState(state)).toContain("Active");
      expect(formatDecayState(state)).toContain("75.0%");
    });
  });
});
