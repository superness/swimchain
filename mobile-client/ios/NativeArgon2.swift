/**
 * NativeArgon2 - iOS Native Module for Argon2id PoW and Password Hashing
 *
 * Per SPEC_03 (docs/STATE_OF_SWIMCHAIN.md 2026-07-01 parity audit):
 *   - Salt length: 16 bytes
 *   - Memory cost: 64 MiB (65536 KiB)
 *   - Iterations:  3
 *   - Parallelism: 2
 *   - Hash length: 32 bytes
 *
 * Uses Argon2Swift for real Argon2id computation.
 * Replaces the previous SHA-256 placeholder and fatalError.
 *
 * Platform-conditional: iOS builds only; Android/JVM has equivalent via argon2kt.
 */

import Foundation
import React
import Argon2Swift

@objc(NativeArgon2)
class NativeArgon2: RCTEventEmitter {

  // MARK: - Constants (SPEC_03)

  private let defaultSaltLength = 16
  private let defaultMemoryKib = 64 * 1024  // 64 MiB
  private let defaultIterations = 3
  private let defaultParallelism = 2
  private let defaultHashLength = 32

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

  // MARK: - Password Hashing API (hash + verify)

  /**
   * Hash a plaintext password with Argon2id using SPEC_03 parameters.
   * Generates a random 16-byte salt per call.
   *
   * Returns a standard Argon2 encoded hash string:
   *   $argon2id$v=19$m=65536,t=3,p=2$<base64-salt>$<base64-hash>
   *
   * Uses Argon2Swift (iOS platform path).
   * Android/JVM counterpart uses argon2kt.
   */
  @objc
  func hashPassword(_ password: String,
                    resolve: @escaping RCTPromiseResolveBlock,
                    reject: @escaping RCTPromiseRejectBlock) {
    miningQueue.async {
      do {
        let passwordData = Data(password.utf8)
        var salt = Data(count: self.defaultSaltLength)
        _ = salt.withUnsafeMutableBytes { bytes in
          arc4random_buf(bytes.baseAddress, self.defaultSaltLength)
        }

        let result = try Argon2Swift.hashWithSalt(
          password: passwordData,
          salt: salt,
          iterationCount: self.defaultIterations,
          memoryCostKiB: self.defaultMemoryKib,
          parallelism: self.defaultParallelism,
          length: self.defaultHashLength,
          type: Argon2Type.id,
          version: Argon2Version.V13
        )

        let encoded = self.buildEncodedString(salt: salt, hash: result.hashData)
        resolve(encoded)
      } catch {
        reject("HASH_ERROR", error.localizedDescription, error)
      }
    }
  }

  /**
   * Verify a password against an Argon2 encoded hash string.
   * Parses the salt and parameters from the encoded string, re-derives
   * the hash in constant time.
   */
  @objc
  func verifyPassword(_ password: String,
                      encodedHash: String,
                      resolve: @escaping RCTPromiseResolveBlock,
                      reject: @escaping RCTPromiseRejectBlock) {
    miningQueue.async {
      do {
        let result = self.verifyArgon2Hash(password: password, encodedHash: encodedHash)
        resolve(result)
      } catch {
        resolve(false)
      }
    }
  }

  // MARK: - PoW Mining API

  @objc
  func isAvailable(_ resolve: @escaping RCTPromiseResolveBlock,
                   reject: @escaping RCTPromiseRejectBlock) {
    resolve(true)
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

  /**
   * Build the standard Argon2 encoded string:
   * $argon2id$v=19$m=<memory>,t=<iters>,p=<parallelism>$<base64-salt>$<base64-hash>
   */
  private func buildEncodedString(salt: Data, hash: Data) -> String {
    let saltB64 = salt.base64EncodedString()
      .replacingOccurrences(of: "=", with: "")
    let hashB64 = hash.base64EncodedString()
      .replacingOccurrences(of: "=", with: "")
    return "$argon2id$v=19$m=\(defaultMemoryKib),t=\(defaultIterations),p=\(defaultParallelism)$\(saltB64)$\(hashB64)"
  }

  /**
   * Parse an Argon2 encoded hash string and verify a password against it.
   * Format: $argon2id$v=19$m=65536,t=3,p=2$<salt>$<hash>
   */
  private func verifyArgon2Hash(password: String, encodedHash: String) throws -> Bool {
    let parts = encodedHash.components(separatedBy: "$")
    guard parts.count >= 6,
          parts[1] == "argon2id" else {
      return false
    }

    // Parse parameters
    let params = parts[3].components(separatedBy: ",")
    var memoryKib = defaultMemoryKib
    var iterations = defaultIterations
    var parallelism = defaultParallelism
    for param in params {
      if param.hasPrefix("m=") {
        memoryKib = Int(param.dropFirst(2)) ?? defaultMemoryKib
      } else if param.hasPrefix("t=") {
        iterations = Int(param.dropFirst(2)) ?? defaultIterations
      } else if param.hasPrefix("p=") {
        parallelism = Int(param.dropFirst(2)) ?? defaultParallelism
      }
    }

    guard let salt = Data(base64Encoded: parts[4]),
          let expectedHash = Data(base64Encoded: parts[5]) else {
      return false
    }

    let passwordData = Data(password.utf8)

    let actualHash = try Argon2Swift.hashWithSalt(
      password: passwordData,
      salt: salt,
      iterationCount: iterations,
      memoryCostKiB: memoryKib,
      parallelism: parallelism,
      length: expectedHash.count,
      type: Argon2Type.id,
      version: Argon2Version.V13
    )

    // Constant-time comparison
    return constantTimeEquals(actualHash.hashData, expectedHash)
  }

  private func constantTimeEquals(_ a: Data, _ b: Data) -> Bool {
    guard a.count == b.count else { return false }
    var diff: UInt8 = 0
    for i in 0..<a.count {
      diff |= a[i] ^ b[i]
    }
    return diff == 0
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
