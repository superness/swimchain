/**
 * Tests for the node WebSocket events client
 *
 * Uses a mocked WebSocket to exercise connect, subscribe, event dispatch,
 * client-side filtering, keepalive pings, and reconnect behavior.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  NodeEventsClient,
  rpcEndpointToWsUrl,
  eventMatchesFilter,
  acquireEventsClient,
  releaseEventsClient,
  type NodeEvent,
} from '../events';

// ---------------------------------------------------------------------------
// Mock WebSocket
// ---------------------------------------------------------------------------

class MockWebSocket {
  static instances: MockWebSocket[] = [];

  url: string;
  readyState = 0; // CONNECTING
  sent: string[] = [];
  closed = false;

  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  send(data: string): void {
    if (this.closed) throw new Error('socket closed');
    this.sent.push(data);
  }

  close(): void {
    this.closed = true;
    this.readyState = 3; // CLOSED
    this.onclose?.();
  }

  // -- test helpers --

  simulateOpen(): void {
    this.readyState = 1; // OPEN
    this.onopen?.();
  }

  simulateMessage(message: Record<string, unknown>): void {
    this.onmessage?.({ data: JSON.stringify(message) });
  }

  simulateServerClose(): void {
    this.closed = true;
    this.readyState = 3;
    this.onclose?.();
  }

  sentJson(): Array<Record<string, unknown>> {
    return this.sent.map((s) => JSON.parse(s) as Record<string, unknown>);
  }

  static latest(): MockWebSocket {
    const ws = MockWebSocket.instances[MockWebSocket.instances.length - 1];
    if (!ws) throw new Error('no MockWebSocket instance');
    return ws;
  }

  static reset(): void {
    MockWebSocket.instances = [];
  }
}

const WsImpl = MockWebSocket as unknown as typeof WebSocket;

function makeClient(overrides: Partial<ConstructorParameters<typeof NodeEventsClient>[0]> = {}) {
  return new NodeEventsClient({
    url: 'http://127.0.0.1:19736',
    webSocketImpl: WsImpl,
    minReconnectDelayMs: 100,
    maxReconnectDelayMs: 1000,
    pingIntervalMs: 30000,
    ...overrides,
  });
}

function contentNewEvent(data: Record<string, unknown>): Record<string, unknown> {
  return {
    jsonrpc: '2.0',
    method: 'event',
    params: { type: 'content_new', timestamp: 1234, data },
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  MockWebSocket.reset();
});

afterEach(() => {
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// rpcEndpointToWsUrl
// ---------------------------------------------------------------------------

describe('rpcEndpointToWsUrl', () => {
  it('converts http endpoints to ws://.../ws', () => {
    expect(rpcEndpointToWsUrl('http://127.0.0.1:19736')).toBe('ws://127.0.0.1:19736/ws');
  });

  it('converts https endpoints to wss://.../ws', () => {
    expect(rpcEndpointToWsUrl('https://node.example.com:8737')).toBe(
      'wss://node.example.com:8737/ws'
    );
  });

  it('passes ws URLs through, appending /ws when missing', () => {
    expect(rpcEndpointToWsUrl('ws://localhost:19736/ws')).toBe('ws://localhost:19736/ws');
    expect(rpcEndpointToWsUrl('wss://localhost:19736')).toBe('wss://localhost:19736/ws');
  });

  it('strips trailing slashes before appending', () => {
    expect(rpcEndpointToWsUrl('http://localhost:19736/')).toBe('ws://localhost:19736/ws');
  });

  it('handles bare host:port', () => {
    expect(rpcEndpointToWsUrl('127.0.0.1:19736')).toBe('ws://127.0.0.1:19736/ws');
  });
});

// ---------------------------------------------------------------------------
// eventMatchesFilter
// ---------------------------------------------------------------------------

describe('eventMatchesFilter', () => {
  const event: NodeEvent = {
    type: 'content_new',
    timestamp: 1,
    data: { space_id: 'sp1abc', thread_id: 'sha256:aa' },
  };

  it('matches when no filter given', () => {
    expect(eventMatchesFilter(event)).toBe(true);
  });

  it('matches on equal space_id and rejects different space_id', () => {
    expect(eventMatchesFilter(event, { spaceId: 'sp1abc' })).toBe(true);
    expect(eventMatchesFilter(event, { spaceId: 'sp1other' })).toBe(false);
  });

  it('matches on equal thread_id and rejects different thread_id', () => {
    expect(eventMatchesFilter(event, { threadId: 'sha256:aa' })).toBe(true);
    expect(eventMatchesFilter(event, { threadId: 'sha256:bb' })).toBe(false);
  });

  it('is permissive when the event lacks the filtered field', () => {
    const bare: NodeEvent = { type: 'content_engaged', timestamp: 1, data: { content_id: 'x' } };
    expect(eventMatchesFilter(bare, { spaceId: 'sp1abc' })).toBe(true);
    expect(eventMatchesFilter(bare, { threadId: 'sha256:aa' })).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// NodeEventsClient
// ---------------------------------------------------------------------------

describe('NodeEventsClient', () => {
  it('connects lazily on first subscribe and sends a subscribe request on open', () => {
    const client = makeClient();
    expect(MockWebSocket.instances.length).toBe(0);

    client.subscribe(['content_new', 'content_engaged'], () => {});
    expect(MockWebSocket.instances.length).toBe(1);

    const ws = MockWebSocket.latest();
    expect(ws.url).toBe('ws://127.0.0.1:19736/ws');

    ws.simulateOpen();
    const frames = ws.sentJson();
    const sub = frames.find((f) => f.method === 'subscribe');
    expect(sub).toBeDefined();
    expect((sub!.params as { events: string[] }).events.sort()).toEqual([
      'content_engaged',
      'content_new',
    ]);
    client.close();
  });

  it('dispatches events to listeners subscribed to that type', () => {
    const client = makeClient();
    const received: NodeEvent[] = [];
    client.subscribe(['content_new'], (e) => received.push(e));

    const ws = MockWebSocket.latest();
    ws.simulateOpen();

    ws.simulateMessage({ jsonrpc: '2.0', method: 'welcome', params: { message: 'hi' } });
    ws.simulateMessage(contentNewEvent({ content_id: 'sha256:aa', space_id: 'sp1x' }));

    expect(received.length).toBe(1);
    expect(received[0].type).toBe('content_new');
    expect(received[0].data.content_id).toBe('sha256:aa');
    client.close();
  });

  it('does not dispatch events of unsubscribed types', () => {
    const client = makeClient();
    const received: NodeEvent[] = [];
    client.subscribe(['content_new'], (e) => received.push(e));

    const ws = MockWebSocket.latest();
    ws.simulateOpen();
    ws.simulateMessage({
      jsonrpc: '2.0',
      method: 'event',
      params: { type: 'block_created', timestamp: 1, data: { height: 5 } },
    });

    expect(received.length).toBe(0);
    client.close();
  });

  it('applies client-side space filtering', () => {
    const client = makeClient();
    const mine: NodeEvent[] = [];
    client.subscribe(['content_new'], (e) => mine.push(e), { spaceId: 'sp1mine' });

    const ws = MockWebSocket.latest();
    ws.simulateOpen();
    ws.simulateMessage(contentNewEvent({ content_id: 'a', space_id: 'sp1mine' }));
    ws.simulateMessage(contentNewEvent({ content_id: 'b', space_id: 'sp1other' }));
    // Unknown space: delivered (permissive refetch hint)
    ws.simulateMessage(contentNewEvent({ content_id: 'c' }));

    expect(mine.map((e) => e.data.content_id)).toEqual(['a', 'c']);
    client.close();
  });

  it('sends keepalive pings on the configured interval', () => {
    const client = makeClient({ pingIntervalMs: 5000 });
    client.subscribe(['content_new'], () => {});
    const ws = MockWebSocket.latest();
    ws.simulateOpen();

    const pingsBefore = ws.sentJson().filter((f) => f.method === 'ping').length;
    vi.advanceTimersByTime(5001);
    vi.advanceTimersByTime(5001);
    const pingsAfter = ws.sentJson().filter((f) => f.method === 'ping').length;

    expect(pingsAfter - pingsBefore).toBe(2);
    client.close();
  });

  it('reconnects with backoff after a server close and resubscribes', () => {
    const client = makeClient({ minReconnectDelayMs: 100, maxReconnectDelayMs: 1000 });
    const received: NodeEvent[] = [];
    client.subscribe(['content_new'], (e) => received.push(e));

    const first = MockWebSocket.latest();
    first.simulateOpen();
    expect(MockWebSocket.instances.length).toBe(1);

    first.simulateServerClose();
    expect(client.getStatus()).toBe('closed');

    // Backoff delay is at most maxReconnectDelayMs
    vi.advanceTimersByTime(1001);
    expect(MockWebSocket.instances.length).toBe(2);

    const second = MockWebSocket.latest();
    second.simulateOpen();
    expect(client.getStatus()).toBe('open');

    // Resubscribed on the new connection
    const sub = second.sentJson().find((f) => f.method === 'subscribe');
    expect(sub).toBeDefined();

    // Events flow again
    second.simulateMessage(contentNewEvent({ content_id: 'after-reconnect' }));
    expect(received.map((e) => e.data.content_id)).toEqual(['after-reconnect']);
    client.close();
  });

  it('does not reconnect after close() is called', () => {
    const client = makeClient();
    client.subscribe(['content_new'], () => {});
    const ws = MockWebSocket.latest();
    ws.simulateOpen();

    client.close();
    vi.advanceTimersByTime(60000);
    expect(MockWebSocket.instances.length).toBe(1);
    expect(client.getStatus()).toBe('closed');
  });

  it('unsubscribe function removes the listener', () => {
    const client = makeClient();
    const received: NodeEvent[] = [];
    const unsubscribe = client.subscribe(['content_new'], (e) => received.push(e));

    const ws = MockWebSocket.latest();
    ws.simulateOpen();
    ws.simulateMessage(contentNewEvent({ content_id: 'one' }));
    unsubscribe();
    ws.simulateMessage(contentNewEvent({ content_id: 'two' }));

    expect(received.map((e) => e.data.content_id)).toEqual(['one']);
    client.close();
  });

  it('notifies status listeners on connect and disconnect', () => {
    const client = makeClient();
    const statuses: string[] = [];
    client.onStatusChange((s) => statuses.push(s));

    client.subscribe(['content_new'], () => {});
    const ws = MockWebSocket.latest();
    ws.simulateOpen();
    ws.simulateServerClose();

    expect(statuses).toContain('connecting');
    expect(statuses).toContain('open');
    expect(statuses).toContain('closed');
    client.close();
  });

  it('ignores malformed frames without crashing', () => {
    const client = makeClient();
    const received: NodeEvent[] = [];
    client.subscribe(['content_new'], (e) => received.push(e));

    const ws = MockWebSocket.latest();
    ws.simulateOpen();
    ws.onmessage?.({ data: 'not json{{{' });
    ws.simulateMessage({ jsonrpc: '2.0', result: 'pong', id: 1 });
    ws.simulateMessage(contentNewEvent({ content_id: 'ok' }));

    expect(received.length).toBe(1);
    client.close();
  });
});

// ---------------------------------------------------------------------------
// Shared client registry
// ---------------------------------------------------------------------------

describe('acquireEventsClient / releaseEventsClient', () => {
  it('shares one client per node URL and closes on last release', () => {
    const a = acquireEventsClient('http://127.0.0.1:19736', { webSocketImpl: WsImpl });
    const b = acquireEventsClient('http://127.0.0.1:19736/', { webSocketImpl: WsImpl });
    expect(a).toBe(b);

    a.subscribe(['content_new'], () => {});
    MockWebSocket.latest().simulateOpen();
    expect(a.getStatus()).toBe('open');

    releaseEventsClient(a);
    expect(a.getStatus()).toBe('open'); // still one holder left

    releaseEventsClient(b);
    expect(b.getStatus()).toBe('closed');

    // A fresh acquire after full release creates a new client
    const c = acquireEventsClient('http://127.0.0.1:19736', { webSocketImpl: WsImpl });
    expect(c).not.toBe(a);
    releaseEventsClient(c);
  });
});
