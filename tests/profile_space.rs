//! Profile-space ID derivation parity with feed-client.
//!
//! Profile posts land in a deterministic per-user space
//! (sha256("profile:v1:<author_pk_hex>")[..16], feed-client's
//! getProfileSpaceId). submit_post exempts a poster's OWN profile space from
//! the space-exists check because such spaces can never be created via
//! create_space (which derives space IDs from the PoW hash). This test pins
//! the derivation to a real vector observed on-device so the Rust and
//! TypeScript sides can't drift silently.

use swimchain::crypto::sha256;

#[test]
fn profile_space_id_matches_feed_client_derivation() {
    // Real vector: the on-device phone identity and the space id the feed
    // computed for it ("Space 16df0fae... does not exist" before the fix).
    let author_pk = "9838b31a9f2f8024483d877e1040eea6ef02eeeacc663fd7f2262b15aa27134f";
    let expected_space_id = "16df0fae7770160c101e73fe7f011140";

    let preimage = format!("profile:v1:{}", author_pk.to_lowercase());
    let hash = sha256(preimage.as_bytes());

    assert_eq!(
        hex::encode(&hash[..16]),
        expected_space_id,
        "profile-space derivation diverged from feed-client's getProfileSpaceId"
    );
}
