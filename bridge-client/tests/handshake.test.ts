/**
 * Handshake Protocol Test Suite — VERSION/VERACK Protocol (SPEC_06 §5.3)
 *
 * Tests cover state machine, VERSION serialization/validation, outbound and
 * inbound handshake flows, timeout handling, malformed message rejection,
 * self-connection detection, and successful bidirectional channel establishment.
 */

import { describe, it, expect } from 'vitest';

// ============================================================================
// Protocol Constants
// ============================================================================
const PROTOCOL_VERSION = 1;
const VERSION_TIMEOUT_SECS = 10;
const HANDSHAKE_TIMEOUT_SECS = 30;

// ============================================================================
// Types
// ============================================================================
enum MessageType { Version = 0x00, Verack = 0x01, Ping = 0x02 }

interface VersionPayload {
  protocolVersion: number;
  services: number;
  timestamp: number;
  nonce: number;
  userAgent: string;
  startHeight: number;
  relay: boolean;
  publicKey: Uint8Array;
}

interface MessageEnvelope { messageType: MessageType; payload: Uint8Array }

type ConnectionDirection = 'outbound' | 'inbound';

enum ConnectionState {
  Connected = 'Connected', VersionSent = 'VersionSent', VersionReceived = 'VersionReceived',
  VerackSent = 'VerackSent', Established = 'Established', Closed = 'Closed',
}

interface PeerInfo {
  nodeId: Uint8Array; protocolVersion: number; services: number; userAgent: string;
  startHeight: number; relay: boolean; nonce: number; timestamp: number;
}

// ============================================================================
// TransportError
// ============================================================================
class TransportError extends Error {
  constructor(msg: string) { super(msg); this.name = 'TransportError'; }
  static VersionTimeout = (s: number) => new TransportError(`VERSION not received within ${s} seconds`);
  static HandshakeTimeout = (s: number) => new TransportError(`Handshake not completed within ${s} seconds`);
  static ConnectionClosed = () => new TransportError('Connection closed by peer');
  static SelfConnection = () => new TransportError('Self-connection detected (same nonce)');
  static VersionMismatch = (p: number, o: number) => new TransportError(`Protocol version mismatch: peer=${p}, ours=${o}`);
  static InvalidStateTransition = (f: string, t: string) => new TransportError(`Invalid state transition from ${f} to ${t}`);
  static UnexpectedMessage = (e: string, g: string) => new TransportError(`Unexpected message: expected ${e}, got ${g}`);
}

// ============================================================================
// State Machine
// ============================================================================
class ConnectionStateMachine {
  private state: ConnectionState = ConnectionState.Connected;
  constructor(private direction: ConnectionDirection) {}
  get currentState() { return this.state; }
  get isEstablished() { return this.state === ConnectionState.Established; }
  get isClosed() { return this.state === ConnectionState.Closed; }

  transition(to: ConnectionState) {
    const ok = this.direction === 'outbound'
      ? this.isValidOutbound(to) : this.isValidInbound(to);
    if (!ok) throw TransportError.InvalidStateTransition(this.state, to);
    this.state = to;
  }

  private isValidOutbound(to: ConnectionState) {
    switch (this.state) {
      case ConnectionState.Connected: return to === ConnectionState.VersionSent || to === ConnectionState.Closed;
      case ConnectionState.VersionSent: return to === ConnectionState.VerackSent || to === ConnectionState.Closed;
      case ConnectionState.VerackSent: return to === ConnectionState.Established || to === ConnectionState.Closed;
      default: return to === ConnectionState.Closed;
    }
  }

  private isValidInbound(to: ConnectionState) {
    switch (this.state) {
      case ConnectionState.Connected: return to === ConnectionState.VersionReceived || to === ConnectionState.Closed;
      case ConnectionState.VersionReceived: return to === ConnectionState.VerackSent || to === ConnectionState.Closed;
      case ConnectionState.VerackSent: return to === ConnectionState.Established || to === ConnectionState.Closed;
      default: return to === ConnectionState.Closed;
    }
  }
}

// ============================================================================
// Serialization
// ============================================================================
function serializeVersionPayload(p: VersionPayload): Uint8Array {
  const ua = new TextEncoder().encode(p.userAgent);
  const buf = new Uint8Array(1 + 8 + 8 + 8 + 1 + 4 + 1 + 32 + 1 + ua.length);
  const v = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let o = 0;
  buf[o++] = p.protocolVersion;
  v.setBigUint64(o, BigInt(p.services), false); o += 8;
  v.setBigUint64(o, BigInt(p.timestamp), false); o += 8;
  v.setBigUint64(o, BigInt(p.nonce), false); o += 8;
  buf[o++] = p.relay ? 1 : 0;
  v.setUint32(o, p.startHeight, false); o += 4;
  buf[o++] = 32;
  buf.set(p.publicKey, o); o += 32;
  buf[o++] = ua.length;
  buf.set(ua, o);
  return buf;
}

function parseVersionPayload(bytes: Uint8Array): VersionPayload {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let o = 0;
  const protocolVersion = bytes[o++];
  const services = Number(v.getBigUint64(o, false)); o += 8;
  const timestamp = Number(v.getBigUint64(o, false)); o += 8;
  const nonce = Number(v.getBigUint64(o, false)); o += 8;
  const relay = bytes[o++] === 1;
  const startHeight = v.getUint32(o, false); o += 4;
  o++; // pubkeyLen = 32
  const publicKey = bytes.slice(o, o + 32); o += 32;
  const uaLen = bytes[o++];
  const userAgent = new TextDecoder().decode(bytes.slice(o, o + uaLen));
  return { protocolVersion, services, timestamp, nonce, userAgent, startHeight, relay, publicKey };
}

function validateVersion(p: VersionPayload, ourNonce: number) {
  if (p.nonce === ourNonce) throw TransportError.SelfConnection();
  if (p.protocolVersion !== PROTOCOL_VERSION) throw TransportError.VersionMismatch(p.protocolVersion, PROTOCOL_VERSION);
}

// ============================================================================
// SimulatedConnection — in-memory buffer pair for test isolation
// ============================================================================
class SimulatedConnection {
  private sm: ConnectionStateMachine;
  private sentB: MessageEnvelope[] = [];
  private recvB: MessageEnvelope[] = [];
  private pi: PeerInfo | null = null;
  private cl = false;

  constructor(dir: ConnectionDirection, public readonly nonce: number) {
    this.sm = new ConnectionStateMachine(dir);
  }

  get state() { return this.sm.currentState; }
  get isEstablished() { return this.sm.isEstablished; }
  get sent() { return this.sentB; }
  get peer() { return this.pi; }

  enqueueRecv(m: MessageEnvelope) { this.recvB.push(m); }
  send(m: MessageEnvelope) { this.sentB.push(m); }

  recv(): MessageEnvelope | null {
    return this.cl ? null : (this.recvB.shift() ?? null);
  }

  close() { this.cl = true; }
  transitionState(s: ConnectionState) { this.sm.transition(s); }
  setPeerInfo(i: PeerInfo) { this.pi = i; }
  markVersionSent() {}
}

// ============================================================================
// Handshake Logic
// ============================================================================
function buildVersionPayload(
  info: { services: number; userAgent: string; relay: boolean; publicKey: Uint8Array; height: number },
  nonce: number,
): VersionPayload {
  return {
    protocolVersion: PROTOCOL_VERSION, services: info.services,
    timestamp: Math.floor(Date.now() / 1000), nonce,
    userAgent: info.userAgent, startHeight: info.height,
    relay: info.relay, publicKey: info.publicKey,
  };
}

function buildPeerInfo(p: VersionPayload): PeerInfo {
  return {
    nodeId: new Uint8Array(32), protocolVersion: p.protocolVersion,
    services: p.services, userAgent: p.userAgent, startHeight: p.startHeight,
    relay: p.relay, nonce: p.nonce, timestamp: p.timestamp,
  };
}

/**
 * Outbound: Send VERSION → Recv VERSION → Validate → Send VERACK → Recv VERACK
 */
function performOutboundHandshake(
  conn: SimulatedConnection,
  info: { services: number; userAgent: string; relay: boolean; publicKey: Uint8Array; height: number },
): PeerInfo {
  conn.send({ messageType: MessageType.Version, payload: serializeVersionPayload(buildVersionPayload(info, conn.nonce)) });
  conn.transitionState(ConnectionState.VersionSent);
  conn.markVersionSent();

  const pv = conn.recv();
  if (!pv) throw TransportError.VersionTimeout(VERSION_TIMEOUT_SECS);
  if (pv.messageType !== MessageType.Version) throw TransportError.UnexpectedMessage('Version', `0x${pv.messageType.toString(16).padStart(2,'0')}`);
  const pp = parseVersionPayload(pv.payload);
  validateVersion(pp, conn.nonce);
  conn.setPeerInfo(buildPeerInfo(pp));

  conn.send({ messageType: MessageType.Verack, payload: new Uint8Array(0) });
  conn.transitionState(ConnectionState.VerackSent);

  const pa = conn.recv();
  if (!pa) throw TransportError.HandshakeTimeout(HANDSHAKE_TIMEOUT_SECS);
  if (pa.messageType !== MessageType.Verack) throw TransportError.UnexpectedMessage('Verack', `0x${pa.messageType.toString(16).padStart(2,'0')}`);

  conn.transitionState(ConnectionState.Established);
  return conn.peer!;
}

/**
 * Inbound, step 1-2: Recv VERSION → Validate → Send VERSION + VERACK
 * Returns peerInfo + a finishVerack() that waits for peer VERACK.
 *
 * This split lets us interleave with outbound in synchronous single-threaded tests.
 */
function performInboundHandshakePartial(
  conn: SimulatedConnection,
  info: { services: number; userAgent: string; relay: boolean; publicKey: Uint8Array; height: number },
): { peerInfo: PeerInfo; finishVerack: () => PeerInfo } {
  const pv = conn.recv();
  if (!pv) throw TransportError.VersionTimeout(VERSION_TIMEOUT_SECS);
  if (pv.messageType !== MessageType.Version) throw TransportError.UnexpectedMessage('Version', `0x${pv.messageType.toString(16).padStart(2,'0')}`);
  const pp = parseVersionPayload(pv.payload);
  validateVersion(pp, conn.nonce);
  const peerInfo = buildPeerInfo(pp);
  conn.setPeerInfo(peerInfo);
  conn.transitionState(ConnectionState.VersionReceived);

  conn.send({ messageType: MessageType.Version, payload: serializeVersionPayload(buildVersionPayload(info, conn.nonce)) });
  conn.send({ messageType: MessageType.Verack, payload: new Uint8Array(0) });
  conn.transitionState(ConnectionState.VerackSent);

  const finishVerack = (): PeerInfo => {
    const pa = conn.recv();
    if (!pa) throw TransportError.HandshakeTimeout(HANDSHAKE_TIMEOUT_SECS);
    if (pa.messageType !== MessageType.Verack) throw TransportError.UnexpectedMessage('Verack', `0x${pa.messageType.toString(16).padStart(2,'0')}`);
    conn.transitionState(ConnectionState.Established);
    return peerInfo;
  };

  return { peerInfo, finishVerack };
}

/**
 * Full inbound handshake (use when VERACK is already in recv buffer).
 */
function performInboundHandshake(conn: SimulatedConnection, info: Parameters<typeof performInboundHandshakePartial>[1]): PeerInfo {
  const { finishVerack } = performInboundHandshakePartial(conn, info);
  return finishVerack();
}

/**
 * Interleave an outbound + inbound handshake on two "wired" connections.
 *
 * Since both functions are synchronous and single-threaded, we manually
 * interleave: outbound sends VERSION → inbound receives it → inbound sends
 * VERSION+VERACK → outbound receives VERSION → outbound sends VERACK →
 * inbound receives VERACK → outbound receives VERACK.
 */
function interleaveHandshake(
  outConn: SimulatedConnection,
  inConn: SimulatedConnection,
  outInfo: typeof DEFAULT_LOCAL_INFO,
  inInfo: typeof DEFAULT_LOCAL_INFO,
): { outboundPeer: PeerInfo; inboundPeer: PeerInfo } {
  // Wire sends
  const oSend = outConn.send.bind(outConn);
  const iSend = inConn.send.bind(inConn);
  outConn.send = (m) => { oSend(m); inConn.enqueueRecv(m); };
  inConn.send = (m) => { iSend(m); outConn.enqueueRecv(m); };

  // 1. Outbound sends VERSION (wired → inbound's buffer)
  const ov = buildVersionPayload(outInfo, outConn.nonce);
  outConn.send({ messageType: MessageType.Version, payload: serializeVersionPayload(ov) });
  outConn.transitionState(ConnectionState.VersionSent);

  // 2. Inbound receives VERSION, validates, sends VERSION+VERACK (wired → outbound's buffer)
  const { peerInfo, finishVerack } = performInboundHandshakePartial(inConn, inInfo);

  // 3. Outbound receives server's VERSION
  const sv = outConn.recv()!;
  expect(sv.messageType).toBe(MessageType.Version);
  const sp = parseVersionPayload(sv.payload);
  validateVersion(sp, outConn.nonce);
  outConn.setPeerInfo(buildPeerInfo(sp));

  // 4. Outbound sends VERACK (wired → inbound's buffer)
  outConn.send({ messageType: MessageType.Verack, payload: new Uint8Array(0) });
  outConn.transitionState(ConnectionState.VerackSent);

  // 5. Outbound receives server's VERACK
  const cv = outConn.recv()!;
  expect(cv.messageType).toBe(MessageType.Verack);
  outConn.transitionState(ConnectionState.Established);

  // 6. Inbound finishes — receives client's VERACK
  const inboundPeer = finishVerack();

  return { outboundPeer: outConn.peer!, inboundPeer };
}

// ============================================================================
// Fixtures
// ============================================================================
const DEFAULT_LOCAL_INFO = {
  services: 0x0001, userAgent: 'Swimchain/0.1.0', relay: true,
  publicKey: new Uint8Array(32).fill(0xab), height: 100,
};
const ALICE_NONCE = 111111;
const BOB_NONCE = 222222;

// ============================================================================
// TESTS
// ============================================================================
describe('Handshake Protocol — VERSION/VERACK (SPEC_06 §5.3)', () => {

  // ==================================================================
  describe('Connection State Machine', () => {
    it('starts in Connected state', () => {
      const sm = new ConnectionStateMachine('outbound');
      expect(sm.currentState).toBe(ConnectionState.Connected);
      expect(sm.isEstablished).toBe(false);
      expect(sm.isClosed).toBe(false);
    });

    it('follows valid outbound transitions: Connected → VersionSent → VerackSent → Established', () => {
      const sm = new ConnectionStateMachine('outbound');
      sm.transition(ConnectionState.VersionSent);
      expect(sm.currentState).toBe(ConnectionState.VersionSent);
      sm.transition(ConnectionState.VerackSent);
      expect(sm.currentState).toBe(ConnectionState.VerackSent);
      sm.transition(ConnectionState.Established);
      expect(sm.currentState).toBe(ConnectionState.Established);
      expect(sm.isEstablished).toBe(true);
    });

    it('follows valid inbound transitions: Connected → VersionReceived → VerackSent → Established', () => {
      const sm = new ConnectionStateMachine('inbound');
      sm.transition(ConnectionState.VersionReceived);
      expect(sm.currentState).toBe(ConnectionState.VersionReceived);
      sm.transition(ConnectionState.VerackSent);
      expect(sm.currentState).toBe(ConnectionState.VerackSent);
      sm.transition(ConnectionState.Established);
      expect(sm.currentState).toBe(ConnectionState.Established);
      expect(sm.isEstablished).toBe(true);
    });

    it('rejects skipping directly to Established', () => {
      expect(() => new ConnectionStateMachine('outbound').transition(ConnectionState.Established)).toThrow('Invalid state transition');
      expect(() => new ConnectionStateMachine('inbound').transition(ConnectionState.Established)).toThrow('Invalid state transition');
    });

    it('rejects wrong-direction transitions', () => {
      expect(() => new ConnectionStateMachine('outbound').transition(ConnectionState.VersionReceived)).toThrow('Invalid state transition');
      expect(() => new ConnectionStateMachine('inbound').transition(ConnectionState.VersionSent)).toThrow('Invalid state transition');
    });

    it('allows Close from any state', () => {
      for (const dir of ['outbound', 'inbound'] as ConnectionDirection[]) {
        for (const target of dir === 'outbound'
          ? [ConnectionState.Connected, ConnectionState.VersionSent, ConnectionState.VerackSent, ConnectionState.Established]
          : [ConnectionState.Connected, ConnectionState.VersionReceived, ConnectionState.VerackSent, ConnectionState.Established]
        ) {
          const sm = new ConnectionStateMachine(dir);
          if (dir === 'outbound') {
            if ([ConnectionState.VersionSent, ConnectionState.VerackSent, ConnectionState.Established].includes(target)) sm.transition(ConnectionState.VersionSent);
            if ([ConnectionState.VerackSent, ConnectionState.Established].includes(target)) sm.transition(ConnectionState.VerackSent);
            if (target === ConnectionState.Established) sm.transition(ConnectionState.Established);
          } else {
            if ([ConnectionState.VersionReceived, ConnectionState.VerackSent, ConnectionState.Established].includes(target)) sm.transition(ConnectionState.VersionReceived);
            if ([ConnectionState.VerackSent, ConnectionState.Established].includes(target)) sm.transition(ConnectionState.VerackSent);
            if (target === ConnectionState.Established) sm.transition(ConnectionState.Established);
          }
          sm.transition(ConnectionState.Closed);
          expect(sm.isClosed).toBe(true);
        }
      }
    });
  });

  // ==================================================================
  describe('VERSION Payload Serialization', () => {
    it('round-trips through serialize + parse', () => {
      const p: VersionPayload = {
        protocolVersion: 1, services: 0x0001, timestamp: 1700000000, nonce: 123456789,
        userAgent: 'Swimchain/0.1.0', startHeight: 42, relay: true, publicKey: new Uint8Array(32).fill(0xcd),
      };
      const r = parseVersionPayload(serializeVersionPayload(p));
      expect(r.protocolVersion).toBe(1);
      expect(r.services).toBe(0x0001);
      expect(r.timestamp).toBe(1700000000);
      expect(r.nonce).toBe(123456789);
      expect(r.userAgent).toBe('Swimchain/0.1.0');
      expect(r.startHeight).toBe(42);
      expect(r.relay).toBe(true);
      expect(Array.from(r.publicKey)).toEqual(Array.from(new Uint8Array(32).fill(0xcd)));
    });

    it('relay: false survives round-trip', () => {
      const p: VersionPayload = { protocolVersion: 1, services: 0, timestamp: 0, nonce: 0, userAgent: 't', startHeight: 0, relay: false, publicKey: new Uint8Array(32) };
      expect(parseVersionPayload(serializeVersionPayload(p)).relay).toBe(false);
    });

    it('empty user agent', () => {
      const p: VersionPayload = { protocolVersion: 1, services: 0, timestamp: 0, nonce: 0, userAgent: '', startHeight: 0, relay: false, publicKey: new Uint8Array(32) };
      expect(parseVersionPayload(serializeVersionPayload(p)).userAgent).toBe('');
    });

    it('non-ASCII user agent', () => {
      const p: VersionPayload = { protocolVersion: 1, services: 0, timestamp: 0, nonce: 0, userAgent: 'üñîçødé', startHeight: 0, relay: false, publicKey: new Uint8Array(32) };
      expect(parseVersionPayload(serializeVersionPayload(p)).userAgent).toBe('üñîçødé');
    });

    it('deterministic output', () => {
      const p: VersionPayload = { protocolVersion: 1, services: 0x0001, timestamp: 1700000000, nonce: 12345, userAgent: 'Test/1.0', startHeight: 100, relay: true, publicKey: new Uint8Array(32).fill(0xaa) };
      expect(Array.from(serializeVersionPayload(p))).toEqual(Array.from(serializeVersionPayload(p)));
    });

    it('user agent length field matches bytes', () => {
      const bytes = serializeVersionPayload({ protocolVersion: 1, services: 0, timestamp: 0, nonce: 0, userAgent: 'Hello', startHeight: 0, relay: false, publicKey: new Uint8Array(32) });
      expect(bytes[63]).toBe(5); // uaLen at offset after: proto(1)+services(8)+ts(8)+nonce(8)+relay(1)+height(4)+pubkeyLen(1)+pubkey(32) = 63
    });
  });

  // ==================================================================
  describe('VERSION Validation', () => {
    it('passes for valid payload', () => {
      expect(() => validateVersion({ protocolVersion: 1, services: 0x0001, timestamp: 1700000000, nonce: 67890, userAgent: 'a', startHeight: 100, relay: true, publicKey: new Uint8Array(32) }, 12345)).not.toThrow();
    });

    it('rejects self-connection (same nonce)', () => {
      expect(() => validateVersion({ protocolVersion: 1, services: 0, timestamp: 0, nonce: 12345, userAgent: '', startHeight: 0, relay: false, publicKey: new Uint8Array(32) }, 12345)).toThrow('Self-connection');
    });

    it('rejects version mismatch', () => {
      expect(() => validateVersion({ protocolVersion: 99, services: 0, timestamp: 0, nonce: 67890, userAgent: '', startHeight: 0, relay: false, publicKey: new Uint8Array(32) }, 12345)).toThrow('Protocol version mismatch');
    });

    it('includes peer and ours in version mismatch error', () => {
      try {
        validateVersion({ protocolVersion: 99, services: 0x0001, timestamp: 1700000000, nonce: 67890, userAgent: 'a', startHeight: 100, relay: true, publicKey: new Uint8Array(32) }, 12345);
        expect.unreachable?.();
      } catch (e: unknown) {
        const msg = (e as TransportError).message;
        expect(msg).toContain('peer=99');
        expect(msg).toContain('ours=1');
      }
    });

    it('rejects version 0 and future version 2', () => {
      const base = { services: 0, timestamp: 0, nonce: 67890, userAgent: '', startHeight: 0, relay: false, publicKey: new Uint8Array(32) };
      expect(() => validateVersion({ ...base, protocolVersion: 0 }, 12345)).toThrow('Protocol version mismatch');
      expect(() => validateVersion({ ...base, protocolVersion: 2 }, 12345)).toThrow('Protocol version mismatch');
    });
  });

  // ==================================================================
  describe('Successful Handshake — Bidirectional Channel', () => {
    it('completes full handshake via step-by-step interleaving', () => {
      const { outboundPeer, inboundPeer } = interleaveHandshake(
        new SimulatedConnection('outbound', ALICE_NONCE),
        new SimulatedConnection('inbound', BOB_NONCE),
        DEFAULT_LOCAL_INFO, DEFAULT_LOCAL_INFO,
      );
      expect(outboundPeer.nonce).toBe(BOB_NONCE);
      expect(inboundPeer.nonce).toBe(ALICE_NONCE);
      expect(outboundPeer.protocolVersion).toBe(PROTOCOL_VERSION);
      expect(inboundPeer.protocolVersion).toBe(PROTOCOL_VERSION);
    });

    it('sends correct message sequence', () => {
      const out = new SimulatedConnection('outbound', ALICE_NONCE);
      const inn = new SimulatedConnection('inbound', BOB_NONCE);
      interleaveHandshake(out, inn, DEFAULT_LOCAL_INFO, DEFAULT_LOCAL_INFO);
      expect(out.sent.length).toBe(2);
      expect(out.sent[0].messageType).toBe(MessageType.Version);
      expect(out.sent[1].messageType).toBe(MessageType.Verack);
      expect(inn.sent.length).toBe(2);
      expect(inn.sent[0].messageType).toBe(MessageType.Version);
      expect(inn.sent[1].messageType).toBe(MessageType.Verack);
    });

    it('populates full PeerInfo from VERSION exchange', () => {
      const { outboundPeer, inboundPeer } = interleaveHandshake(
        new SimulatedConnection('outbound', ALICE_NONCE),
        new SimulatedConnection('inbound', BOB_NONCE),
        { services: 0x0003, userAgent: 'Swimchain-Test/1.0', relay: true, publicKey: new Uint8Array(32).fill(0xaa), height: 500 },
        { services: 0x0005, userAgent: 'Swimchain-Node/2.0', relay: false, publicKey: new Uint8Array(32).fill(0xbb), height: 1000 },
      );
      expect(outboundPeer.services).toBe(0x0005);
      expect(outboundPeer.userAgent).toBe('Swimchain-Node/2.0');
      expect(outboundPeer.relay).toBe(false);
      expect(outboundPeer.startHeight).toBe(1000);
      expect(inboundPeer.services).toBe(0x0003);
      expect(inboundPeer.userAgent).toBe('Swimchain-Test/1.0');
      expect(inboundPeer.relay).toBe(true);
      expect(inboundPeer.startHeight).toBe(500);
    });

    it('handles identical local info on both sides', () => {
      const { outboundPeer, inboundPeer } = interleaveHandshake(
        new SimulatedConnection('outbound', 12345),
        new SimulatedConnection('inbound', 67890),
        DEFAULT_LOCAL_INFO, DEFAULT_LOCAL_INFO,
      );
      expect(outboundPeer.userAgent).toBe('Swimchain/0.1.0');
      expect(inboundPeer.userAgent).toBe('Swimchain/0.1.0');
    });
  });

  // ==================================================================
  describe('Handshake Timeout Handling', () => {
    it('VersionTimeout on empty recv buffer (outbound)', () => {
      expect(() => performOutboundHandshake(new SimulatedConnection('outbound', ALICE_NONCE), DEFAULT_LOCAL_INFO))
        .toThrow('VERSION not received');
    });

    it('VersionTimeout on empty recv buffer (inbound)', () => {
      expect(() => performInboundHandshake(new SimulatedConnection('inbound', BOB_NONCE), DEFAULT_LOCAL_INFO))
        .toThrow('VERSION not received');
    });

    it('UnexpectedMessage when wrong message type for VERSION', () => {
      const c = new SimulatedConnection('outbound', ALICE_NONCE);
      c.enqueueRecv({ messageType: MessageType.Ping, payload: new Uint8Array(0) });
      expect(() => performOutboundHandshake(c, DEFAULT_LOCAL_INFO)).toThrow('Unexpected message');
    });

    it('VersionTimeout when connection closed', () => {
      const c = new SimulatedConnection('outbound', ALICE_NONCE);
      c.close();
      expect(() => performOutboundHandshake(c, DEFAULT_LOCAL_INFO)).toThrow('VERSION not received');
    });

    it('HandshakeTimeout when VERACK never arrives', () => {
      const c = new SimulatedConnection('outbound', ALICE_NONCE);
      c.enqueueRecv({ messageType: MessageType.Version, payload: serializeVersionPayload(buildVersionPayload(DEFAULT_LOCAL_INFO, BOB_NONCE)) });
      expect(() => performOutboundHandshake(c, DEFAULT_LOCAL_INFO)).toThrow('Handshake not completed');
    });

    it('UnexpectedMessage when wrong message type for VERACK', () => {
      const c = new SimulatedConnection('outbound', ALICE_NONCE);
      c.enqueueRecv({ messageType: MessageType.Version, payload: serializeVersionPayload(buildVersionPayload(DEFAULT_LOCAL_INFO, BOB_NONCE)) });
      c.enqueueRecv({ messageType: MessageType.Ping, payload: new Uint8Array(0) });
      expect(() => performOutboundHandshake(c, DEFAULT_LOCAL_INFO)).toThrow('Unexpected message');
    });
  });

  // ==================================================================
  describe('Error Handling — Malformed Messages', () => {
    it('rejects corrupt VERSION payload (too short)', () => {
      const c = new SimulatedConnection('inbound', BOB_NONCE);
      c.enqueueRecv({ messageType: MessageType.Version, payload: new Uint8Array([0x01]) });
      expect(() => performInboundHandshake(c, DEFAULT_LOCAL_INFO)).toThrow();
    });

    it('rejects empty VERSION payload', () => {
      const c = new SimulatedConnection('inbound', BOB_NONCE);
      c.enqueueRecv({ messageType: MessageType.Version, payload: new Uint8Array(0) });
      expect(() => performInboundHandshake(c, DEFAULT_LOCAL_INFO)).toThrow();
    });
  });

  // ==================================================================
  describe('TransportError Types', () => {
    it('VersionTimeout', () => expect(TransportError.VersionTimeout(10).message).toBe('VERSION not received within 10 seconds'));
    it('HandshakeTimeout', () => expect(TransportError.HandshakeTimeout(30).message).toBe('Handshake not completed within 30 seconds'));
    it('SelfConnection', () => expect(TransportError.SelfConnection().message).toBe('Self-connection detected (same nonce)'));
    it('VersionMismatch', () => { const e = TransportError.VersionMismatch(2, 1); expect(e.message).toContain('peer=2'); expect(e.message).toContain('ours=1'); });
    it('ConnectionClosed', () => expect(TransportError.ConnectionClosed().message).toBe('Connection closed by peer'));
    it('InvalidStateTransition', () => { const e = TransportError.InvalidStateTransition('Connected', 'Established'); expect(e.message).toContain('Connected'); expect(e.message).toContain('Established'); });
    it('UnexpectedMessage', () => { const e = TransportError.UnexpectedMessage('Version', '0x02'); expect(e.message).toContain('Version'); expect(e.message).toContain('0x02'); });
  });

  // ==================================================================
  describe('Edge Cases', () => {
    it('zero services and height', () => {
      const r = parseVersionPayload(serializeVersionPayload({
        protocolVersion: 1, services: 0, timestamp: 1700000000, nonce: 42,
        userAgent: 'z', startHeight: 0, relay: false, publicKey: new Uint8Array(32),
      }));
      expect(r.services).toBe(0);
      expect(r.startHeight).toBe(0);
      expect(r.nonce).toBe(42);
    });

    it('max safe integer nonce', () => {
      const maxSafe = Number.MAX_SAFE_INTEGER;
      const r = parseVersionPayload(serializeVersionPayload({
        protocolVersion: 1, services: 0, timestamp: 0, nonce: maxSafe,
        userAgent: 'm', startHeight: 0, relay: false, publicKey: new Uint8Array(32),
      }));
      expect(r.nonce).toBe(maxSafe);
    });

    it('unicode user agent', () => {
      const r = parseVersionPayload(serializeVersionPayload({
        protocolVersion: 1, services: 0, timestamp: 0, nonce: 0,
        userAgent: 'Swimchain-🦈', startHeight: 0, relay: false, publicKey: new Uint8Array(32),
      }));
      expect(r.userAgent).toBe('Swimchain-🦈');
    });
  });

  // ==================================================================
  describe('Nonce Protocol — Self-Connection Detection', () => {
    it('detects self-connection (outbound)', () => {
      const c = new SimulatedConnection('outbound', 12345);
      c.enqueueRecv({ messageType: MessageType.Version, payload: serializeVersionPayload(buildVersionPayload(DEFAULT_LOCAL_INFO, 12345)) });
      expect(() => performOutboundHandshake(c, DEFAULT_LOCAL_INFO)).toThrow('Self-connection');
    });

    it('detects self-connection (inbound)', () => {
      const c = new SimulatedConnection('inbound', 54321);
      c.enqueueRecv({ messageType: MessageType.Version, payload: serializeVersionPayload(buildVersionPayload(DEFAULT_LOCAL_INFO, 54321)) });
      expect(() => performInboundHandshake(c, DEFAULT_LOCAL_INFO)).toThrow('Self-connection');
    });

    it('nonces survive round-trip in full handshake', () => {
      const { outboundPeer, inboundPeer } = interleaveHandshake(
        new SimulatedConnection('outbound', ALICE_NONCE),
        new SimulatedConnection('inbound', BOB_NONCE),
        DEFAULT_LOCAL_INFO, DEFAULT_LOCAL_INFO,
      );
      expect(outboundPeer.nonce).toBe(BOB_NONCE);
      expect(inboundPeer.nonce).toBe(ALICE_NONCE);
    });

    it('assigns different nonces per direction', () => {
      expect(buildVersionPayload(DEFAULT_LOCAL_INFO, ALICE_NONCE).nonce).not.toBe(
        buildVersionPayload(DEFAULT_LOCAL_INFO, BOB_NONCE).nonce,
      );
    });
  });

  // ==================================================================
  describe('Idempotency and Reconnection', () => {
    it('handles two independent handshakes with different nonces', () => {
      const r1 = interleaveHandshake(
        new SimulatedConnection('outbound', 1001), new SimulatedConnection('inbound', 2001),
        DEFAULT_LOCAL_INFO, DEFAULT_LOCAL_INFO,
      );
      const r2 = interleaveHandshake(
        new SimulatedConnection('outbound', 1002), new SimulatedConnection('inbound', 2002),
        DEFAULT_LOCAL_INFO, DEFAULT_LOCAL_INFO,
      );
      expect(r1.outboundPeer.nonce).toBe(2001);
      expect(r1.inboundPeer.nonce).toBe(1001);
      expect(r2.outboundPeer.nonce).toBe(2002);
      expect(r2.inboundPeer.nonce).toBe(1002);
    });

    it('rejects handshake on closed connection', () => {
      const c = new SimulatedConnection('outbound', ALICE_NONCE);
      c.close();
      expect(() => performOutboundHandshake(c, DEFAULT_LOCAL_INFO)).toThrow();
    });
  });
});
