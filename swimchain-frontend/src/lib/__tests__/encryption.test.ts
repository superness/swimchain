/**
 * Tests for client-side encryption utilities
 *
 * Tests passphrase-based encryption (PBKDF2 + AES-GCM) and
 * space-key-based encryption for private spaces.
 */

import { describe, it, expect } from 'vitest';
import {
  isEncrypted,
  encryptContent,
  decryptContent,
  encryptPost,
  decryptPost,
  generatePassphrase,
  encryptMedia,
  decryptMedia,
  base64ToBytes,
  bytesToBase64,
  isPrivateEncrypted,
  encryptWithSpaceKey,
  decryptWithSpaceKey,
  encryptPrivatePost,
  decryptPrivatePost,
  encryptPrivateMedia,
  decryptPrivateMedia,
  encryptSpaceName,
  decryptSpaceName,
} from '../encryption';

describe('isEncrypted', () => {
  it('should return true for encrypted content', () => {
    expect(isEncrypted('[ENCRYPTED:v1:AAAA]')).toBe(true);
  });

  it('should return false for plain text', () => {
    expect(isEncrypted('hello world')).toBe(false);
  });

  it('should return false for empty string', () => {
    expect(isEncrypted('')).toBe(false);
  });
});

describe('passphrase encryption round-trip', () => {
  it('should encrypt and decrypt a message', async () => {
    const original = 'Hello, encrypted world!';
    const passphrase = 'test-passphrase-123';
    const encrypted = await encryptContent(original, passphrase);
    expect(encrypted).toContain('[ENCRYPTED:v1:');
    const decrypted = await decryptContent(encrypted, passphrase);
    expect(decrypted).toBe(original);
  });

  it('should fail decryption with wrong passphrase', async () => {
    const encrypted = await encryptContent('secret data', 'correct-passphrase');
    const result = await decryptContent(encrypted, 'wrong-passphrase');
    expect(result).toBeNull();
  });

  it('should handle empty content', async () => {
    const encrypted = await encryptContent('', 'passphrase');
    const decrypted = await decryptContent(encrypted, 'passphrase');
    expect(decrypted).toBe('');
  });

  it('should produce different ciphertexts for same plaintext', async () => {
    const plaintext = 'deterministic test';
    const a = await encryptContent(plaintext, 'key');
    const b = await encryptContent(plaintext, 'key');
    expect(a).not.toBe(b);
  });
});

describe('encryptPost / decryptPost', () => {
  it('should encrypt and decrypt a post with title and body', async () => {
    const { encryptedTitle, encryptedBody } = await encryptPost(
      'My Title',
      'This is the body content.',
      'post-passphrase'
    );
    expect(encryptedTitle).toBe('[Encrypted Post]');
    expect(isEncrypted(encryptedBody)).toBe(true);

    const result = await decryptPost(encryptedBody, 'post-passphrase');
    expect(result).not.toBeNull();
    expect(result!.title).toBe('My Title');
    expect(result!.body).toBe('This is the body content.');
  });

  it('should handle post with empty body', async () => {
    const { encryptedBody } = await encryptPost('Title Only', '', 'key');
    const result = await decryptPost(encryptedBody, 'key');
    expect(result).not.toBeNull();
    expect(result!.title).toBe('Title Only');
    expect(result!.body).toBe('');
  });
});

describe('generatePassphrase', () => {
  it('should generate a passphrase of the given length', () => {
    const passphrase = generatePassphrase(16);
    expect(passphrase.length).toBe(16);
  });

  it('should generate different passphrases on each call', () => {
    const a = generatePassphrase(16);
    const b = generatePassphrase(16);
    expect(a).not.toBe(b);
  });

  it('should use only alphanumeric chars (no ambiguous)', () => {
    const passphrase = generatePassphrase(100);
    // Should not contain ambiguous chars like 0/O, 1/l
    expect(passphrase).not.toMatch(/[0O1l]/);
  });
});

describe('media encryption round-trip', () => {
  it('should encrypt and decrypt binary data', async () => {
    const original = new Uint8Array([0x00, 0x01, 0x02, 0xFF, 0xFE]);
    const encrypted = await encryptMedia(original, 'media-key');
    const decrypted = await decryptMedia(encrypted, 'media-key');
    expect(decrypted).toEqual(original);
  });

  it('should fail decryption with wrong key', async () => {
    const data = new Uint8Array([1, 2, 3]);
    const encrypted = await encryptMedia(data, 'correct-key');
    const result = await decryptMedia(encrypted, 'wrong-key');
    expect(result).toBeNull();
  });
});

describe('base64 conversion', () => {
  it('should round-trip bytes via base64', () => {
    const original = new Uint8Array([72, 101, 108, 108, 111]);
    const encoded = bytesToBase64(original);
    expect(base64ToBytes(encoded)).toEqual(original);
  });

  it('should handle empty byte array', () => {
    expect(bytesToBase64(new Uint8Array(0))).toBe('');
    expect(base64ToBytes('')).toEqual(new Uint8Array(0));
  });
});

describe('isPrivateEncrypted', () => {
  it('should detect private-space encryption prefix', () => {
    expect(isPrivateEncrypted('[PRIVATE:v1:AAAA]')).toBe(true);
  });

  it('should return false for passphrase-encrypted content', () => {
    expect(isPrivateEncrypted('[ENCRYPTED:v1:AAAA]')).toBe(false);
  });

  it('should return false for plain text', () => {
    expect(isPrivateEncrypted('plain')).toBe(false);
  });
});

describe('space key encryption round-trip', () => {
  it('should encrypt and decrypt with a 32-byte space key', async () => {
    const spaceKey = crypto.getRandomValues(new Uint8Array(32));
    const original = 'Private space content';
    const encrypted = await encryptWithSpaceKey(original, spaceKey);
    expect(encrypted).toContain('[PRIVATE:v1:');

    const decrypted = await decryptWithSpaceKey(encrypted, spaceKey);
    expect(decrypted).toBe(original);
  });

  it('should fail decryption with wrong space key', async () => {
    const spaceKey = crypto.getRandomValues(new Uint8Array(32));
    const wrongKey = crypto.getRandomValues(new Uint8Array(32));
    const encrypted = await encryptWithSpaceKey('secret', spaceKey);
    const result = await decryptWithSpaceKey(encrypted, wrongKey);
    expect(result).toBeNull();
  });

  it('should reject invalid space key length', async () => {
    const shortKey = new Uint8Array(16);
    await expect(
      encryptWithSpaceKey('test', shortKey)
    ).rejects.toThrow('Space key must be 32 bytes');
  });
});

describe('encryptPrivatePost / decryptPrivatePost', () => {
  it('should encrypt and decrypt a private post', async () => {
    const spaceKey = crypto.getRandomValues(new Uint8Array(32));
    const { encryptedTitle, encryptedBody } = await encryptPrivatePost(
      'Private Title',
      'Private body text',
      spaceKey
    );
    expect(encryptedTitle).toBe('[Private]');
    expect(isPrivateEncrypted(encryptedBody)).toBe(true);

    const result = await decryptPrivatePost(encryptedBody, spaceKey);
    expect(result).not.toBeNull();
    expect(result!.title).toBe('Private Title');
    expect(result!.body).toBe('Private body text');
  });
});

describe('private media encryption round-trip', () => {
  it('should encrypt and decrypt binary data with space key', async () => {
    const spaceKey = crypto.getRandomValues(new Uint8Array(32));
    const original = new Uint8Array(256);
    for (let i = 0; i < 256; i++) original[i] = i;

    const encrypted = await encryptPrivateMedia(original, spaceKey);
    const decrypted = await decryptPrivateMedia(encrypted, spaceKey);
    expect(decrypted).toEqual(original);
  });
});

describe('encryptSpaceName / decryptSpaceName', () => {
  it('should encrypt and decrypt a space name', async () => {
    const spaceKey = crypto.getRandomValues(new Uint8Array(32));
    const name = 'My Project Team';
    const encrypted = await encryptSpaceName(name, spaceKey);
    const decrypted = await decryptSpaceName(encrypted, spaceKey);
    expect(decrypted).toBe(name);
  });

  it('should handle empty name', async () => {
    const spaceKey = crypto.getRandomValues(new Uint8Array(32));
    const encrypted = await encryptSpaceName('', spaceKey);
    const decrypted = await decryptSpaceName(encrypted, spaceKey);
    expect(decrypted).toBe('');
  });
});
