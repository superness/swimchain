use swimchain::types::space_class::{class_of, SpaceClass};

#[test]
fn unknown_class_byte_is_rejected_shape() {
    // A CreateSpace id whose first byte is not a known class must be invalid.
    let bad = [0x00u8; 16];
    assert!(class_of(&bad).is_none());
    // The validation fn (added in Step 3) must reject ids where class_of is None.
    assert!(!swimchain::blocks::validation::space_id_class_is_valid(
        &bad
    ));
    let good = [0x01u8; 16];
    assert!(swimchain::blocks::validation::space_id_class_is_valid(
        &good
    ));
    let _ = SpaceClass::Social;
}
