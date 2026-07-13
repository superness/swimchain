//! Sponsorship management commands
//!
//! Implements the full sponsorship lifecycle per SPEC_11:
//! - Genesis identity claiming (bootstrap)
//! - Creating sponsorship offers
//! - Claiming offers (for new users)
//! - Approving/rejecting claims (for sponsors)
//!
//! All commands communicate with the running node via RPC.

use crate::cli::commands::identity::prompt_password;
use crate::cli::config::CliConfig;
use crate::cli::error::{CliError, Result};
use crate::crypto::signature::sign;
use crate::identity::{encode_address_from_pubkey, import_identity};
use crate::network::NetworkContext;
use crate::rpc::types::{
    ApproveSponsorshipClaimResult, CancelSponsorshipOfferResult, ClaimSponsorshipOfferResult,
    CreateSponsorshipOfferResult, GetSponsorshipOfferResult, ListMySponsorshipOffersResult,
    RegisterGenesisIdentityResult, RegisterSponsoredIdentityResult, RejectSponsorshipClaimResult,
    SponsorshipInfo,
};
use crate::rpc::{RpcClient, RpcClientConfig};
use crate::sponsorship::{
    is_in_hardcoded_genesis_list, PublicSponsorshipOffer, SponsorshipOfferType,
};
use crate::types::identity::PublicKey;
use clap::Subcommand;
use serde::Serialize;
use serde_json::json;
use std::fs;
use std::time::{SystemTime, UNIX_EPOCH};

/// Sponsorship management commands
#[derive(Subcommand, Debug)]
pub enum SponsorCmd {
    /// Claim your genesis slot (for genesis identities only)
    #[command(
        about = "Claim your genesis slot (genesis identities only)",
        long_about = "If your identity is in the hardcoded genesis list, claim your slot to \
                      become a founding member. Genesis identities can create spaces and \
                      sponsor new users immediately.",
        after_help = "EXAMPLES:\n  sw sponsor genesis-claim --slot 0"
    )]
    GenesisClaim {
        /// Genesis slot number to claim (0-99)
        #[arg(long)]
        slot: u16,
    },

    /// Check genesis status
    #[command(
        about = "Check if your identity is in the genesis list",
        after_help = "EXAMPLES:\n  sw sponsor genesis-status"
    )]
    GenesisStatus,

    /// Create a sponsorship offer for new users
    #[command(
        about = "Create a sponsorship offer",
        long_about = "Create a public sponsorship offer that new users can claim. \
                      You must be at least Resident level to sponsor new users.",
        after_help = "EXAMPLES:\n  sw sponsor offer-create --slots 3 --expires-days 7\n  \
                      sw sponsor offer-create --slots 1 --type open"
    )]
    OfferCreate {
        /// Maximum number of users who can claim this offer
        #[arg(long, default_value = "1")]
        slots: u8,

        /// Offer type: 'probationary' (default) or 'open'
        #[arg(long, default_value = "probationary")]
        offer_type: String,

        /// Days until offer expires
        #[arg(long, default_value = "30")]
        expires_days: u32,

        /// Minimum PoW difficulty required from claimants (0-255)
        #[arg(long, default_value = "0")]
        min_pow: u8,

        /// Require application text from claimants
        #[arg(long)]
        require_application: bool,
    },

    /// Create an instant-join invite link (auto-approve offer)
    #[command(
        about = "Create an invite link that auto-approves its claimant",
        long_about = "Create a sponsorship offer with auto-approve enabled and print an \
                      invite token/URL. A newcomer who opens the link becomes sponsored in \
                      one step — no waiting for manual approval. The node running your \
                      identity must be online to approve claims.",
        after_help = "EXAMPLES:\n  sw sponsor invite\n  \
                      sw sponsor invite --slots 3 --expires-hours 48"
    )]
    Invite {
        /// Maximum number of users who can claim this invite
        #[arg(long, default_value = "1")]
        slots: u8,

        /// Hours until the invite expires (rounded up to whole days)
        #[arg(long, default_value = "168")]
        expires_hours: u32,
    },

    /// List your sponsorship offers
    #[command(
        about = "List your sponsorship offers",
        after_help = "EXAMPLES:\n  sw sponsor offer-list\n  sw sponsor offer-list --json"
    )]
    OfferList {
        /// Output in JSON format
        #[arg(long)]
        json: bool,
    },

    /// View offer details and pending claims
    #[command(
        about = "View offer details",
        after_help = "EXAMPLES:\n  sw sponsor offer-view abc123"
    )]
    OfferView {
        /// Offer ID (hex)
        offer_id: String,

        /// Output in JSON format
        #[arg(long)]
        json: bool,
    },

    /// Cancel an offer
    #[command(
        about = "Cancel an offer",
        after_help = "EXAMPLES:\n  sw sponsor offer-cancel abc123"
    )]
    OfferCancel {
        /// Offer ID (hex)
        offer_id: String,
    },

    /// Claim a sponsorship offer (for new users)
    #[command(
        about = "Claim a sponsorship offer",
        long_about = "Submit a claim on a sponsorship offer. You will need to wait for \
                      the sponsor to approve your claim.",
        after_help = "EXAMPLES:\n  sw sponsor claim abc123\n  \
                      sw sponsor claim abc123 --application \"I want to join because...\""
    )]
    Claim {
        /// Offer ID (hex)
        offer_id: String,

        /// Optional application text
        #[arg(long)]
        application: Option<String>,
    },

    /// Approve a pending claim (as sponsor)
    #[command(
        about = "Approve a pending claim",
        after_help = "EXAMPLES:\n  sw sponsor approve abc123 sw1abc..."
    )]
    Approve {
        /// Offer ID (hex)
        offer_id: String,

        /// Claimant's address
        claimant: String,
    },

    /// Reject a pending claim (as sponsor)
    #[command(
        about = "Reject a pending claim",
        after_help = "EXAMPLES:\n  sw sponsor reject abc123 sw1abc..."
    )]
    Reject {
        /// Offer ID (hex)
        offer_id: String,

        /// Claimant's address
        claimant: String,
    },

    /// View your sponsorship status
    #[command(
        about = "View your sponsorship status",
        after_help = "EXAMPLES:\n  sw sponsor status"
    )]
    Status {
        /// Output in JSON format
        #[arg(long)]
        json: bool,
    },

    /// Directly sponsor an identity (genesis identities only, for testing)
    #[command(
        about = "Directly sponsor an identity",
        long_about = "Directly sponsor an identity without going through the offer/claim flow. \
                      Only available to genesis identities. Useful for testing and bootstrapping.",
        after_help = "EXAMPLES:\n  sw sponsor direct cs1abc...\n  sw sponsor direct cs1abc... --probationary"
    )]
    Direct {
        /// Address to sponsor
        address: String,

        /// Make the sponsorship probationary
        #[arg(long)]
        probationary: bool,
    },
}

/// JSON output structures
#[derive(Serialize)]
struct SponsorshipStatusOutput {
    is_sponsored: bool,
    is_genesis: bool,
    level: String,
    sponsor: Option<String>,
    depth: u8,
    can_sponsor: bool,
}

/// Execute a sponsor command
pub fn execute(cmd: SponsorCmd, config: &CliConfig) -> Result<()> {
    match cmd {
        SponsorCmd::GenesisClaim { slot } => genesis_claim(config, slot),
        SponsorCmd::GenesisStatus => genesis_status(config),
        SponsorCmd::OfferCreate {
            slots,
            offer_type,
            expires_days,
            min_pow,
            require_application,
        } => offer_create(
            config,
            slots,
            &offer_type,
            expires_days,
            min_pow,
            require_application,
        ),
        SponsorCmd::Invite {
            slots,
            expires_hours,
        } => invite(config, slots, expires_hours),
        SponsorCmd::OfferList { json } => offer_list(config, json),
        SponsorCmd::OfferView { offer_id, json } => offer_view(config, &offer_id, json),
        SponsorCmd::OfferCancel { offer_id } => offer_cancel(config, &offer_id),
        SponsorCmd::Claim {
            offer_id,
            application,
        } => claim_offer(config, &offer_id, application),
        SponsorCmd::Approve { offer_id, claimant } => approve(config, &offer_id, &claimant),
        SponsorCmd::Reject { offer_id, claimant } => reject(config, &offer_id, &claimant),
        SponsorCmd::Status { json } => status(config, json),
        SponsorCmd::Direct {
            address,
            probationary,
        } => direct_sponsor(config, &address, probationary),
    }
}

/// Get current Unix timestamp
fn current_time() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("system time")
        .as_secs()
}

/// Load identity keypair
fn load_keypair(config: &CliConfig) -> Result<crate::types::identity::KeyPair> {
    let identity_path = config.identity_path();
    if !identity_path.exists() {
        return Err(CliError::NoIdentity);
    }

    let data = fs::read(&identity_path)?;
    let portable = crate::identity::deserialize_portable(&data)
        .map_err(|e| CliError::InvalidIdentityFile(e.to_string()))?;

    let password = prompt_password(false)?;
    let (keypair, _) = import_identity(&portable, &password)?;
    Ok(keypair)
}

/// Create an RPC client for the running node
fn create_rpc_client(config: &CliConfig) -> Result<RpcClient> {
    let data_dir = config.data_dir();

    let rpc_config = match RpcClientConfig::from_data_dir(&data_dir) {
        Ok(c) => c,
        Err(_) => {
            let network_mode = NetworkContext::mode();
            let rpc_port = network_mode.default_rpc_port();
            let addr = format!("127.0.0.1:{}", rpc_port)
                .parse()
                .map_err(|e| CliError::Other(format!("Invalid RPC address: {}", e)))?;
            RpcClientConfig {
                addr,
                ..Default::default()
            }
        }
    };

    let cookie = fs::read_to_string(data_dir.join(".cookie")).map_err(|e| {
        CliError::Other(format!(
            "Failed to read RPC cookie: {}. Is the node running?",
            e
        ))
    })?;

    let rpc_config = RpcClientConfig {
        cookie: Some(cookie),
        ..rpc_config
    };

    Ok(RpcClient::new(rpc_config))
}

/// Helper to call RPC and map errors
fn rpc_call_result<T: serde::de::DeserializeOwned>(
    client: &mut RpcClient,
    method: &str,
    params: serde_json::Value,
) -> Result<T> {
    client
        .call_result::<T>(method, params)
        .map_err(|e| CliError::Other(format!("RPC error: {}", e)))
}

/// Claim genesis slot
fn genesis_claim(config: &CliConfig, slot: u16) -> Result<()> {
    let keypair = load_keypair(config)?;
    let pubkey = keypair.public_key;

    // Client-side check (pure function over compiled-in data)
    if !is_in_hardcoded_genesis_list(&pubkey) {
        return Err(CliError::Other(
            "Your identity is not in the genesis list. You need sponsorship from an existing member.".into()
        ));
    }

    let mut client = create_rpc_client(config)?;
    let now = current_time();
    let pubkey_hex = hex::encode(pubkey.as_bytes());

    let result: RegisterGenesisIdentityResult = rpc_call_result(
        &mut client,
        "register_genesis_identity",
        json!({
            "identity_pubkey": pubkey_hex,
            "slot_number": slot,
            "timestamp": now
        }),
    )?;

    let address = encode_address_from_pubkey(&pubkey);
    println!("Genesis slot {} claimed successfully!", result.slot_number);
    println!("Address: {}", address);
    println!("Status: Active (Resident level)");
    println!();
    println!("You can now:");
    println!("  - Create spaces: sw space create --name \"My Space\"");
    println!("  - Sponsor new users: sw sponsor offer-create --slots 5");

    Ok(())
}

/// Check genesis status
fn genesis_status(config: &CliConfig) -> Result<()> {
    let keypair = load_keypair(config)?;
    let pubkey = keypair.public_key;
    let address = encode_address_from_pubkey(&pubkey);

    let is_in_list = is_in_hardcoded_genesis_list(&pubkey);

    let mut client = create_rpc_client(config)?;
    let pubkey_hex = hex::encode(pubkey.as_bytes());

    let info: SponsorshipInfo = rpc_call_result(
        &mut client,
        "get_sponsorship_info",
        json!({ "identity_pubkey": pubkey_hex }),
    )?;

    if is_in_list {
        if info.is_sponsored && info.is_genesis {
            println!("Genesis Status: CLAIMED");
            println!("Address: {}", address);
            println!("Level: Resident (genesis)");
            println!();
            println!("You have full sponsorship capabilities.");
        } else {
            println!("Genesis Status: ELIGIBLE (not yet claimed)");
            println!("Address: {}", address);
            println!();
            println!("Claim your genesis slot with:");
            println!("  sw sponsor genesis-claim --slot <0-99>");
        }
    } else {
        println!("Genesis Status: NOT IN LIST");
        println!("Address: {}", address);
        println!();
        println!("Your identity is not in the genesis list.");
        println!("You need sponsorship from an existing member to join.");
    }

    Ok(())
}

/// Create a sponsorship offer
fn offer_create(
    config: &CliConfig,
    slots: u8,
    offer_type: &str,
    expires_days: u32,
    min_pow: u8,
    require_application: bool,
) -> Result<()> {
    let keypair = load_keypair(config)?;
    let pubkey = keypair.public_key;
    let pubkey_hex = hex::encode(pubkey.as_bytes());

    // Parse offer type for signature construction
    let offer_type_enum = match offer_type.to_lowercase().as_str() {
        "probationary" => SponsorshipOfferType::Probationary,
        "open" => SponsorshipOfferType::Open,
        _ => {
            return Err(CliError::Other(
                "Invalid offer type. Use 'probationary' or 'open'.".into(),
            ))
        }
    };

    let now = current_time();

    // Build signature message matching server's verification
    let sig_msg = PublicSponsorshipOffer::signature_message_for_creation(
        pubkey.as_bytes(),
        slots,
        &offer_type_enum,
        expires_days,
        min_pow,
        require_application,
        now,
    );
    let signature = sign(&keypair.private_key, &sig_msg);
    let sig_hex = hex::encode(signature.as_bytes());

    let mut client = create_rpc_client(config)?;

    let result: CreateSponsorshipOfferResult = rpc_call_result(
        &mut client,
        "create_sponsorship_offer",
        json!({
            "sponsor_pubkey": pubkey_hex,
            "slots": slots,
            "offer_type": offer_type.to_lowercase(),
            "expires_days": expires_days,
            "min_pow_difficulty": min_pow,
            "application_required": require_application,
            "signature": sig_hex,
            "timestamp": now
        }),
    )?;

    println!("Sponsorship offer created!");
    println!("Offer ID: {}", result.offer_id);
    println!("Slots: {}", result.slots);
    println!("Type: {}", offer_type);
    println!("Expires: {} days", expires_days);
    println!();
    println!("Share this offer ID with users who want to join:");
    println!("  sw sponsor claim {}", result.offer_id);

    Ok(())
}

/// Create an auto-approve invite offer and print the invite token/URL
fn invite(config: &CliConfig, slots: u8, expires_hours: u32) -> Result<()> {
    use base64::Engine;

    if expires_hours == 0 {
        return Err(CliError::Other("--expires-hours must be at least 1".into()));
    }

    let keypair = load_keypair(config)?;
    let pubkey = keypair.public_key;
    let pubkey_hex = hex::encode(pubkey.as_bytes());

    // The offer signature message carries whole days; round hours up.
    let expires_days = ((expires_hours + 23) / 24).clamp(1, 365);

    let offer_type_enum = SponsorshipOfferType::Open;
    let now = current_time();

    // Build signature message matching server's verification
    let sig_msg = PublicSponsorshipOffer::signature_message_for_creation(
        pubkey.as_bytes(),
        slots,
        &offer_type_enum,
        expires_days,
        0,     // min_pow_difficulty
        false, // application_required
        now,
    );
    let signature = sign(&keypair.private_key, &sig_msg);
    let sig_hex = hex::encode(signature.as_bytes());

    let mut client = create_rpc_client(config)?;

    let result: CreateSponsorshipOfferResult = rpc_call_result(
        &mut client,
        "create_sponsorship_offer",
        json!({
            "sponsor_pubkey": pubkey_hex,
            "slots": slots,
            "offer_type": "open",
            "expires_days": expires_days,
            "min_pow_difficulty": 0,
            "application_required": false,
            "auto_approve": true,
            "signature": sig_hex,
            "timestamp": now
        }),
    )?;

    // Build the invite token: base64url(JSON{v, offer_id, sponsor, net})
    let net = NetworkContext::mode().name();
    let token_json = json!({
        "v": 1,
        "offer_id": result.offer_id,
        "sponsor": pubkey_hex,
        "net": net,
    });
    let token =
        base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(token_json.to_string().as_bytes());

    println!("Invite created!");
    println!("Offer ID: {}", result.offer_id);
    println!("Slots: {}", result.slots);
    println!(
        "Expires: in {} day(s) (at unix {})",
        expires_days, result.expires_at
    );
    println!("Network: {}", net);
    println!();
    println!("Invite token:");
    println!("  {}", token);
    println!();
    println!("Invite URL:");
    println!("  https://swimchain.io/i/#{}", token);
    println!();
    println!("Anyone who opens this link joins instantly — no approval step.");
    println!("Keep your node running so claims can be auto-approved.");

    Ok(())
}

/// List offers
fn offer_list(config: &CliConfig, json: bool) -> Result<()> {
    let keypair = load_keypair(config)?;
    let pubkey = keypair.public_key;
    let pubkey_hex = hex::encode(pubkey.as_bytes());

    let now = current_time();

    // Build signature: "swimchain-list-offers:" || sponsor(32) || timestamp(8 BE)
    let mut sig_msg = Vec::with_capacity(62);
    sig_msg.extend_from_slice(b"swimchain-list-offers:");
    sig_msg.extend_from_slice(pubkey.as_bytes());
    sig_msg.extend_from_slice(&now.to_be_bytes());
    let signature = sign(&keypair.private_key, &sig_msg);
    let sig_hex = hex::encode(signature.as_bytes());

    let mut client = create_rpc_client(config)?;

    let result: ListMySponsorshipOffersResult = rpc_call_result(
        &mut client,
        "list_my_sponsorship_offers",
        json!({
            "sponsor_pubkey": pubkey_hex,
            "signature": sig_hex,
            "timestamp": now
        }),
    )?;

    if result.offers.is_empty() {
        if !json {
            println!("No sponsorship offers found.");
            println!();
            println!("Create one with: sw sponsor offer-create --slots 3");
        } else {
            println!("[]");
        }
        return Ok(());
    }

    if json {
        crate::cli::output::print_json(&result.offers)?;
    } else {
        println!("Your Sponsorship Offers:\n");
        for offer in &result.offers {
            let expired = if offer.is_expired { " (EXPIRED)" } else { "" };
            println!("  ID: {}{}", offer.offer_id, expired);
            println!("  Type: {}", offer.offer_type);
            println!(
                "  Slots: {}/{} claimed, {} pending",
                offer.slots_claimed, offer.slots_total, offer.slots_pending
            );
            println!();
        }
    }

    Ok(())
}

/// View offer details
fn offer_view(config: &CliConfig, offer_id: &str, json: bool) -> Result<()> {
    // Try to load keypair for seeing pending claims (optional)
    let caller_pubkey = load_keypair(config)
        .ok()
        .map(|kp| hex::encode(kp.public_key.as_bytes()));

    let mut client = create_rpc_client(config)?;

    let result: GetSponsorshipOfferResult = rpc_call_result(
        &mut client,
        "get_sponsorship_offer",
        json!({
            "offer_id": offer_id,
            "caller_pubkey": caller_pubkey
        }),
    )?;

    if json {
        crate::cli::output::print_json(&result)?;
    } else {
        let slots_remaining = result
            .slots_total
            .saturating_sub(result.slots_total.saturating_sub(result.slots_remaining));
        println!("Offer Details:");
        println!("  ID: {}", result.offer_id);
        println!("  Sponsor: {}", result.sponsor_pubkey);
        println!("  Type: {}", result.offer_type);
        println!(
            "  Slots remaining: {}/{}",
            result.slots_remaining, result.slots_total
        );
        println!("  Pending claims: {}", result.pending_claims.len());

        if !result.pending_claims.is_empty() {
            println!();
            println!("Pending Claims:");
            for claim in &result.pending_claims {
                println!("  - {}", claim.claimant_pubkey);
                if let Some(ref text) = claim.application_text {
                    println!("    Application: {}", text);
                }
            }
        }
    }

    Ok(())
}

/// Cancel offer
fn offer_cancel(config: &CliConfig, offer_id: &str) -> Result<()> {
    let keypair = load_keypair(config)?;
    let pubkey = keypair.public_key;
    let pubkey_hex = hex::encode(pubkey.as_bytes());

    let offer_id_bytes = parse_offer_id(offer_id)?;
    let now = current_time();

    // Build signature: offer_id(16) || timestamp(8 BE)
    let mut sig_msg = Vec::with_capacity(24);
    sig_msg.extend_from_slice(&offer_id_bytes);
    sig_msg.extend_from_slice(&now.to_be_bytes());
    let signature = sign(&keypair.private_key, &sig_msg);
    let sig_hex = hex::encode(signature.as_bytes());

    let mut client = create_rpc_client(config)?;

    let _result: CancelSponsorshipOfferResult = rpc_call_result(
        &mut client,
        "cancel_sponsorship_offer",
        json!({
            "offer_id": offer_id,
            "sponsor_pubkey": pubkey_hex,
            "signature": sig_hex,
            "timestamp": now
        }),
    )?;

    println!("Offer {} cancelled.", offer_id);
    Ok(())
}

/// Claim an offer (for new users)
fn claim_offer(config: &CliConfig, offer_id: &str, application: Option<String>) -> Result<()> {
    use rand::RngCore;
    use sha2::{Digest, Sha256};

    let keypair = load_keypair(config)?;
    let pubkey = keypair.public_key;
    let pubkey_hex = hex::encode(pubkey.as_bytes());

    let offer_id_bytes = parse_offer_id(offer_id)?;
    let now = current_time();

    // Mine PoW: sha256(pow_nonce_space || pow_nonce) must have at least 1 leading zero byte
    // This is a simple SHA-256 based PoW for sponsorship claims per SPEC_11
    println!("Mining proof-of-work for sponsorship claim...");

    let mut pow_nonce_space = [0u8; 32];
    rand::thread_rng().fill_bytes(&mut pow_nonce_space);

    let mut pow_nonce: u64 = 0;
    let pow_hash: [u8; 32];
    let min_difficulty = 1usize; // At least 1 leading zero byte

    loop {
        let mut pow_input = Vec::with_capacity(40);
        pow_input.extend_from_slice(&pow_nonce_space);
        pow_input.extend_from_slice(&pow_nonce.to_le_bytes());
        let hash = Sha256::digest(&pow_input);
        let leading_zeros = hash.iter().take_while(|&&b| b == 0).count();

        if leading_zeros >= min_difficulty {
            pow_hash = hash.into();
            break;
        }

        pow_nonce = pow_nonce.wrapping_add(1);
        if pow_nonce % 100_000 == 0 {
            print!(".");
            use std::io::Write;
            std::io::stdout().flush().ok();
        }
    }
    println!(" done! (nonce: {})", pow_nonce);

    // Build signature: offer_id(16) || claimant(32) || timestamp(8 BE) || pow_hash(32)
    let mut sig_msg = Vec::with_capacity(88);
    sig_msg.extend_from_slice(&offer_id_bytes);
    sig_msg.extend_from_slice(pubkey.as_bytes());
    sig_msg.extend_from_slice(&now.to_be_bytes());
    sig_msg.extend_from_slice(&pow_hash);
    let signature = sign(&keypair.private_key, &sig_msg);
    let sig_hex = hex::encode(signature.as_bytes());

    let mut client = create_rpc_client(config)?;

    let _result: ClaimSponsorshipOfferResult = rpc_call_result(
        &mut client,
        "claim_sponsorship_offer",
        json!({
            "offer_id": offer_id,
            "claimant_pubkey": pubkey_hex,
            "application_text": application,
            "pow_nonce": pow_nonce,
            "pow_difficulty": min_difficulty as u64,
            "pow_nonce_space": hex::encode(pow_nonce_space),
            "pow_hash": hex::encode(pow_hash),
            "signature": sig_hex,
            "timestamp": now
        }),
    )?;

    println!("Claim submitted successfully!");
    println!();
    println!("Your claim is now pending approval by the sponsor.");
    println!("Check status with: sw sponsor status");

    Ok(())
}

/// Approve a claim
fn approve(config: &CliConfig, offer_id: &str, claimant_addr: &str) -> Result<()> {
    let keypair = load_keypair(config)?;
    let pubkey = keypair.public_key;
    let pubkey_hex = hex::encode(pubkey.as_bytes());

    let claimant = parse_address(claimant_addr)?;
    let claimant_hex = hex::encode(claimant.as_bytes());

    let now = current_time();

    // Build signature: claimant(32) || timestamp(8 BE)
    let mut sig_msg = Vec::with_capacity(40);
    sig_msg.extend_from_slice(claimant.as_bytes());
    sig_msg.extend_from_slice(&now.to_be_bytes());
    let signature = sign(&keypair.private_key, &sig_msg);
    let sig_hex = hex::encode(signature.as_bytes());

    let mut client = create_rpc_client(config)?;

    let result: ApproveSponsorshipClaimResult = rpc_call_result(
        &mut client,
        "approve_sponsorship_claim",
        json!({
            "offer_id": offer_id,
            "claimant_pubkey": claimant_hex,
            "sponsor_pubkey": pubkey_hex,
            "signature": sig_hex,
            "timestamp": now
        }),
    )?;

    println!("Claim approved!");
    println!("New member: {}", result.claimant_address);
    println!("Probationary: {}", result.probationary);
    println!("Depth: {}", result.depth);

    Ok(())
}

/// Reject a claim
fn reject(config: &CliConfig, offer_id: &str, claimant_addr: &str) -> Result<()> {
    let keypair = load_keypair(config)?;
    let pubkey = keypair.public_key;
    let pubkey_hex = hex::encode(pubkey.as_bytes());

    let claimant = parse_address(claimant_addr)?;
    let claimant_hex = hex::encode(claimant.as_bytes());

    let now = current_time();

    // Build signature: claimant(32) || timestamp(8 BE)
    let mut sig_msg = Vec::with_capacity(40);
    sig_msg.extend_from_slice(claimant.as_bytes());
    sig_msg.extend_from_slice(&now.to_be_bytes());
    let signature = sign(&keypair.private_key, &sig_msg);
    let sig_hex = hex::encode(signature.as_bytes());

    let mut client = create_rpc_client(config)?;

    let _result: RejectSponsorshipClaimResult = rpc_call_result(
        &mut client,
        "reject_sponsorship_claim",
        json!({
            "offer_id": offer_id,
            "claimant_pubkey": claimant_hex,
            "sponsor_pubkey": pubkey_hex,
            "signature": sig_hex,
            "timestamp": now
        }),
    )?;

    println!("Claim rejected.");
    Ok(())
}

/// View sponsorship status
fn status(config: &CliConfig, json: bool) -> Result<()> {
    let keypair = load_keypair(config)?;
    let pubkey = keypair.public_key;
    let address = encode_address_from_pubkey(&pubkey);
    let pubkey_hex = hex::encode(pubkey.as_bytes());

    let mut client = create_rpc_client(config)?;

    let info: SponsorshipInfo = rpc_call_result(
        &mut client,
        "get_sponsorship_info",
        json!({ "identity_pubkey": pubkey_hex }),
    )?;

    if info.is_sponsored {
        let level = if info.is_genesis {
            "Resident (genesis)"
        } else if info.probationary {
            "NewSwimmer (probationary)"
        } else {
            "NewSwimmer"
        };

        let can_sponsor = info.is_genesis || (!info.probationary && info.depth < 5);

        if json {
            let output = SponsorshipStatusOutput {
                is_sponsored: true,
                is_genesis: info.is_genesis,
                level: level.to_string(),
                sponsor: info.sponsor_pubkey,
                depth: info.depth,
                can_sponsor,
            };
            crate::cli::output::print_json(&output)?;
        } else {
            println!("Sponsorship Status: ACTIVE");
            println!("Address: {}", address);
            println!("Level: {}", level);
            if let Some(ref sponsor) = info.sponsor_pubkey {
                println!("Sponsor: {}", sponsor);
            }
            println!("Depth: {}", info.depth);
            println!("Can sponsor others: {}", can_sponsor);
        }
    } else {
        if json {
            let output = SponsorshipStatusOutput {
                is_sponsored: false,
                is_genesis: false,
                level: "None".to_string(),
                sponsor: None,
                depth: 0,
                can_sponsor: false,
            };
            crate::cli::output::print_json(&output)?;
        } else {
            println!("Sponsorship Status: NOT SPONSORED");
            println!("Address: {}", address);
            println!();
            if is_in_hardcoded_genesis_list(&pubkey) {
                println!("You are eligible for genesis. Claim with:");
                println!("  sw sponsor genesis-claim --slot <0-99>");
            } else {
                println!(
                    "You need sponsorship to participate. Ask an existing member for an offer ID."
                );
                println!("Then claim it with: sw sponsor claim <offer-id>");
            }
        }
    }

    Ok(())
}

/// Directly sponsor an identity (genesis only, for testing)
fn direct_sponsor(config: &CliConfig, address: &str, probationary: bool) -> Result<()> {
    let keypair = load_keypair(config)?;
    let sponsor_pubkey = keypair.public_key;
    let sponsor_hex = hex::encode(sponsor_pubkey.as_bytes());

    // Client-side check (pure function)
    if !is_in_hardcoded_genesis_list(&sponsor_pubkey) {
        return Err(CliError::Other(
            "Direct sponsorship is only available to genesis identities.".into(),
        ));
    }

    let sponsored_pubkey = parse_address(address)?;
    let sponsored_hex = hex::encode(sponsored_pubkey.as_bytes());
    let sponsored_address = encode_address_from_pubkey(&sponsored_pubkey);

    let now = current_time();

    // Mine PoW so the Sponsor action carries real work (>= 1 leading zero byte).
    // A pow=0 onboarding action can't cross the block-formation PoW threshold and
    // doesn't advance cumulative_pow, so it strands/never sticks on a quiet chain.
    // Same grind the claim path uses; the node re-derives and verifies pow_work.
    use rand::RngCore;
    use sha2::{Digest, Sha256};
    println!("Mining proof-of-work for sponsorship...");
    let mut pow_nonce_space = [0u8; 32];
    rand::thread_rng().fill_bytes(&mut pow_nonce_space);
    let min_difficulty = 1usize; // at least 1 leading zero byte
    let mut pow_nonce: u64 = 0;
    loop {
        let mut pow_input = Vec::with_capacity(40);
        pow_input.extend_from_slice(&pow_nonce_space);
        pow_input.extend_from_slice(&pow_nonce.to_le_bytes());
        let hash = Sha256::digest(&pow_input);
        if hash.iter().take_while(|&&b| b == 0).count() >= min_difficulty {
            break;
        }
        pow_nonce = pow_nonce.wrapping_add(1);
    }
    println!(" done! (nonce: {})", pow_nonce);

    // Build signature: new_identity(32) || timestamp(8 BE)
    let mut sig_msg = Vec::with_capacity(40);
    sig_msg.extend_from_slice(sponsored_pubkey.as_bytes());
    sig_msg.extend_from_slice(&now.to_be_bytes());
    let signature = sign(&keypair.private_key, &sig_msg);
    let sig_hex = hex::encode(signature.as_bytes());

    let mut client = create_rpc_client(config)?;

    let result: RegisterSponsoredIdentityResult = rpc_call_result(
        &mut client,
        "register_sponsored_identity",
        json!({
            "new_identity_pubkey": sponsored_hex,
            "sponsor_pubkey": sponsor_hex,
            "sponsor_signature": sig_hex,
            "timestamp": now,
            "probationary": probationary,
            "pow_nonce": pow_nonce,
            "pow_nonce_space": hex::encode(pow_nonce_space)
        }),
    )?;

    println!("Direct sponsorship complete!");
    println!("Sponsored: {}", sponsored_address);
    println!("Probationary: {}", probationary);
    println!("Depth: {}", result.depth);

    Ok(())
}

/// Parse offer ID from hex string
fn parse_offer_id(offer_id: &str) -> Result<[u8; 16]> {
    let bytes = hex::decode(offer_id)
        .map_err(|_| CliError::Other("Invalid offer ID format. Expected hex string.".into()))?;

    if bytes.len() != 16 {
        return Err(CliError::Other(
            "Invalid offer ID length. Expected 16 bytes.".into(),
        ));
    }

    let mut arr = [0u8; 16];
    arr.copy_from_slice(&bytes);
    Ok(arr)
}

/// Parse address to public key
fn parse_address(addr: &str) -> Result<PublicKey> {
    // Try bech32m address first (cs1...)
    if addr.starts_with("cs1") {
        return crate::identity::decode_address_to_pubkey(addr)
            .map_err(|e| CliError::Other(format!("Invalid address: {}", e)));
    }

    // Fall back to hex-encoded public key
    let hex_str = addr.trim_start_matches("0x");

    let bytes = hex::decode(hex_str).map_err(|_| {
        CliError::Other("Invalid address format. Use cs1... address or hex public key.".into())
    })?;

    if bytes.len() != 32 {
        return Err(CliError::Other("Invalid public key length.".into()));
    }

    let mut arr = [0u8; 32];
    arr.copy_from_slice(&bytes);
    Ok(PublicKey::from_bytes(arr))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_offer_id() {
        let valid = "0123456789abcdef0123456789abcdef";
        let result = parse_offer_id(valid);
        assert!(result.is_ok());

        let invalid = "tooshort";
        let result = parse_offer_id(invalid);
        assert!(result.is_err());
    }
}
