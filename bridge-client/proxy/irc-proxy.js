#!/usr/bin/env node

/**
 * IRC WebSocket Proxy Server
 *
 * Translates WebSocket ↔ IRC TCP protocol so the browser-based
 * bridge-client's IrcAdapter can connect to real IRC servers.
 *
 * Protocol (JSON over WebSocket):
 *   Client → Proxy:
 *     { "type": "connect", "server": "irc.libera.chat", "port": 6697, "tls": true }
 *     { "type": "send", "data": "NICK bridgebot\r\n" }
 *     { "type": "disconnect" }
 *
 *   Proxy → Client:
 *     { "type": "connected" }
 *     { "type": "data", "data": ":server NOTICE * :Connected\r\n" }
 *     { "type": "error", "message": "Connection refused" }
 *     { "type": "disconnected" }
 *
 * Usage:
 *   node proxy/irc-proxy.js              # port 8080 (default)
 *   node proxy/irc-proxy.js --port 9090  # custom port
 *   node proxy/irc-proxy.js --host 0.0.0.0  # all interfaces
 */

import { createServer } from 'node:http';
import { connect as tlsConnect } from 'node:tls';
import { connect as tcpConnect } from 'node:net';
import { WebSocketServer } from 'ws';

const DEFAULT_PORT = 8080;
const DEFAULT_HOST = '127.0.0.1';
const IRC_TIMEOUT_MS = 30_000;

// ---- Parse CLI args ----
const args = process.argv.slice(2);
let port = DEFAULT_PORT;
let host = DEFAULT_HOST;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--port' && args[i + 1]) {
    port = parseInt(args[i + 1], 10);
    i++;
  } else if (args[i] === '--host' && args[i + 1]) {
    host = args[i + 1];
    i++;
  } else if (args[i] === '--help') {
    console.log('IRC WebSocket Proxy Server');
    console.log('');
    console.log('Usage: node proxy/irc-proxy.js [options]');
    console.log('');
    console.log('Options:');
    console.log('  --port <n>   WebSocket server port (default: 8080)');
    console.log('  --host <s>   Bind address (default: 127.0.0.1)');
    console.log('  --help       Show this help');
    process.exit(0);
  }
}

// ---- WebSocket Server ----
const wss = new WebSocketServer({ noServer: true });

const httpServer = createServer((_req, res) => {
  res.writeHead(426, { 'Content-Type': 'text/plain' });
  res.end('This server only accepts WebSocket connections on the IRC proxy protocol.\n');
});

httpServer.on('upgrade', (request, socket, head) => {
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request);
  });
});

wss.on('connection', (ws) => {
  log('New WebSocket client connected');

  /** @type {import('node:net').Socket|null} */
  let ircSocket = null;
  let ircTimeout = null;
  let buffer = '';

  const cleanup = () => {
    if (ircTimeout) {
      clearTimeout(ircTimeout);
      ircTimeout = null;
    }
    if (ircSocket) {
      ircSocket.removeAllListeners();
      ircSocket.end();
      ircSocket.destroy();
      ircSocket = null;
    }
    buffer = '';
  };

  const sendToClient = (msg) => {
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  };

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      sendToClient({ type: 'error', message: 'Invalid JSON' });
      return;
    }

    switch (msg.type) {
      case 'connect':
        // Already connected?
        if (ircSocket) {
          sendToClient({ type: 'error', message: 'Already connected. Disconnect first.' });
          return;
        }

        const server = msg.server;
        const ircPort = msg.port != null ? msg.port : 6697;
        const useTls = msg.tls !== false;

        if (!server || typeof server !== 'string') {
          sendToClient({ type: 'error', message: 'Missing or invalid "server" in connect message' });
          return;
        }

        log(`Connecting to ${useTls ? 'ircs' : 'irc'}://${server}:${ircPort} ...`);

        if (useTls) {
          ircSocket = tlsConnect({ host: server, port: ircPort, rejectUnauthorized: false });
        } else {
          ircSocket = tcpConnect(ircPort, server);
        }

        ircTimeout = setTimeout(() => {
          log(`Timeout connecting to ${server}:${ircPort}`);
          sendToClient({ type: 'error', message: `Connection timed out after ${IRC_TIMEOUT_MS / 1000}s` });
          cleanup();
        }, IRC_TIMEOUT_MS);

        ircSocket.on('connect', () => {
          log(`Connected to ${server}:${ircPort}`);
          if (ircTimeout) {
            clearTimeout(ircTimeout);
            ircTimeout = null;
          }
          sendToClient({ type: 'connected' });
        });

        ircSocket.on('data', (data) => {
          const chunk = data.toString('utf-8');
          buffer += chunk;

          // Split on \r\n (IRC line delimiter)
          const lines = buffer.split('\r\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.trim()) {
              sendToClient({ type: 'data', data: line + '\r\n' });
            }
          }
        });

        ircSocket.on('close', () => {
          log(`Disconnected from ${server}:${ircPort}`);
          sendToClient({ type: 'disconnected' });
          cleanup();
        });

        ircSocket.on('error', (err) => {
          log(`IRC socket error: ${err.message}`);
          sendToClient({ type: 'error', message: `IRC connection error: ${err.message}` });
          cleanup();
        });

        break;

      case 'send':
        if (!ircSocket || ircSocket.destroyed) {
          sendToClient({ type: 'error', message: 'Not connected to IRC server' });
          return;
        }

        const data = msg.data;
        if (typeof data !== 'string') {
          sendToClient({ type: 'error', message: 'Missing or invalid "data" field in send message' });
          return;
        }

        ircSocket.write(data);
        break;

      case 'disconnect':
        cleanup();
        sendToClient({ type: 'disconnected' });
        break;

      default:
        sendToClient({ type: 'error', message: `Unknown message type: ${msg.type}` });
        break;
    }
  });

  ws.on('close', () => {
    log('WebSocket client disconnected');
    cleanup();
  });

  ws.on('error', (err) => {
    log(`WebSocket error: ${err.message}`);
    cleanup();
  });
});

httpServer.listen(port, host, () => {
  log(`IRC WebSocket Proxy listening on ws://${host}:${port}`);
});

function log(msg) {
  const ts = new Date().toISOString().replace('T', ' ').slice(0, 19);
  console.log(`[${ts}] [irc-proxy] ${msg}`);
}
