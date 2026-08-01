//! Is this node actually draining its accept queue?
//!
//! THE 2026-07-29 OUTAGE (#208). The mainnet seed stopped accepting inbound
//! connections. The process was alive, healthy on CPU and RAM, serving RPC,
//! and reporting itself active — while the kernel held a full listen backlog:
//!
//! ```text
//! State  Recv-Q Send-Q Local Address:Port
//! LISTEN   4097   4096       0.0.0.0:9735
//! ```
//!
//! On a LISTENING socket `Recv-Q` is completed connections waiting to be
//! `accept()`ed. At 4097 against a 4096 backlog the queue is full and the
//! application is not draining it; from outside, the port simply reads as
//! unreachable. Every node trying to bootstrap got nothing, because the seed
//! is the entry point when a node has no usable peer list.
//!
//! The causes were fixed (#216 took the handshake off the accept loop, #213
//! made eviction a property of sending). What was never fixed is the part that
//! made it cost hours: **nothing measured it**. `systemctl is-active` said
//! active, RPC answered, and no log line mentioned that the node had stopped
//! doing its main job.
//!
//! The kernel already publishes the number. This reads it.

/// Backlog occupancy above which we complain. The kernel's own default
/// backlog is 4096; a healthy node drains within microseconds, so tens of
/// waiting connections already means the accept loop is not keeping up.
pub const ACCEPT_QUEUE_WARN_DEPTH: u64 = 32;

/// The deepest accept queue among all LISTEN sockets in `/proc/net/tcp`-format
/// text, as `(port, depth)`.
///
/// Deliberately not per-port: the node listens on P2P and RPC, and a caller
/// that had to name a port would need it threaded through every task. The
/// question worth asking is "is ANY listener backing up", and the answer
/// carries the port so the log line can say which.
///
/// The format is one socket per line after a header:
/// `sl local_address rem_address st tx_queue:rx_queue ...`, all hex. For a
/// listening socket (`st == 0A`) the kernel reports the number of completed
/// connections awaiting accept in `rx_queue`.
#[must_use]
pub fn deepest_listen_backlog(proc_net_tcp: &str) -> Option<(u16, u64)> {
    let mut worst: Option<(u16, u64)> = None;
    for line in proc_net_tcp.lines().skip(1) {
        let mut fields = line.split_whitespace();
        let (Some(_sl), Some(local), Some(_rem), Some(state), Some(queues)) = (
            fields.next(),
            fields.next(),
            fields.next(),
            fields.next(),
            fields.next(),
        ) else {
            continue;
        };
        if state != "0A" {
            continue; // not LISTEN
        }
        let Some(port) = local
            .rsplit(':')
            .next()
            .and_then(|p| u16::from_str_radix(p, 16).ok())
        else {
            continue;
        };
        // tx_queue:rx_queue — for a listener, rx_queue is the accept backlog.
        let Some(depth) = queues
            .split(':')
            .nth(1)
            .and_then(|q| u64::from_str_radix(q, 16).ok())
        else {
            continue;
        };
        if worst.is_none_or(|(_, w)| depth > w) {
            worst = Some((port, depth));
        }
    }
    worst
}

/// The deepest accept queue on this host, or `None` where the information is
/// not available (non-Linux, or the files cannot be read).
///
/// Reads both IPv4 and IPv6 tables: a node bound to `0.0.0.0` appears in the
/// former and one bound to `::` in the latter, and reading only one would give
/// a confident "nothing waiting" for a node whose queue is in fact full.
#[must_use]
pub fn deepest_accept_queue() -> Option<(u16, u64)> {
    let mut worst: Option<(u16, u64)> = None;
    for path in ["/proc/net/tcp", "/proc/net/tcp6"] {
        if let Ok(text) = std::fs::read_to_string(path) {
            if let Some(found) = deepest_listen_backlog(&text) {
                if worst.is_none_or(|(_, w)| found.1 > w) {
                    worst = Some(found);
                }
            }
        }
    }
    worst
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A real `/proc/net/tcp` header plus an established connection and two
    /// listeners, one of them backed up.
    const SAMPLE: &str = "  sl  local_address rem_address   st tx_queue rx_queue tr tm->when retrnsmt   uid  timeout inode
   0: 0100007F:1F91 0100007F:C350 01 00000000:00000000 00:00000000 00000000     0        0 12345 1
   1: 00000000:2607 00000000:0000 0A 00000000:00001001 00:00000000 00000000     0        0 12346 1
   2: 0100007F:2608 00000000:0000 0A 00000000:00000000 00:00000000 00000000     0        0 12347 1";

    #[test]
    fn finds_the_backed_up_listener_and_names_its_port() {
        // 0x2607 == 9735 (mainnet P2P); rx_queue 0x1001 == 4097 — the exact
        // number from the 2026-07-29 outage.
        assert_eq!(deepest_listen_backlog(SAMPLE), Some((9735, 4097)));
    }

    #[test]
    fn ignores_established_connections() {
        // Only the two LISTEN rows may be considered; the ESTABLISHED one
        // (state 01) has queues of its own that mean something different.
        let (port, _) = deepest_listen_backlog(SAMPLE).unwrap();
        assert_ne!(
            port, 8081,
            "0x1F91 is an ESTABLISHED socket, not a listener"
        );
    }

    #[test]
    fn quiet_listeners_read_zero_not_none() {
        let quiet = "  sl  local_address rem_address   st tx_queue rx_queue tr tm->when retrnsmt   uid  timeout inode
   1: 00000000:2607 00000000:0000 0A 00000000:00000000 00:00000000 00000000     0        0 12346 1";
        assert_eq!(deepest_listen_backlog(quiet), Some((9735, 0)));
    }

    #[test]
    fn no_listeners_is_none_so_a_caller_cannot_read_it_as_healthy() {
        // "Not measurable" must be distinguishable from "nothing waiting" — a
        // confident zero for a socket we never found is how a broken health
        // check reassures you.
        let none = "  sl  local_address rem_address   st tx_queue rx_queue tr tm->when retrnsmt   uid  timeout inode
   0: 0100007F:1F91 0100007F:C350 01 00000000:00000000 00:00000000 00000000     0        0 12345 1";
        assert_eq!(deepest_listen_backlog(none), None);
    }

    #[test]
    fn malformed_lines_do_not_panic() {
        assert_eq!(
            deepest_listen_backlog(
                "header
garbage
"
            ),
            None
        );
        assert_eq!(deepest_listen_backlog(""), None);
    }
}
