# Bridge Client

The Bridge Client enables bidirectional message bridging between Swimchain spaces and external platforms (Matrix and IRC).

## Features

- **Matrix Integration**: Bridge messages to/from Matrix homeservers
- **IRC Integration**: Bridge messages to/from IRC channels via WebSocket proxy
- **Echo Prevention**: Prevents message loops between platforms
- **Rate Limiting**: Sliding window rate limiting per space
- **Activity Logging**: Track all bridge operations

## Architecture

```
┌─────────────────┐     ┌─────────────────┐
│  Matrix Server  │     │   IRC Server    │
└────────┬────────┘     └────────┬────────┘
         │                       │
         ▼                       ▼
┌─────────────────┐     ┌─────────────────┐
│ Matrix Adapter  │     │   IRC Adapter   │
└────────┬────────┘     └────────┬────────┘
         │                       │
         └───────────┬───────────┘
                     ▼
            ┌─────────────────┐
            │  Bridge Engine  │
            └────────┬────────┘
                     │
         ┌───────────┴───────────┐
         ▼                       ▼
┌─────────────────┐     ┌─────────────────┐
│  Echo Tracker   │     │  Rate Limiter   │
└─────────────────┘     └─────────────────┘
                     │
                     ▼
            ┌─────────────────┐
            │ Swimchain API │
            └─────────────────┘
```

## Configuration

### General Settings

- **Enable Bridge**: Toggle bridging on/off
- **Target Space**: Swimchain space ID to bridge to/from
- **Max Posts per Hour**: Rate limit (default: 10)
- **Daily PoW Budget**: Maximum PoW seconds per day

### Matrix Configuration

- **Homeserver URL**: e.g., `https://matrix.org`
- **Access Token**: Matrix API access token
- **Room ID**: Room to bridge (e.g., `!roomid:matrix.org`)

### IRC Configuration

- **Server**: IRC server hostname
- **Port**: Server port (default: 6697 for TLS)
- **TLS**: Enable/disable TLS
- **Nickname**: Bot nickname
- **Channels**: List of channels to bridge
- **WebSocket Proxy URL**: Required proxy for browser IRC

## IRC WebSocket Proxy

Since browsers cannot connect directly to IRC servers, a WebSocket-to-TCP proxy is required.

### Protocol

Client to Proxy:
```json
{ "type": "connect", "server": "irc.libera.chat", "port": 6697, "tls": true }
{ "type": "data", "data": "NICK bridge-bot\r\n" }
{ "type": "disconnect" }
```

Proxy to Client:
```json
{ "type": "connected" }
{ "type": "data", "data": ":server NOTICE * :Connected\r\n" }
{ "type": "error", "message": "Connection refused" }
{ "type": "disconnected" }
```

## Echo Prevention

The bridge tracks all bridged messages to prevent infinite loops:

1. When bridging from Platform A to Platform B, the message ID is recorded
2. When receiving messages from Platform B, check if it was recently bridged
3. If it was bridged (within 1 hour TTL), skip re-bridging back to A

## Rate Limiting

Uses sliding window rate limiting:
- Default: 10 messages per hour per space
- Rejects messages when limit exceeded
- Logged as `rate_limited` in activity log

## Running

### 1. Start the IRC WebSocket Proxy (required for IRC bridging)

```bash
cd bridge-client/proxy
npm install
npm start
# or from bridge-client root:
npm run proxy
```

The proxy listens on `ws://localhost:8080` by default. Use `--port` and `--host` flags to customize.

### 2. Start the Bridge Dashboard

```bash
cd bridge-client
npm install
npm run dev
```

Opens at http://localhost:5176

## API Dependencies

The bridge client depends on `@swimchain/core` for:
- Posting messages to spaces
- Fetching messages from spaces
- PoW computation for outbound messages
