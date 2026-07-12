//! Space-class taxonomy. The first byte of a 16-byte space id encodes the
//! class, so any node/client can classify a space from its id alone — no name
//! lookup, and unknown bytes are simply not any known class.

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SpaceClass {
    Social,
    Profile,
    Dm,
    Private,
    App,
}

impl SpaceClass {
    pub fn byte(self) -> u8 {
        match self {
            SpaceClass::Social => 0x01,
            SpaceClass::Profile => 0x02,
            SpaceClass::Dm => 0x03,
            SpaceClass::Private => 0x04,
            SpaceClass::App => 0x05,
        }
    }

    pub fn from_byte(b: u8) -> Option<SpaceClass> {
        match b {
            0x01 => Some(SpaceClass::Social),
            0x02 => Some(SpaceClass::Profile),
            0x03 => Some(SpaceClass::Dm),
            0x04 => Some(SpaceClass::Private),
            0x05 => Some(SpaceClass::App),
            _ => None,
        }
    }
}

/// `class.byte() ‖ hash[..15]`. Panics if `hash` is shorter than 15 bytes.
pub fn apply_class(class: SpaceClass, hash: &[u8]) -> [u8; 16] {
    assert!(hash.len() >= 15, "hash must be >= 15 bytes");
    let mut out = [0u8; 16];
    out[0] = class.byte();
    out[1..16].copy_from_slice(&hash[..15]);
    out
}

pub fn class_of(space_id_16: &[u8; 16]) -> Option<SpaceClass> {
    SpaceClass::from_byte(space_id_16[0])
}

/// Parse `name` into `(app, display)` if it is a well-formed app marker
/// (`@<app>:<display>`), else `None`.
pub fn parse_app_space_name(name: &str) -> Option<(String, String)> {
    let rest = name.strip_prefix('@')?;
    let (app, display) = rest.split_once(':')?;
    if app.is_empty() || app.len() > 32 || display.is_empty() {
        return None;
    }
    if !app
        .bytes()
        .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-')
    {
        return None;
    }
    Some((app.to_string(), display.to_string()))
}

/// Deterministic id for an app-namespaced space: `sha256("app:<app>:v1:<display>")[..16]`,
/// App-classed. Name-addressed like profile spaces, so a given `@<app>:<display>` is one
/// shared space any client can recognize.
pub fn app_space_id_16(app: &str, display: &str) -> [u8; 16] {
    let h = crate::crypto::sha256(format!("app:{}:v1:{}", app, display).as_bytes());
    apply_class(SpaceClass::App, &h)
}

/// Canonical space-id derivation, shared by the node's `create_space` RPC and the
/// `sw space create` CLI so both compute the *same* id. App-namespaced names
/// (`@app:display`) are name-addressed; everything else is a Social space keyed by
/// its PoW hash. `pow_hash` must be at least 15 bytes.
pub fn derive_space_id(name: &str, pow_hash: &[u8]) -> [u8; 16] {
    match parse_app_space_name(name) {
        Some((app, display)) => app_space_id_16(&app, &display),
        None => apply_class(SpaceClass::Social, pow_hash),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn byte_values_are_stable() {
        assert_eq!(SpaceClass::Social.byte(), 0x01);
        assert_eq!(SpaceClass::Profile.byte(), 0x02);
        assert_eq!(SpaceClass::Dm.byte(), 0x03);
        assert_eq!(SpaceClass::Private.byte(), 0x04);
        assert_eq!(SpaceClass::App.byte(), 0x05);
    }

    #[test]
    fn apply_then_class_roundtrips() {
        let hash = [0xABu8; 32];
        let id = apply_class(SpaceClass::Dm, &hash);
        assert_eq!(id[0], 0x03);
        assert_eq!(&id[1..], &hash[..15]);
        assert_eq!(class_of(&id), Some(SpaceClass::Dm));
    }

    #[test]
    fn class_of_unknown_byte_is_none() {
        let id = [0x00u8; 16];
        assert_eq!(class_of(&id), None);
    }
}
