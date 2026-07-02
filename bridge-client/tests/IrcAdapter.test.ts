/**
 * IrcAdapter parsing/sanitization unit tests
 *
 * Exercises the pure protocol helpers (line parsing, buffering, PING/PONG,
 * CRLF injection sanitization) by intercepting the proxy send method.
 * No WebSocket is ever opened.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { IrcAdapter } from '../src/adapters/IrcAdapter';
import type { BridgeMessage, IrcConfig } from '../src/types';

type AdapterPrivates = {
  sendProxy(msg: Record<string, unknown>): void;
  processLine(line: string): void;
  onData(data: string): void;
};

function makeConfig(overrides: Partial<IrcConfig> = {}): IrcConfig {
  return {
    enabled: true,
    server: 'irc.test.example',
    port: 6697,
    tls: true,
    nickname: 'bridgebot',
    channels: ['#swim'],
    proxyUrl: 'ws://localhost:8080',
    ...overrides,
  };
}

function makeAdapter(config: IrcConfig = makeConfig()) {
  const adapter = new IrcAdapter(config);
  const sent: Array<Record<string, unknown>> = [];
  (adapter as unknown as AdapterPrivates).sendProxy = (msg) => sent.push(msg);
  const received: BridgeMessage[] = [];
  adapter.onMessage((m) => received.push(m));
  return {
    adapter,
    sent,
    received,
    priv: adapter as unknown as AdapterPrivates,
  };
}

describe('sendMessage CRLF sanitization', () => {
  it('strips CR/LF to prevent IRC command injection', () => {
    const { adapter, sent } = makeAdapter();

    adapter.sendMessage('#swim', 'hello\r\nQUIT :evil\rPRIVMSG #x :inj\ndone');

    expect(sent).toHaveLength(1);
    expect(sent[0]?.type).toBe('send');
    // Each injected CR and LF collapses to a space (so \r\n becomes two);
    // only the trailing protocol CRLF remains
    expect(sent[0]?.data).toBe(
      'PRIVMSG #swim :hello  QUIT :evil PRIVMSG #x :inj done\r\n'
    );
  });

  it('leaves clean content untouched', () => {
    const { adapter, sent } = makeAdapter();
    adapter.sendMessage('#swim', 'a normal message');
    expect(sent[0]?.data).toBe('PRIVMSG #swim :a normal message\r\n');
  });

  it('prefixes # onto bare channel names', () => {
    const { adapter, sent } = makeAdapter();
    adapter.sendMessage('swim', 'hi');
    expect(sent[0]?.data).toBe('PRIVMSG #swim :hi\r\n');
  });
});

describe('processLine parsing', () => {
  it('parses PRIVMSG into a BridgeMessage', () => {
    const { priv, received } = makeAdapter();

    priv.processLine(':alice!alice@host.example PRIVMSG #swim :hello world');

    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({
      platform: 'irc',
      sender: 'alice',
      senderDisplayName: 'alice',
      content: 'hello world',
      source: '#swim',
      isBridged: false,
    });
  });

  it('responds to PING with PONG', () => {
    const { priv, sent, received } = makeAdapter();

    priv.processLine('PING :irc.test.example');

    expect(sent).toHaveLength(1);
    expect(sent[0]?.data).toBe('PONG :irc.test.example\r\n');
    expect(received).toHaveLength(0);
  });

  it('ignores messages that look already bridged (echo prevention)', () => {
    const { priv, received } = makeAdapter();

    priv.processLine(':bot!b@h PRIVMSG #swim :[irc/alice] bridged text');
    priv.processLine(':bot!b@h PRIVMSG #swim :[matrix/bob] bridged text');
    priv.processLine(':bot!b@h PRIVMSG #swim :[cs/cs1addr] bridged text');

    expect(received).toHaveLength(0);
  });

  it('ignores channels outside the configured list', () => {
    const { priv, received } = makeAdapter();
    priv.processLine(':alice!a@h PRIVMSG #unrelated :hello');
    expect(received).toHaveLength(0);
  });

  it('matches configured channels case-insensitively and without # prefix', () => {
    const { priv, received } = makeAdapter(makeConfig({ channels: ['swim'] }));
    priv.processLine(':alice!a@h PRIVMSG #SWIM :cased hello');
    expect(received).toHaveLength(1);
    expect(received[0]?.content).toBe('cased hello');
  });

  it('ignores non-PRIVMSG server lines', () => {
    const { priv, received, sent } = makeAdapter();
    priv.processLine(':irc.test.example 001 bridgebot :Welcome to IRC');
    priv.processLine(':irc.test.example 366 bridgebot #swim :End of /NAMES list.');
    expect(received).toHaveLength(0);
    expect(sent).toHaveLength(0);
  });
});

describe('onData line buffering', () => {
  it('buffers partial lines until CRLF arrives', () => {
    const { priv, received } = makeAdapter();

    priv.onData(':alice!a@h PRIVMSG #swim :hel');
    expect(received).toHaveLength(0); // incomplete line stays buffered

    priv.onData('lo\r\n');
    expect(received).toHaveLength(1);
    expect(received[0]?.content).toBe('hello');
  });

  it('processes multiple complete lines in one chunk', () => {
    const { priv, received } = makeAdapter();

    priv.onData(
      ':a!a@h PRIVMSG #swim :one\r\n:b!b@h PRIVMSG #swim :two\r\n:c!c@h PRIVMSG #swim :thr'
    );

    expect(received.map((m) => m.content)).toEqual(['one', 'two']);
    priv.onData('ee\r\n');
    expect(received.map((m) => m.content)).toEqual(['one', 'two', 'three']);
  });
});
