/**
 * NativeArgon2 - iOS Native Module for Argon2id PoW
 * Per SPEC_03: 64 MiB memory, 3 iterations, parallelism 2
 *
 * Uses Argon2Swift for real Argon2id computation.
 * Replaces the previous SHA-256 placeholder and fatalError.
 */

import Foundation
import React
import Argon2Swift

@objc(NativeArgon2)
class NativeArgon2: RCTEventEmitter {

  // MARK: - Properties

  private var isCancelled: Bool = false
  private let miningQueue = DispatchQueue(label: "com.swimchain.argon2.mining", qos: .userInitiated)
  private var hasListeners = false

  // MARK: - RCTEventEmitter

  override static func moduleName() -> String! {
    return "NativeArgon2"
  }

  override func supportedEvents() -> [String]! {
    return ["miningProgress"]
  }

  override static func requiresMainQueueSetup() -> Bool {
    return false
  }

  override func startObserving() {
    hasListeners = true
  }

  override func stopObserving() {
    hasListeners = false
  }

  // MARK: - Public Methods

  @objc
  func isAvailable(_ resolve: @escaping RCTPromiseResolveBlock,
                   reject: @escaping RCTPromiseRejectBlock) {
    resolve(true)
  }

  /**
   * Cross-platform deriveKey — accepts password + salt as plain strings,
   * returns derived key as hex string.
   *
   * Uses SPEC_03 Argon2id parameters: 64 MiB, 3 iterations, parallelism 2,
   * 32-byte hash length, 16-byte salt.
   *
   * Bridges Android (argon2kt) and iOS (Argon2Swift) implementations.
   */
  @objc
  func deriveKey(_ password: String,
                 salt: String,
                 resolve: @escaping RCTPromiseResolveBlock,
                 reject: @escaping RCTPromiseRejectBlock) {

    miningQueue.async {
      do {
        // SPEC_03: fixed parameters
        let memoryKib = 65536      // 64 MiB
        let iterations = 3
        let parallelism = 2
        let hashLength = 32

        // Convert password and salt to UTF-8 data
        guard let passwordData = password.data(using: .utf8),
              let saltData = salt.data(using: .utf8) else {
          reject("ENCODE_ERROR", "Failed to encode password or salt as UTF-8", nil)
          return
        }

        // Pad or truncate salt to exactly 16 bytes per SPEC_03
        var saltBytes = [UInt8](saltData)
        if saltBytes.count > 16 {
          saltBytes = Array(saltBytes[0..<16])
        } else if saltBytes.count < 16 {
          saltBytes.append(contentsOf: [UInt8](repeating: 0, count: 16 - saltBytes.count))
        }
        let paddedSalt = Data(saltBytes)

        let hash = try self.computeArgon2id(
          input: passwordData,
          salt: paddedSalt,
          memoryKib: memoryKib,
          iterations: iterations,
          parallelism: parallelism,
          hashLength: hashLength
        )

        // Return as hex string (platform-independent format)
        let hex = hash.map { String(format: "%02x", $0) }.joined()
        resolve(hex)
      } catch {
        reject("DERIVE_KEY_ERROR", error.localizedDescription, error)
      }
    }
  }

  @objc
  func hash(_ inputBase64: String,
            saltBase64: String,
            memoryKib: Int,
            iterations: Int,
            parallelism: Int,
            hashLength: Int,
            resolve: @escaping RCTPromiseResolveBlock,
            reject: @escaping RCTPromiseRejectBlock) {

    miningQueue.async {
      do {
        guard let input = Data(base64Encoded: inputBase64),
              let salt = Data(base64Encoded: saltBase64) else {
          reject("INVALID_INPUT", "Invalid base64 input", nil)
          return
        }

        let hash = try self.computeArgon2id(
          input: input,
          salt: salt,
          memoryKib: memoryKib,
          iterations: iterations,
          parallelism: parallelism,
          hashLength: hashLength
        )

        resolve(hash.base64EncodedString())
      } catch {
        reject("HASH_ERROR", error.localizedDescription, error)
      }
    }
  }

  @objc
  func mine(_ challengeBase64: String,
            difficulty: Int,
            memoryKib: Int,
            iterations: Int,
            parallelism: Int,
            hashLength: Int,
            startNonce: String,
            resolve: @escaping RCTPromiseResolveBlock,
            reject: @escaping RCTPromiseRejectBlock) {

    isCancelled = false
    let startTime = Date()

    miningQueue.async {
      do {
        guard let challenge = Data(base64Encoded: challengeBase64) else {
          reject("INVALID_CHALLENGE", "Invalid base64 challenge", nil)
          return
        }

        var nonce = UInt64(startNonce) ?? 0
        var attempts: UInt64 = 0
        let target = self.calculateTarget(difficulty: difficulty)
        var lastProgressTime = Date()

        while !self.isCancelled {
          // Build input: challenge + nonce (8 bytes LE)
          var input = challenge
          input.append(self.nonceToData(nonce))
          // Fixed salt for PoW (16 bytes)
          let salt = Data(repeating: 0, count: 16)

          let hash = try self.computeArgon2id(
            input: input,
            salt: salt,
            memoryKib: memoryKib,
            iterations: iterations,
            parallelism: parallelism,
            hashLength: hashLength
          )

          attempts += 1

          if self.meetsTarget(hash: hash, target: target) {
            let elapsedMs = Int(Date().timeIntervalSince(startTime) * 1000)

            let result: [String: Any] = [
              "nonce": String(nonce),
              "hash": hash.map { String(format: "%02x", $0) }.joined(),
              "attempts": attempts,
              "elapsedMs": elapsedMs
            ]

            resolve(result)
            return
          }

          let now = Date()
          if now.timeIntervalSince(lastProgressTime) >= 0.1 && self.hasListeners {
            let elapsedMs = Int(now.timeIntervalSince(startTime) * 1000)
            let hashesPerSecond = elapsedMs > 0
              ? Double(attempts) / (Double(elapsedMs) / 1000.0)
              : 0.0
            let expectedAttempts = Double(1 << difficulty)
            let remainingAttempts = max(0, expectedAttempts - Double(attempts))
            let estimatedRemainingMs = hashesPerSecond > 0
              ? Int(remainingAttempts / hashesPerSecond * 1000)
              : 0

            let progress: [String: Any] = [
              "currentNonce": String(nonce),
              "hashesPerSecond": hashesPerSecond,
              "elapsedMs": elapsedMs,
              "estimatedRemainingMs": estimatedRemainingMs
            ]

            self.sendEvent(withName: "miningProgress", body: progress)
            lastProgressTime = now
          }

          nonce += 1
        }

        reject("CANCELLED", "Mining was cancelled", nil)

      } catch {
        reject("MINING_ERROR", error.localizedDescription, error)
      }
    }
  }

  @objc
  func cancel() {
    isCancelled = true
  }

  // MARK: - Private Helpers

  /**
   * Compute real Argon2id hash using the Argon2Swift library.
   * Per SPEC_03: Argon2id with 64 MiB, 3 iterations, parallelism 2.
   */
  private func computeArgon2id(input: Data, salt: Data,
                                memoryKib: Int, iterations: Int,
                                parallelism: Int, hashLength: Int) throws -> Data {
    let result = try Argon2Swift.hashWithSalt(
      password: input,
      salt: salt,
      iterationCount: iterations,
      memoryCostKiB: memoryKib,
      parallelism: parallelism,
      length: hashLength,
      type: Argon2Type.id,
      version: Argon2Version.V13
    )
    return result.hashData
  }

  private func calculateTarget(difficulty: Int) -> Data {
    var target = Data(repeating: 0xFF, count: 32)
    let fullBytes = difficulty / 8
    let remainingBits = difficulty % 8
    for i in 0..<fullBytes {
      target[i] = 0x00
    }
    if remainingBits > 0 && fullBytes < 32 {
      target[fullBytes] = 0xFF >> remainingBits
    }
    return target
  }

  private func meetsTarget(hash: Data, target: Data) -> Bool {
    for i in 0..<min(hash.count, target.count) {
      if hash[i] < target[i] { return true }
      if hash[i] > target[i] { return false }
    }
    return true
  }

  private func nonceToData(_ nonce: UInt64) -> Data {
    var n = nonce.littleEndian
    return Data(bytes: &n, count: 8)
  }
}
