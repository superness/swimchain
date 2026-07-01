/**
 * Test setup for Vitest - Archiver Client
 */

import { afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
});

// Mock IndexedDB
const indexedDBMock = {
  open: () => ({
    onerror: null,
    onsuccess: null,
    onupgradeneeded: null,
    result: {
      objectStoreNames: {
        contains: () => false,
      },
      createObjectStore: () => ({
        createIndex: () => {},
      }),
      transaction: () => ({
        objectStore: () => ({
          put: () => ({ onsuccess: null, onerror: null }),
          get: () => ({ onsuccess: null, onerror: null }),
          getAll: () => ({ onsuccess: null, onerror: null }),
          index: () => ({
            getAll: () => ({ onsuccess: null, onerror: null }),
          }),
        }),
        oncomplete: null,
        onerror: null,
      }),
    },
  }),
};

Object.defineProperty(window, 'indexedDB', {
  value: indexedDBMock,
});

// Clear localStorage before each test
afterEach(() => {
  localStorageMock.clear();
});

// Mock matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});
