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
