/**
 * Web Worker for PBKDF2 key derivation
 *
 * Offloads CPU-intensive PBKDF2 computation to prevent main thread blocking.
 */

const PBKDF2_ITERATIONS = 100000;

export interface DeriveKeyRequest {
  type: 'deriveKey';
  id: string;
  passphrase: string;
  salt: Uint8Array;
}

export interface DeriveKeyResponse {
  type: 'deriveKeyResult';
  id: string;
  key?: ArrayBuffer;
  error?: string;
}

export type WorkerRequest = DeriveKeyRequest;
export type WorkerResponse = DeriveKeyResponse;

/**
 * Derive an AES-GCM key from a passphrase using PBKDF2 (worker-side)
 */
async function deriveKeyInWorker(passphrase: string, salt: Uint8Array): Promise<ArrayBuffer> {
  const encoder = new TextEncoder();
  const passphraseKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  const derivedKey = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt.buffer.slice(salt.byteOffset, salt.byteOffset + salt.byteLength) as ArrayBuffer,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    passphraseKey,
    { name: 'AES-GCM', length: 256 },
    true, // extractable - we need to export it
    ['encrypt', 'decrypt']
  );

  // Export the key as raw bytes to send back to main thread
  return crypto.subtle.exportKey('raw', derivedKey);
}

// Declare self as a worker global scope for proper typing
declare const self: Worker;

// Worker message handler
self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;

  if (request.type === 'deriveKey') {
    try {
      const keyBuffer = await deriveKeyInWorker(request.passphrase, request.salt);
      const response: DeriveKeyResponse = {
        type: 'deriveKeyResult',
        id: request.id,
        key: keyBuffer,
      };
      // Transfer ownership of the ArrayBuffer for efficiency
      self.postMessage(response, [keyBuffer]);
    } catch (err) {
      const response: DeriveKeyResponse = {
        type: 'deriveKeyResult',
        id: request.id,
        error: err instanceof Error ? err.message : 'Unknown error',
      };
      self.postMessage(response);
    }
  }
};
