/**
 * @swimchain/frontend - Shared components, hooks, and utilities for Swimchain clients
 *
 * This package provides:
 * - Action PoW (Argon2id) for posts/replies
 * - Content encryption utilities
 * - Identity management (providers, hooks, components)
 * - WASM bindings for cryptographic operations
 */

// Re-export everything
export * from './lib';
export * from './hooks';
export * from './providers';
export * from './components';

// Re-export WASM utilities (as namespace to avoid conflicts)
export * as wasm from './wasm/loader';

// Re-export types
export * from './types';
