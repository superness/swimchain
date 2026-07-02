/**
 * Swimchain Protocol Module
 *
 * Protocol-level types, constants, and utilities for the Swimchain network.
 * This module defines the wire protocol: identity addressing, content format,
 * proof-of-work specifications, and encryption schemes.
 *
 * This is a lower-level module that does NOT depend on React, hooks,
 * providers, or components — safe to import in any context.
 *
 * @packageDocumentation
 */

// Identity protocol (address format, key types, validation)
export {
  ADDRESS_HRP,
  PUBLIC_KEY_LENGTH,
  SIGNATURE_LENGTH,
  SEED_LENGTH,
  ADDRESS_STRING_LENGTH_MIN,
  ADDRESS_STRING_LENGTH_MAX,
  looksLikeAddress,
  getAddressType,
  truncateAddress,
  type IdentityProtocol,
  type AddressValidationProtocol,
  type SignatureVerificationProtocol,
  type IdentityTypeProtocol,
} from './identity';

// Content protocol (IDs, types, serialization, constraints)
export {
  CONTENT_ID_PREFIX,
  CONTENT_HASH_HEX_LENGTH,
  CONTENT_ID_MIN_LENGTH,
  MAX_TITLE_BYTES,
  MAX_BODY_BYTES,
  MAX_REPLY_BYTES,
  ContentTypeProtocol,
  isContentId,
  validateContentSize,
  getContentTypeLabel,
  type ContentProtocol,
  type ThreadProtocol,
  type ReactionProtocol,
  type ReactionCountsProtocol,
  type EngagementPoolProtocol,
} from './content';

// Proof-of-Work protocol (identity PoW, action PoW, difficulty constants)
export {
  DEFAULT_IDENTITY_DIFFICULTY,
  TESTNET_IDENTITY_DIFFICULTY,
  IDENTITY_POW_INPUT_FORMAT,
  ActionTypeProtocol,
  DIFFICULTY_PROTOCOL,
  TESTNET_DIFFICULTY_PROTOCOL,
  PRODUCTION_CONFIG_PROTOCOL,
  TESTNET_CONFIG_PROTOCOL,
  DEV_CONFIG_PROTOCOL,
  getDifficultyProtocol,
  getConfigProtocol,
  estimateMiningTimeProtocol,
  formatMiningEstimateProtocol,
  getActionTypeLabel,
  type PoWConfigProtocol,
  type PoWChallengeProtocol,
  type PoWSolutionProtocol,
  type IdentityPoWSolutionProtocol,
} from './pow';

// Encryption protocol (content markers, key types, scheme detection)
export {
  ENCRYPTED_V1_PREFIX,
  PRIVATE_V1_PREFIX,
  ENCRYPTED_SUFFIX,
  AES_GCM_KEY_LENGTH,
  AES_GCM_IV_LENGTH,
  PBKDF2_ITERATIONS,
  PBKDF2_SALT_LENGTH,
  PBKDF2_HASH,
  NACL_BOX_NONCE_LENGTH,
  POLY1305_TAG_LENGTH,
  SPACE_KEY_LENGTH,
  X25519_PUBLIC_KEY_LENGTH,
  X25519_SECRET_KEY_LENGTH,
  isEncryptedProtocol,
  isPrivateEncryptedProtocol,
  parseEncryptedContent,
  type EncryptionProtocolVersion,
  type EncryptionSchemeProtocol,
  type EncryptedContentProtocol,
  type SpaceKeyExchangeProtocol,
} from './encryption';
