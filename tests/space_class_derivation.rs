use swimchain::crypto::sha256;
use swimchain::types::space_class::{class_of, SpaceClass};

// Mirror of the node's derivation formulas — asserts the class byte is present.
#[test]
fn app_space_id_has_app_class() {
    // app_space_id_16 is private; assert the shape the node must produce.
    let h = sha256(b"app:wiki:v1:Minecraft");
    let mut id = [0u8; 16];
    id[0] = 0x05;
    id[1..16].copy_from_slice(&h[..15]);
    assert_eq!(class_of(&id), Some(SpaceClass::App));
}

#[test]
fn profile_space_id_has_profile_class() {
    let h = sha256(b"profile:v1:deadbeef");
    let mut id = [0u8; 16];
    id[0] = 0x02;
    id[1..16].copy_from_slice(&h[..15]);
    assert_eq!(class_of(&id), Some(SpaceClass::Profile));
}
