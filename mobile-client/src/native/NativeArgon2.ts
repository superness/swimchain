/**
 * Native Argon2id Module Interface
 * Bridges to platform-specific implementations for mobile PoW
 * Per SPEC_03: Argon2id with 64 MiB, 3 iterations, parallelism 2
 */

import { NativeModules, NativeEventEmitter, Platform } from 'react-native';
import { ARGON2_CONFIG } from '../constants/protocol';

// Configuration for Argon2id hashing
export interface Argon2Config {
  memoryKib: number; // 65536 (64 MiB)
  iterations: number; // 3
  parallelism: number; // 2
  hashLength: number; // 32
}

// Progress updates during mining
export interface MiningProgress {
  currentNonce: string; // bigint as string for RN bridge
  hashesPerSecond: number;
  elapsedMs: number;
  estimatedRemainingMs: number;
}

// Successful PoW solution
export interface PowSolution {
  nonce: string; // bigint as string for RN bridge
  hash: string; // hex-encoded hash
  attempts: number;
  elapsedMs: number;
}

// Native module interface
interface NativeArgon2Bridge {
  hash(
    input: string, // base64-encoded
    salt: string, // base64-encoded
    memoryKib: number,
    iterations: number,
    parallelism: number,
    hashLength: number
  ): Promise<string>; // base64-encoded result

  mine(
    challenge: string, // base64-encoded
    difficulty: number,
    memoryKib: number,
    iterations: number,
    parallelism: number,
    hashLength: number,
    startNonce: string // bigint as string
  ): Promise<{
    nonce: string;
    hash: string;
    attempts: number;
    elapsedMs: number;
  }>;

  cancel(): void;

  isAvailable(): Promise<boolean>;
}

// Get native module
const NativeArgon2Module = NativeModules.NativeArgon2 as NativeArgon2Bridge | undefined;

// Event emitter for progress updates
const eventEmitter = NativeArgon2Module
  ? new NativeEventEmitter(NativeModules.NativeArgon2)
  : null;

// Progress callback type
export type MiningProgressCallback = (progress: MiningProgress) => void;

// Active progress listener
let progressListener: ReturnType<NativeEventEmitter['addListener']> | null = null;

/**
 * NativeArgon2 - TypeScript wrapper for native Argon2id module
 */
export const NativeArgon2 = {
  /**
   * Check if native module is available
   */
  isAvailable(): boolean {
    return NativeArgon2Module !== undefined;
  },

  /**
   * Compute Argon2id hash
   */
  async hash(
    input: Uint8Array,
    salt: Uint8Array,
    config: Argon2Config = ARGON2_CONFIG
  ): Promise<Uint8Array> {
    if (!NativeArgon2Module) {
      throw new Error('NativeArgon2 module not available');
    }

    const inputBase64 = uint8ArrayToBase64(input);
    const saltBase64 = uint8ArrayToBase64(salt);

    const resultBase64 = await NativeArgon2Module.hash(
      inputBase64,
      saltBase64,
      config.memoryKib,
      config.iterations,
      config.parallelism,
      config.hashLength
    );

    return base64ToUint8Array(resultBase64);
  },

  /**
   * Mine for a valid PoW solution
   */
  async mine(
    challenge: Uint8Array,
    difficulty: number,
    config: Argon2Config = ARGON2_CONFIG,
    onProgress?: MiningProgressCallback,
    startNonce: bigint = 0n
  ): Promise<PowSolution> {
    if (!NativeArgon2Module) {
      throw new Error('NativeArgon2 module not available');
    }

    // Set up progress listener
    if (onProgress && eventEmitter) {
      progressListener?.remove();
      progressListener = eventEmitter.addListener('miningProgress', (data: MiningProgress) => {
        onProgress(data);
      });
    }

    try {
      const challengeBase64 = uint8ArrayToBase64(challenge);

      const result = await NativeArgon2Module.mine(
        challengeBase64,
        difficulty,
        config.memoryKib,
        config.iterations,
        config.parallelism,
        config.hashLength,
        startNonce.toString()
      );

      return result;
    } finally {
      // Clean up progress listener
      progressListener?.remove();
      progressListener = null;
    }
  },

  /**
   * Cancel ongoing mining operation
   */
  cancel(): void {
    if (NativeArgon2Module) {
      NativeArgon2Module.cancel();
    }
    progressListener?.remove();
    progressListener = null;
  },

  /**
   * Check native module availability asynchronously
   */
  async checkAvailability(): Promise<boolean> {
    if (!NativeArgon2Module) {
      return false;
    }
    try {
      return await NativeArgon2Module.isAvailable();
    } catch {
      return false;
    }
  },
};

// Utility functions for base64 encoding/decoding
function uint8ArrayToBase64(bytes: Uint8Array): string {
  const binary = String.fromCharCode(...bytes);
  return btoa(binary);
}

function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// Polyfill btoa/atob for React Native if needed
if (typeof btoa === 'undefined') {
  (global as any).btoa = (str: string): string => {
    return Buffer.from(str, 'binary').toString('base64');
  };
}

if (typeof atob === 'undefined') {
  (global as any).atob = (str: string): string => {
    return Buffer.from(str, 'base64').toString('binary');
  };
}

export default NativeArgon2;
