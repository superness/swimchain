use swimchain::types::space_class::{apply_class, SpaceClass};

// Serde contract: the string tag the RPC must emit for each class.
fn class_tag(id: &[u8; 16]) -> &'static str {
    match swimchain::types::space_class::class_of(id) {
        Some(SpaceClass::Social) => "social",
        Some(SpaceClass::Profile) => "profile",
        Some(SpaceClass::Dm) => "dm",
        Some(SpaceClass::Private) => "private",
        Some(SpaceClass::App) => "app",
        None => "unknown",
    }
}

#[test]
fn social_id_tags_social() {
    let id = apply_class(SpaceClass::Social, &[0x11u8; 32]);
    assert_eq!(class_tag(&id), "social");
}

#[test]
fn app_id_tags_app() {
    let id = apply_class(SpaceClass::App, &[0x22u8; 32]);
    assert_eq!(class_tag(&id), "app");
}
