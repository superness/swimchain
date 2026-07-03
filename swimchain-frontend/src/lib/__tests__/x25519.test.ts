/**
 * Tests for X25519 key derivation and encryption utilities
 *
 * Tests the X25519-based ECDH key exchange used for sharing
 * private-space encryption keys between members.
 */

import { describe, it, expect } from 'vitest';
import {
  deriveX25519Keys,
  generateSpaceKey,
  encryptSpaceKeyForRecipient,
  decryptSpaceKey,
  x25519SharedSecret,
} from '../x25519';
import { bytesToHex, hexToBytes } from '../action-pow';

/**
 * Create a deterministic 32-byte seed for testing
 */
function makeSeed(value: number): Uint8Array {
  const seed = new Uint8Array(32);
  for (let i = 0; i < 32; i++) seed[i] = value;
  return seed;
}

describe('deriveX25519Keys', () => {
  it('should produce a 32-byte secret and 32-byte public key', () => {
    const seed = makeSeed(0xaa);
    const keys = deriveX25519Keys(seed);
    expect(keys.secretKey.length).toBe(32);
    expect(keys.publicKey.length).toBe(32);
  });

  it('should produce deterministic keys for same seed', () => {
    const seed = makeSeed(0xbb);
    const a = deriveX25519Keys(seed);
    const b = deriveX25519Keys(seed);
    expect(a.secretKey).toEqual(b.secretKey);
    expect(a.publicKey).toEqual(b.publicKey);
  });

  it('should produce different keys for different seeds', () => {
    const keys1 = deriveX25519Keys(makeSeed(0x01));
    const keys2 = deriveX25519Keys(makeSeed(0x02));
    expect(keys1.secretKey).not.toEqual(keys2.secretKey);
    expect(keys1.publicKey).not.toEqual(keys2.publicKey);
  });
});

describe('generateSpaceKey', () => {
  it('should produce a 32-byte random key', () => {
    const key = generateSpaceKey();
    expect(key.length).toBe(32);
  });

  it('should produce different keys each call', () => {
    const a = generateSpaceKey();
    const b = generateSpaceKey();
    expect(a).not.toEqual(b);
  });
});

describe('encryptSpaceKeyForRecipient / decryptSpaceKeyForRecipient', () => {
  it('should round-trip space key encryption', () => {
    const senderSeed = makeSeed(0x10);
    const recipientSeed = makeSeed(0x20);

    const sender = deriveX25519Keys(senderSeed);
    const recipient = deriveX25519Keys(recipientSeed);

    const spaceKey = generateSpaceKey();

    const encrypted = encryptSpaceKeyForRecipient(
      spaceKey,
      recipient.publicKey,
      sender.secretKey
    );

    const decrypted = decryptSpaceKey(
      encrypted,
      sender.publicKey,
      recipient.secretKey
    );

    expect(decrypted).toEqual(spaceKey);
  });

  it('should fail decryption with wrong recipient key', () => {
    const senderSeed = makeSeed(0x30);
    const recipientSeed = makeSeed(0x40);
    const attackerSeed = makeSeed(0x50);

    const sender = deriveX25519Keys(senderSeed);
    const recipient = deriveX25519Keys(recipientSeed);
    const attacker = deriveX25519Keys(attackerSeed);

    const spaceKey = generateSpaceKey();

    const encrypted = encryptSpaceKeyForRecipient(
      spaceKey,
      recipient.publicKey,
      sender.secretKey
    );

    // Attacker tries to decrypt with their own key - should produce null (auth fails)
    const decrypted = decryptSpaceKey(
      encrypted,
      sender.publicKey,
      attacker.secretKey
    );

    expect(decrypted).toBeNull();
  });
});

describe('x25519SharedSecret', () => {
  it('should produce shared secret between two parties', () => {
    // Generate deterministic keys for Alice and Bob
    const aliceSeed = makeSeed(0xa1);
    const bobSeed = makeSeed(0xb0);

    const alice = deriveX25519Keys(aliceSeed);
    const bob = deriveX25519Keys(bobSeed);

    // Both compute the shared key
    const shared1 = x25519SharedSecret(alice.secretKey, bob.publicKey);
    const shared2 = x25519SharedSecret(bob.secretKey, alice.publicKey);

    expect(shared1.length).toBe(32);
    expect(shared1).toEqual(shared2);
  });

  it('should produce different shared keys with different parties', () => {
    const alice = deriveX25519Keys(makeSeed(0xa1));
    const bob = deriveX25519Keys(makeSeed(0xb0));
    const charlie = deriveX25519Keys(makeSeed(0xc0));

    const aliceBob = x25519SharedSecret(alice.secretKey, bob.publicKey);
    const aliceCharlie = x25519SharedSecret(alice.secretKey, charlie.publicKey);

    expect(aliceBob).not.toEqual(aliceCharlie);
  });
});

describe('hexToBytes / bytesToHex', () => {
  it('should round-trip hex conversion', () => {
    const original = new Uint8Array([0xde, 0xad, 0xbe, 0xef, 0x01, 0x23]);
    const hex = bytesToHex(original);
    expect(hexToBytes(hex)).toEqual(original);
  });

  it('should handle empty input', () => {
    expect(bytesToHex(new Uint8Array(0))).toBe('');
    expect(hexToBytes('')).toEqual(new Uint8Array(0));
  });

  it('should produce lowercase hex', () => {
    const hex = bytesToHex(new Uint8Array([0xAB, 0xCD]));
    expect(hex).toBe('abcd');
    expect(hex).toBe(hex.toLowerCase());
  });
});
