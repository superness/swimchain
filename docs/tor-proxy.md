# Outbound Privacy: SOCKS5 / Tor Proxy (SWIM-PRIV-2)

A Swimchain node can route **all of its outbound peer connections** through a
SOCKS5 proxy — most usefully **Tor** — so that peers see a Tor exit / onion
address instead of the operator's real home IP. This follows the same pattern as
Bitcoin Core's `-proxy` option and is the strongest IP-privacy lever available
to a node operator.

This lane covers **outbound** privacy. Accepting **inbound** connections
privately requires a Tor hidden service (onion), configured out-of-band — see
[Inbound over Tor](#inbound-over-tor-optional) below.

## Quick start (Tor)

1. Install and run Tor. By default the Tor daemon exposes a SOCKS5 proxy on
   `127.0.0.1:9050` (Tor Browser uses `127.0.0.1:9150`).

2. Start the node pointing at the proxy:

   ```bash
   sw node start --proxy 127.0.0.1:9050
   ```

   Every outbound dial now performs a SOCKS5 CONNECT through Tor. Peers observe
   a Tor exit address, not your IP.

3. For maximum leak resistance, add `--proxy-only`:

   ```bash
   sw node start --proxy 127.0.0.1:9050 --proxy-only
   ```

## Flags

| Flag | Meaning |
|------|---------|
| `--proxy <host:port>` | SOCKS5 proxy address for all outbound peer dials (e.g. `127.0.0.1:9050`). |
| `--proxy-only` | Refuse any path that would bypass the proxy or leak the local IP. Requires `--proxy`. |

Both flags map to `NodeConfig.proxy` / `NodeConfig.proxy_only`. `--proxy-only`
without `--proxy` is rejected at startup.

## What is routed

Every outbound peer connection funnels through a single chokepoint,
`TcpTransport::connect`, which is used by:

- Bootstrap: hardcoded IP seeds and `--connect` peers.
- Bootstrap: peers resolved from DNS seeds.
- The connection manager's ongoing outbound peer selection / reconnection loop.
- DHT-driven peer dials and the RPC `connect`/sync paths.

When `--proxy` is set, all of these dial the peer via a SOCKS5 CONNECT through
the proxy instead of a direct `TcpStream::connect`. When no proxy is set, dials
are direct and behavior is unchanged.

## Leak-prevention scope of `--proxy-only`

`--proxy-only` is a hardening switch. It guarantees:

- **All outbound peer connections go through the proxy.** No direct
  `TcpStream::connect` to a peer happens (same as plain `--proxy`).
- **No DNS-seed resolution.** DNS-seed hostnames are *not* resolved locally,
  which would otherwise leak clearnet DNS lookups revealing your interest in the
  network. (Plain `--proxy` still resolves DNS seeds locally — see below.)
- **No local address advertised.** Outbound `VERSION` handshakes advertise an
  unspecified address (`0.0.0.0:0` / `[::]:0`) instead of the real listen
  address, so peers can't learn the IP the proxy is hiding.
- **Local (mDNS) discovery is not used.** mDNS is not wired into the node
  runtime today, but proxy-only is documented and coded to keep it disabled so
  a future integration cannot broadcast the node on the LAN.

### What is NOT protected (know your threat model)

- **Plain `--proxy` (without `--proxy-only`) still resolves DNS seeds locally.**
  That leaks DNS lookups (not peer traffic). Use `--proxy-only` to suppress it.
- **The listen socket still binds locally.** Outbound traffic is proxied, but
  the node still `bind`s its P2P listen address. Inbound connectivity over the
  clearnet listener would still expose your IP to anyone who connects *to* you.
  If you only want to be reachable privately, bind the listener to localhost
  (`--listen 127.0.0.1:PORT`) and expose it via an onion service (below), or
  firewall the port.
- **The RPC server** is a local control channel and is unaffected by the proxy;
  keep it bound to `127.0.0.1` (the default).
- **Application-level identifiers** (your node identity / display name, content
  you author) are orthogonal to IP privacy and are not anonymized by the proxy.
- **Correlation / timing attacks** against Tor itself are out of scope.

## Inbound over Tor (optional)

The proxy only anonymizes *outbound* dials. To also accept *inbound*
connections without exposing your IP, run the node's listener behind a Tor
hidden service (onion). This is configured in Tor, not in Swimchain:

1. Bind the node's P2P listener to localhost so it is not directly reachable on
   the clearnet:

   ```bash
   sw node start --listen 127.0.0.1:9735 --proxy 127.0.0.1:9050 --proxy-only
   ```

2. Add a hidden service to your `torrc` pointing at that listen port:

   ```
   HiddenServiceDir /var/lib/tor/swimchain/
   HiddenServicePort 9735 127.0.0.1:9735
   ```

3. Reload Tor. Tor writes your `.onion` address to
   `/var/lib/tor/swimchain/hostname`. Other operators can reach your node at
   `<your-address>.onion:9735` — their node dials it through *their* Tor proxy,
   and the connection never touches either party's real IP.

> Note: the hidden service makes your node *reachable* over Tor without exposing
> your IP. However, *dialing* an `.onion` peer requires targeting it by hostname
> through the proxy, and today Swimchain peer addresses (including `--connect`
> and the peer store) are IP `SocketAddr`s. So in-band onion-to-onion peering is
> a follow-up: currently a hidden-service node is reachable by clearnet-addressed
> peers that route through Tor, but advertising/dialing raw `.onion` hostnames is
> not yet supported end-to-end.
