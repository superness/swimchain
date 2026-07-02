# IRC WebSocket Proxy

A standalone WebSocket-to-TCP proxy that enables browser-based IRC connectivity for the Swimchain Bridge Client.

## Why

Browsers cannot open raw TCP connections to IRC servers. This proxy sits between the browser-based `IrcAdapter` and real IRC servers:

```
Browser (IrcAdapter)  ←WebSocket→  irc-proxy  ←TCP/TLS→  IRC Server
```

## Usage

```bash
# Install dependencies
cd proxy && npm install

# Start on default port 8080 (localhost only)
npm start

# Or run directly
node irc-proxy.js

# Custom port and host
node irc-proxy.js --port 9090 --host 0.0.0.0
```

From the bridge-client root:
```bash
npm run proxy
```

## Protocol

The proxy speaks JSON over WebSocket. Messages are symmetric:

### Client → Proxy

| Type | Fields | Description |
|------|--------|-------------|
| `connect` | `server`, `port`, `tls` | Connect to an IRC server |
| `send` | `data` | Send raw IRC protocol data |
| `disconnect` | — | Disconnect from the IRC server |

### Proxy → Client

| Type | Fields | Description |
|------|--------|-------------|
| `connected` | — | Successfully connected to IRC server |
| `data` | `data` | Raw IRC protocol data from server |
| `error` | `message` | An error occurred |
| `disconnected` | — | IRC connection closed |

## Example

```javascript
// Client connects to Libera.Chat
ws.send(JSON.stringify({
  type: "connect",
  server: "irc.libera.chat",
  port: 6697,
  tls: true
}));

// Proxy confirms
// → { "type": "connected" }

// Client sends IRC registration
ws.send(JSON.stringify({
  type: "send",
  data: "NICK bridgebot\r\nUSER bridgebot 0 * :Swimchain Bridge\r\n"
}));

// Server responds
// → { "type": "data", "data": ":libera.notice.auth * :*** Looking up your hostname...\r\n" }
```

## Configuration

The bridge-client's IrcAdapter connects to this proxy by default at `ws://localhost:8080`. Configure via the bridge dashboard's IRC settings or set `proxyUrl` in the config.
