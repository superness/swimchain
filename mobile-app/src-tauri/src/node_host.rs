//! In-process swimchain node lifecycle for the mobile app.
//!
//! Mirrors the CLI start path (src/cli/commands/node.rs) as a library call:
//! ensure an identity exists, build a NodeConfig, start NodeManager (which
//! brings up P2P, storage, and the RPC server on 127.0.0.1:<rpc_port>).

use std::path::{Path, PathBuf};

use swimchain::identity::{
    create_identity_with_difficulty, deserialize_portable, export_identity, import_identity,
    serialize_portable,
};
use swimchain::network::NetworkMode;
use swimchain::node::{NodeConfig, NodeManager};
use swimchain::types::KeyPair;

/// Production identity PoW difficulty (matches DEFAULT_IDENTITY_POW_DIFFICULTY
/// in src/identity/mod.rs). Creation is a one-time cost on first launch.
pub const IDENTITY_POW_DIFFICULTY: u8 = 20;

pub struct NodeHost {
    manager: NodeManager,
    pub data_dir: PathBuf,
}

/// Load the node identity from `<data_dir>/identity.enc`, creating it (plus a
/// random passphrase at `<data_dir>/identity.pass`) on first run.
///
/// The passphrase file sits beside the identity it decrypts; both live in
/// Android app-private storage, so they share a trust boundary. Keystore-backed
/// encryption is a hardening follow-up (out of scope per the spec).
/// `identity.enc` uses the CLI's portable format, so it is importable elsewhere.
pub fn ensure_identity(data_dir: &Path, pow_difficulty: u8) -> Result<KeyPair, String> {
    std::fs::create_dir_all(data_dir).map_err(|e| format!("create data dir: {e}"))?;
    let id_path = data_dir.join("identity.enc");
    let pass_path = data_dir.join("identity.pass");

    if id_path.exists() && pass_path.exists() {
        let pass =
            std::fs::read_to_string(&pass_path).map_err(|e| format!("read passphrase: {e}"))?;
        let data = std::fs::read(&id_path).map_err(|e| format!("read identity: {e}"))?;
        let portable = deserialize_portable(&data).map_err(|e| format!("parse identity: {e}"))?;
        let (keypair, _proof) = import_identity(&portable, pass.trim())
            .map_err(|e| format!("decrypt identity: {e}"))?;
        return Ok(keypair);
    }

    // Fail closed: an identity without its passphrase is unrecoverable here,
    // and regenerating would silently discard it. (The reverse — a passphrase
    // without an identity — is a harmless leftover from a crashed first run,
    // since identity.pass is written before identity.enc; regenerating both
    // below is safe.)
    if id_path.exists() {
        return Err(format!(
            "identity.enc exists at {} but its passphrase file identity.pass is missing; \
             refusing to overwrite the identity — manual intervention needed \
             (restore identity.pass or move identity.enc aside)",
            id_path.display()
        ));
    }

    let pass: String = {
        use rand::Rng;
        rand::thread_rng()
            .sample_iter(&rand::distributions::Alphanumeric)
            .take(32)
            .map(char::from)
            .collect()
    };
    let (keypair, proof) = create_identity_with_difficulty(pow_difficulty);
    let portable = export_identity(&keypair, Some(&proof), &pass)
        .map_err(|e| format!("encrypt identity: {e}"))?;
    // Write the passphrase first: if we crash between the two writes, a lone
    // identity.pass is a safe leftover (no identity existed yet), whereas a
    // lone identity.enc would be an unrecoverable identity.
    std::fs::write(&pass_path, &pass).map_err(|e| format!("write passphrase: {e}"))?;
    std::fs::write(&id_path, serialize_portable(&portable))
        .map_err(|e| format!("write identity: {e}"))?;
    Ok(keypair)
}

/// Start the node on the network's default ports.
pub async fn start(data_dir: PathBuf, network: NetworkMode) -> Result<NodeHost, String> {
    let p2p = network.default_port();
    let rpc = network.default_rpc_port();
    start_with_ports(data_dir, network, p2p, rpc).await
}

/// Start the node on explicit ports (tests use non-default ports to avoid
/// colliding with a locally running node).
pub async fn start_with_ports(
    data_dir: PathBuf,
    network: NetworkMode,
    p2p_port: u16,
    rpc_port: u16,
) -> Result<NodeHost, String> {
    let keypair = ensure_identity(&data_dir, IDENTITY_POW_DIFFICULTY)?;

    let mut config = NodeConfig::with_network_defaults(network);
    config.data_dir = data_dir.clone();
    config.listen_addr = format!("0.0.0.0:{p2p_port}")
        .parse()
        .map_err(|e| format!("listen addr: {e}"))?;
    config.rpc_port = Some(rpc_port);

    let mut manager = NodeManager::new(config, keypair).map_err(|e| format!("create node: {e}"))?;
    manager
        .start()
        .await
        .map_err(|e| format!("start node: {e}"))?;
    Ok(NodeHost { manager, data_dir })
}

impl NodeHost {
    pub fn status(&self) -> swimchain::node::NodeStatus {
        self.manager.status()
    }

    pub async fn stop(&mut self) -> Result<(), String> {
        self.manager
            .stop()
            .await
            .map_err(|e| format!("stop node: {e}"))
    }
}

/// Read `<data_dir>/.cookie` and format it as an HTTP Basic auth header value.
/// Matches desktop-app's get_rpc_auth: base64("__cookie__:<cookie>").
pub fn rpc_auth_from_cookie(data_dir: &Path) -> Result<String, String> {
    use base64::Engine;
    let cookie_path = data_dir.join(".cookie");
    let cookie = std::fs::read_to_string(&cookie_path)
        .map_err(|e| format!("read cookie {}: {e}", cookie_path.display()))?;
    let credentials = format!("__cookie__:{}", cookie.trim());
    let encoded = base64::engine::general_purpose::STANDARD.encode(credentials);
    Ok(format!("Basic {encoded}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use swimchain::network::NetworkMode;

    fn temp_dir(tag: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!("swim-mobile-{tag}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        dir
    }

    #[test]
    fn identity_created_once_and_reloaded() {
        let dir = temp_dir("id");
        // Low difficulty (4) keeps identity PoW fast in tests.
        let kp1 = ensure_identity(&dir, 4).expect("create identity");
        let kp2 = ensure_identity(&dir, 4).expect("reload identity");
        assert_eq!(
            kp1.public_key.as_bytes(),
            kp2.public_key.as_bytes(),
            "second call must load the same identity, not create a new one"
        );
        assert!(dir.join("identity.enc").exists());
        assert!(dir.join("identity.pass").exists());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn identity_enc_without_pass_errors() {
        let dir = temp_dir("enc-no-pass");
        ensure_identity(&dir, 4).expect("create identity");

        let enc_before = std::fs::read(dir.join("identity.enc")).expect("read enc");
        std::fs::remove_file(dir.join("identity.pass")).expect("delete pass");

        let result = ensure_identity(&dir, 4);
        assert!(
            result.is_err(),
            "identity.enc without identity.pass must fail closed, not regenerate"
        );
        let err = result.unwrap_err();
        assert!(
            err.contains("identity.pass"),
            "error should name the missing file: {err}"
        );

        let enc_after = std::fs::read(dir.join("identity.enc")).expect("read enc after");
        assert_eq!(
            enc_before, enc_after,
            "identity.enc must not be overwritten on the error path"
        );
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn pass_without_enc_regenerates() {
        let dir = temp_dir("pass-no-enc");
        ensure_identity(&dir, 4).expect("create identity");

        std::fs::remove_file(dir.join("identity.enc")).expect("delete enc");

        // A passphrase without an identity is a leftover from a crashed first
        // run; no identity ever existed, so regenerating is safe.
        ensure_identity(&dir, 4).expect("pass-only leftover should regenerate");
        assert!(dir.join("identity.enc").exists());
        assert!(dir.join("identity.pass").exists());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn regtest_node_starts_writes_cookie_and_stops() {
        let dir = temp_dir("node");
        // Pre-create identity at low difficulty so start() loads it.
        ensure_identity(&dir, 4).expect("identity");

        // Non-default ports so a locally running regtest node can't collide.
        let mut host = start_with_ports(dir.clone(), NetworkMode::Regtest, 39735, 39736)
            .await
            .expect("node starts");

        // The RPC server writes .cookie on startup; poll briefly.
        let cookie = dir.join(".cookie");
        let mut waited = 0;
        while !cookie.exists() && waited < 100 {
            tokio::time::sleep(std::time::Duration::from_millis(100)).await;
            waited += 1;
        }
        assert!(
            cookie.exists(),
            "RPC server should write {}",
            cookie.display()
        );

        let auth = rpc_auth_from_cookie(&dir).expect("auth string");
        assert!(auth.starts_with("Basic "), "got: {auth}");

        let status = host.status();
        assert!(
            status.uptime_seconds < 3600,
            "sane status: {:?}",
            status.state
        );

        host.stop().await.expect("node stops");
        let _ = std::fs::remove_dir_all(&dir);
    }
}
