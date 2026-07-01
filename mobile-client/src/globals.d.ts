/**
 * Global type declarations for React Native environment.
 * These types are available at runtime but not included in tsconfig lib.
 */

// Fetch API
declare function fetch(
  input: string | URL | Request,
  init?: RequestInit
): Promise<Response>;

interface RequestInit {
  method?: string;
  headers?: Record<string, string>;
  body?: string | FormData | Blob | ArrayBuffer;
  mode?: 'cors' | 'no-cors' | 'same-origin';
  credentials?: 'omit' | 'same-origin' | 'include';
  cache?: 'default' | 'no-store' | 'reload' | 'no-cache' | 'force-cache';
  redirect?: 'follow' | 'error' | 'manual';
}

interface Response {
  ok: boolean;
  status: number;
  statusText: string;
  headers: Headers;
  json(): Promise<unknown>;
  text(): Promise<string>;
  blob(): Promise<Blob>;
}

interface Headers {
  get(name: string): string | null;
  has(name: string): boolean;
  forEach(callback: (value: string, name: string) => void): void;
}

// Timer functions
declare function setTimeout(
  callback: (...args: unknown[]) => void,
  ms?: number,
  ...args: unknown[]
): ReturnType<typeof setTimeout>;

declare function setInterval(
  callback: (...args: unknown[]) => void,
  ms?: number,
  ...args: unknown[]
): ReturnType<typeof setInterval>;

declare function clearTimeout(id: ReturnType<typeof setTimeout>): void;
declare function clearInterval(id: ReturnType<typeof setInterval>): void;

// TextEncoder/TextDecoder
declare class TextEncoder {
  encode(input?: string): Uint8Array;
}

declare class TextDecoder {
  decode(input?: ArrayBuffer | Uint8Array): string;
}

// URLSearchParams
declare class URLSearchParams {
  constructor(init?: string | Record<string, string> | URLSearchParams);
  append(name: string, value: string): void;
  delete(name: string): void;
  get(name: string): string | null;
  getAll(name: string): string[];
  has(name: string): boolean;
  set(name: string, value: string): void;
  toString(): string;
  forEach(callback: (value: string, name: string) => void): void;
}

// Console
interface Console {
  log(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
  info(...args: unknown[]): void;
  debug(...args: unknown[]): void;
}
declare const console: Console;

// Global object
declare namespace globalThis {
  const fetch: typeof fetch;
  const setTimeout: typeof setTimeout;
  const setInterval: typeof setInterval;
  const clearTimeout: typeof clearTimeout;
  const clearInterval: typeof clearInterval;
  const console: Console;
}
