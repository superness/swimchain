//! Membership storage for private spaces
//!
//! Tracks space membership, roles, and pending invites for private/encrypted spaces.
//! Uses sled embedded database for persistence.
//!
//! # Storage Structure
//!
//! - `members`: space_id(16) || member_pk(32) → MemberRecord
//! - `user_spaces`: member_pk(32) || space_id(16) → () (reverse index)
//! - `pending_invites`: invite_hash(32) → InviteRecord
//! - `dm_requests`: requester_pk(32) || recipient_pk(32) → DMRequestRecord

use std::path::Path;

use sled::Db;

use crate::types::error::StorageError;

/// Member role in a private space
#[repr(u8)]
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub enum MemberRole {
    /// Full control - can kick anyone, invite, change settings
    Admin = 0,
    /// Can kick members, invite new users
    Moderator = 1,
    /// Can post, leave
    Member = 2,
}

impl TryFrom<u8> for MemberRole {
    type Error = StorageError;

    fn try_from(value: u8) -> Result<Self, Self::Error> {
        match value {
            0 => Ok(MemberRole::Admin),
            1 => Ok(MemberRole::Moderator),
            2 => Ok(MemberRole::Member),
            _ => Err(StorageError::SerializationError(format!(
                "Invalid member role: {}",
                value
            ))),
        }
    }
}

/// Record of a member in a private space
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct MemberRecord {
    /// Member's public key (32 bytes)
    pub member_pk: [u8; 32],
    /// Role in the space
    pub role: MemberRole,
    /// When they joined (UNIX seconds)
    pub joined_at: u64,
    /// Who invited them (32 bytes, zeroed for creator)
    pub invited_by: [u8; 32],
    /// Encrypted space key for this member (X25519 box)
    /// Updated on key rotation
    pub encrypted_space_key: Vec<u8>,
    /// Key version this member has
    pub key_version: u32,
}

/// Invite status
#[repr(u8)]
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub enum InviteStatus {
    /// Invite is pending acceptance
    Pending = 0,
    /// Invite was accepted
    Accepted = 1,
    /// Invite was declined
    Declined = 2,
    /// Invite was revoked by sender
    Revoked = 3,
    /// Invite expired
    Expired = 4,
}

/// Record of a pending or processed invite
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct InviteRecord {
    /// Invite action hash (unique identifier)
    pub invite_hash: [u8; 32],
    /// Space being invited to
    pub space_id: [u8; 16],
    /// Who sent the invite
    pub inviter_pk: [u8; 32],
    /// Who is being invited
    pub invitee_pk: [u8; 32],
    /// Encrypted space key for invitee
    pub encrypted_space_key: Vec<u8>,
    /// When the invite was created
    pub created_at: u64,
    /// When the invite expires (None = never)
    pub expires_at: Option<u64>,
    /// Current status
    pub status: InviteStatus,
    /// Optional invite message (encrypted)
    pub message: Option<Vec<u8>>,
}

/// DM request status
#[repr(u8)]
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub enum DMRequestStatus {
    /// Request is pending
    Pending = 0,
    /// Request was accepted
    Accepted = 1,
    /// Request was declined
    Declined = 2,
}

/// Record of a DM request
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct DMRequestRecord {
    /// Request action hash
    pub request_hash: [u8; 32],
    /// Who sent the request
    pub requester_pk: [u8; 32],
    /// Who is being requested
    pub recipient_pk: [u8; 32],
    /// Requester's key share (for key exchange)
    pub requester_key_share: Vec<u8>,
    /// When the request was created
    pub created_at: u64,
    /// Current status
    pub status: DMRequestStatus,
    /// Resulting space_id (set when accepted)
    pub space_id: Option<[u8; 16]>,
}

/// Membership storage for private spaces
pub struct MembershipStore {
    #[allow(dead_code)]
    db: Db,
    /// space_id(16) || member_pk(32) → MemberRecord
    members: sled::Tree,
    /// member_pk(32) || space_id(16) → () (reverse index for "my spaces")
    user_spaces: sled::Tree,
    /// invite_hash(32) → InviteRecord
    pending_invites: sled::Tree,
    /// invitee_pk(32) || invite_hash(32) → () (index for "my invites")
    invites_by_user: sled::Tree,
    /// requester_pk(32) || recipient_pk(32) → DMRequestRecord
    dm_requests: sled::Tree,
    /// recipient_pk(32) || requester_pk(32) → () (index for "my DM requests")
    dm_requests_by_recipient: sled::Tree,
}

impl MembershipStore {
    /// Open or create membership store at path
    pub fn open(path: impl AsRef<Path>) -> Result<Self, StorageError> {
        let db = sled::open(path.as_ref())?;
        let members = db.open_tree("members")?;
        let user_spaces = db.open_tree("user_spaces")?;
        let pending_invites = db.open_tree("pending_invites")?;
        let invites_by_user = db.open_tree("invites_by_user")?;
        let dm_requests = db.open_tree("dm_requests")?;
        let dm_requests_by_recipient = db.open_tree("dm_requests_by_recipient")?;

        Ok(Self {
            db,
            members,
            user_spaces,
            pending_invites,
            invites_by_user,
            dm_requests,
            dm_requests_by_recipient,
        })
    }

    // =========================================================================
    // Member Operations
    // =========================================================================

    /// Add a member to a space
    pub fn add_member(
        &self,
        space_id: &[u8; 16],
        record: &MemberRecord,
    ) -> Result<(), StorageError> {
        // Primary key: space_id || member_pk
        let mut key = [0u8; 48];
        key[..16].copy_from_slice(space_id);
        key[16..].copy_from_slice(&record.member_pk);

        let data = bincode::serialize(record)?;
        self.members.insert(&key, data)?;

        // Reverse index: member_pk || space_id
        let mut reverse_key = [0u8; 48];
        reverse_key[..32].copy_from_slice(&record.member_pk);
        reverse_key[32..].copy_from_slice(space_id);
        self.user_spaces.insert(&reverse_key, &[])?;

        Ok(())
    }

    /// Remove a member from a space
    pub fn remove_member(
        &self,
        space_id: &[u8; 16],
        member_pk: &[u8; 32],
    ) -> Result<bool, StorageError> {
        // Primary key
        let mut key = [0u8; 48];
        key[..16].copy_from_slice(space_id);
        key[16..].copy_from_slice(member_pk);

        let existed = self.members.remove(&key)?.is_some();

        // Reverse index
        let mut reverse_key = [0u8; 48];
        reverse_key[..32].copy_from_slice(member_pk);
        reverse_key[32..].copy_from_slice(space_id);
        self.user_spaces.remove(&reverse_key)?;

        Ok(existed)
    }

    /// Get a member record
    pub fn get_member(
        &self,
        space_id: &[u8; 16],
        member_pk: &[u8; 32],
    ) -> Result<Option<MemberRecord>, StorageError> {
        let mut key = [0u8; 48];
        key[..16].copy_from_slice(space_id);
        key[16..].copy_from_slice(member_pk);

        match self.members.get(&key)? {
            Some(data) => {
                let record: MemberRecord = bincode::deserialize(&data)?;
                Ok(Some(record))
            }
            None => Ok(None),
        }
    }

    /// Check if a user is a member of a space
    pub fn is_member(&self, space_id: &[u8; 16], member_pk: &[u8; 32]) -> Result<bool, StorageError> {
        let mut key = [0u8; 48];
        key[..16].copy_from_slice(space_id);
        key[16..].copy_from_slice(member_pk);

        Ok(self.members.contains_key(&key)?)
    }

    /// Get all members of a space
    pub fn get_space_members(&self, space_id: &[u8; 16]) -> Result<Vec<MemberRecord>, StorageError> {
        let mut members = Vec::new();

        // Prefix scan: all keys starting with space_id
        for result in self.members.scan_prefix(space_id) {
            let (_key, data) = result?;
            let record: MemberRecord = bincode::deserialize(&data)?;
            members.push(record);
        }

        Ok(members)
    }

    /// Get all private spaces a user is a member of
    pub fn get_user_spaces(&self, member_pk: &[u8; 32]) -> Result<Vec<[u8; 16]>, StorageError> {
        let mut spaces = Vec::new();

        // Prefix scan: all keys starting with member_pk
        for result in self.user_spaces.scan_prefix(member_pk) {
            let (key, _) = result?;
            if key.len() >= 48 {
                let mut space_id = [0u8; 16];
                space_id.copy_from_slice(&key[32..48]);
                spaces.push(space_id);
            }
        }

        Ok(spaces)
    }

    /// Update a member's encrypted key (after key rotation)
    pub fn update_member_key(
        &self,
        space_id: &[u8; 16],
        member_pk: &[u8; 32],
        encrypted_space_key: Vec<u8>,
        key_version: u32,
    ) -> Result<bool, StorageError> {
        let mut key = [0u8; 48];
        key[..16].copy_from_slice(space_id);
        key[16..].copy_from_slice(member_pk);

        match self.members.get(&key)? {
            Some(data) => {
                let mut record: MemberRecord = bincode::deserialize(&data)?;
                record.encrypted_space_key = encrypted_space_key;
                record.key_version = key_version;
                let new_data = bincode::serialize(&record)?;
                self.members.insert(&key, new_data)?;
                Ok(true)
            }
            None => Ok(false),
        }
    }

    /// Get member count for a space
    pub fn member_count(&self, space_id: &[u8; 16]) -> Result<usize, StorageError> {
        let mut count = 0;
        for result in self.members.scan_prefix(space_id) {
            result?;
            count += 1;
        }
        Ok(count)
    }

    // =========================================================================
    // Invite Operations
    // =========================================================================

    /// Store a pending invite
    pub fn add_invite(&self, record: &InviteRecord) -> Result<(), StorageError> {
        let data = bincode::serialize(record)?;
        self.pending_invites.insert(&record.invite_hash, data)?;

        // Index by invitee for "my invites" queries
        let mut invitee_key = [0u8; 64];
        invitee_key[..32].copy_from_slice(&record.invitee_pk);
        invitee_key[32..].copy_from_slice(&record.invite_hash);
        self.invites_by_user.insert(&invitee_key, &[])?;

        Ok(())
    }

    /// Get an invite by hash
    pub fn get_invite(&self, invite_hash: &[u8; 32]) -> Result<Option<InviteRecord>, StorageError> {
        match self.pending_invites.get(invite_hash)? {
            Some(data) => {
                let record: InviteRecord = bincode::deserialize(&data)?;
                Ok(Some(record))
            }
            None => Ok(None),
        }
    }

    /// Update invite status
    pub fn update_invite_status(
        &self,
        invite_hash: &[u8; 32],
        status: InviteStatus,
    ) -> Result<bool, StorageError> {
        match self.pending_invites.get(invite_hash)? {
            Some(data) => {
                let mut record: InviteRecord = bincode::deserialize(&data)?;
                record.status = status;
                let new_data = bincode::serialize(&record)?;
                self.pending_invites.insert(invite_hash, new_data)?;
                Ok(true)
            }
            None => Ok(false),
        }
    }

    /// Get all pending invites for a user
    pub fn get_user_invites(&self, invitee_pk: &[u8; 32]) -> Result<Vec<InviteRecord>, StorageError> {
        let mut invites = Vec::new();

        for result in self.invites_by_user.scan_prefix(invitee_pk) {
            let (key, _) = result?;
            if key.len() >= 64 {
                let mut invite_hash = [0u8; 32];
                invite_hash.copy_from_slice(&key[32..64]);

                if let Some(record) = self.get_invite(&invite_hash)? {
                    // Only include pending invites
                    if record.status == InviteStatus::Pending {
                        invites.push(record);
                    }
                }
            }
        }

        Ok(invites)
    }

    /// Get all invites for a space (for admin view)
    pub fn get_space_invites(&self, space_id: &[u8; 16]) -> Result<Vec<InviteRecord>, StorageError> {
        let mut invites = Vec::new();

        for result in self.pending_invites.iter() {
            let (_, data) = result?;
            let record: InviteRecord = bincode::deserialize(&data)?;
            if &record.space_id == space_id {
                invites.push(record);
            }
        }

        Ok(invites)
    }

    /// Remove expired invites
    pub fn cleanup_expired_invites(&self, current_time: u64) -> Result<usize, StorageError> {
        let mut expired = Vec::new();

        for result in self.pending_invites.iter() {
            let (key, data) = result?;
            let record: InviteRecord = bincode::deserialize(&data)?;

            if record.status == InviteStatus::Pending {
                if let Some(expires_at) = record.expires_at {
                    if current_time > expires_at {
                        expired.push((key.to_vec(), record));
                    }
                }
            }
        }

        let count = expired.len();
        for (key, record) in expired {
            // Update status to expired
            let mut updated = record;
            updated.status = InviteStatus::Expired;
            let data = bincode::serialize(&updated)?;
            self.pending_invites.insert(&key, data)?;
        }

        Ok(count)
    }

    // =========================================================================
    // DM Request Operations
    // =========================================================================

    /// Store a DM request
    pub fn add_dm_request(&self, record: &DMRequestRecord) -> Result<(), StorageError> {
        // Primary key: requester || recipient
        let mut key = [0u8; 64];
        key[..32].copy_from_slice(&record.requester_pk);
        key[32..].copy_from_slice(&record.recipient_pk);

        let data = bincode::serialize(record)?;
        self.dm_requests.insert(&key, data)?;

        // Reverse index for recipient queries
        let mut reverse_key = [0u8; 64];
        reverse_key[..32].copy_from_slice(&record.recipient_pk);
        reverse_key[32..].copy_from_slice(&record.requester_pk);
        self.dm_requests_by_recipient.insert(&reverse_key, &[])?;

        Ok(())
    }

    /// Get a DM request
    pub fn get_dm_request(
        &self,
        requester_pk: &[u8; 32],
        recipient_pk: &[u8; 32],
    ) -> Result<Option<DMRequestRecord>, StorageError> {
        let mut key = [0u8; 64];
        key[..32].copy_from_slice(requester_pk);
        key[32..].copy_from_slice(recipient_pk);

        match self.dm_requests.get(&key)? {
            Some(data) => {
                let record: DMRequestRecord = bincode::deserialize(&data)?;
                Ok(Some(record))
            }
            None => Ok(None),
        }
    }

    /// Update DM request status
    pub fn update_dm_request_status(
        &self,
        requester_pk: &[u8; 32],
        recipient_pk: &[u8; 32],
        status: DMRequestStatus,
        space_id: Option<[u8; 16]>,
    ) -> Result<bool, StorageError> {
        let mut key = [0u8; 64];
        key[..32].copy_from_slice(requester_pk);
        key[32..].copy_from_slice(recipient_pk);

        match self.dm_requests.get(&key)? {
            Some(data) => {
                let mut record: DMRequestRecord = bincode::deserialize(&data)?;
                record.status = status;
                record.space_id = space_id;
                let new_data = bincode::serialize(&record)?;
                self.dm_requests.insert(&key, new_data)?;
                Ok(true)
            }
            None => Ok(false),
        }
    }

    /// Get all DM requests SENT by a user (as requester), any status. The primary
    /// `dm_requests` key is `requester||recipient`, so a prefix scan on our own pubkey
    /// yields our outgoing requests — used to learn when a recipient has accepted.
    pub fn get_sent_dm_requests(
        &self,
        requester_pk: &[u8; 32],
    ) -> Result<Vec<DMRequestRecord>, StorageError> {
        let mut out = Vec::new();
        for result in self.dm_requests.scan_prefix(requester_pk) {
            let (_, data) = result?;
            let record: DMRequestRecord = bincode::deserialize(&data)?;
            // scan_prefix on a 32-byte prefix can't over-match a 64-byte key, but guard anyway.
            if &record.requester_pk == requester_pk {
                out.push(record);
            }
        }
        Ok(out)
    }

    /// Get all pending DM requests for a user (as recipient)
    pub fn get_pending_dm_requests(
        &self,
        recipient_pk: &[u8; 32],
    ) -> Result<Vec<DMRequestRecord>, StorageError> {
        let mut requests = Vec::new();

        for result in self.dm_requests_by_recipient.scan_prefix(recipient_pk) {
            let (key, _) = result?;
            if key.len() >= 64 {
                let mut requester_pk = [0u8; 32];
                requester_pk.copy_from_slice(&key[32..64]);

                if let Some(record) = self.get_dm_request(&requester_pk, recipient_pk)? {
                    if record.status == DMRequestStatus::Pending {
                        requests.push(record);
                    }
                }
            }
        }

        Ok(requests)
    }

    /// Check if a DM request exists between two users
    pub fn dm_request_exists(
        &self,
        requester_pk: &[u8; 32],
        recipient_pk: &[u8; 32],
    ) -> Result<bool, StorageError> {
        let mut key = [0u8; 64];
        key[..32].copy_from_slice(requester_pk);
        key[32..].copy_from_slice(recipient_pk);

        Ok(self.dm_requests.contains_key(&key)?)
    }

    // =========================================================================
    // Utility
    // =========================================================================

    /// Flush all pending writes to disk
    pub fn flush(&self) -> Result<(), StorageError> {
        self.members.flush()?;
        self.user_spaces.flush()?;
        self.pending_invites.flush()?;
        self.invites_by_user.flush()?;
        self.dm_requests.flush()?;
        self.dm_requests_by_recipient.flush()?;
        Ok(())
    }

    /// Get statistics about membership storage
    pub fn stats(&self) -> Result<MembershipStats, StorageError> {
        Ok(MembershipStats {
            member_records: self.members.len(),
            pending_invites: self.pending_invites.len(),
            dm_requests: self.dm_requests.len(),
        })
    }
}

/// Statistics about membership storage
#[derive(Debug, Clone)]
pub struct MembershipStats {
    pub member_records: usize,
    pub pending_invites: usize,
    pub dm_requests: usize,
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    fn create_test_store() -> (MembershipStore, tempfile::TempDir) {
        let dir = tempdir().unwrap();
        let store = MembershipStore::open(dir.path().join("membership")).unwrap();
        (store, dir)
    }

    #[test]
    fn test_member_role_try_from() {
        assert_eq!(MemberRole::try_from(0).unwrap(), MemberRole::Admin);
        assert_eq!(MemberRole::try_from(1).unwrap(), MemberRole::Moderator);
        assert_eq!(MemberRole::try_from(2).unwrap(), MemberRole::Member);
        assert!(MemberRole::try_from(3).is_err());
    }

    #[test]
    fn test_add_and_get_member() {
        let (store, _dir) = create_test_store();
        let space_id = [1u8; 16];
        let member_pk = [2u8; 32];

        let record = MemberRecord {
            member_pk,
            role: MemberRole::Admin,
            joined_at: 1000,
            invited_by: [0u8; 32],
            encrypted_space_key: vec![1, 2, 3],
            key_version: 0,
        };

        store.add_member(&space_id, &record).unwrap();

        let retrieved = store.get_member(&space_id, &member_pk).unwrap().unwrap();
        assert_eq!(retrieved.role, MemberRole::Admin);
        assert_eq!(retrieved.joined_at, 1000);
        assert_eq!(retrieved.encrypted_space_key, vec![1, 2, 3]);
    }

    #[test]
    fn test_is_member() {
        let (store, _dir) = create_test_store();
        let space_id = [1u8; 16];
        let member_pk = [2u8; 32];
        let non_member_pk = [3u8; 32];

        let record = MemberRecord {
            member_pk,
            role: MemberRole::Member,
            joined_at: 1000,
            invited_by: [0u8; 32],
            encrypted_space_key: vec![],
            key_version: 0,
        };

        store.add_member(&space_id, &record).unwrap();

        assert!(store.is_member(&space_id, &member_pk).unwrap());
        assert!(!store.is_member(&space_id, &non_member_pk).unwrap());
    }

    #[test]
    fn test_remove_member() {
        let (store, _dir) = create_test_store();
        let space_id = [1u8; 16];
        let member_pk = [2u8; 32];

        let record = MemberRecord {
            member_pk,
            role: MemberRole::Member,
            joined_at: 1000,
            invited_by: [0u8; 32],
            encrypted_space_key: vec![],
            key_version: 0,
        };

        store.add_member(&space_id, &record).unwrap();
        assert!(store.is_member(&space_id, &member_pk).unwrap());

        let removed = store.remove_member(&space_id, &member_pk).unwrap();
        assert!(removed);
        assert!(!store.is_member(&space_id, &member_pk).unwrap());

        // Remove non-existent
        let removed_again = store.remove_member(&space_id, &member_pk).unwrap();
        assert!(!removed_again);
    }

    #[test]
    fn test_get_space_members() {
        let (store, _dir) = create_test_store();
        let space_id = [1u8; 16];

        for i in 0..5 {
            let record = MemberRecord {
                member_pk: [i as u8; 32],
                role: if i == 0 { MemberRole::Admin } else { MemberRole::Member },
                joined_at: 1000 + i as u64,
                invited_by: [0u8; 32],
                encrypted_space_key: vec![],
                key_version: 0,
            };
            store.add_member(&space_id, &record).unwrap();
        }

        let members = store.get_space_members(&space_id).unwrap();
        assert_eq!(members.len(), 5);
    }

    #[test]
    fn test_get_user_spaces() {
        let (store, _dir) = create_test_store();
        let member_pk = [1u8; 32];

        for i in 0..3 {
            let space_id = [i as u8; 16];
            let record = MemberRecord {
                member_pk,
                role: MemberRole::Member,
                joined_at: 1000,
                invited_by: [0u8; 32],
                encrypted_space_key: vec![],
                key_version: 0,
            };
            store.add_member(&space_id, &record).unwrap();
        }

        let spaces = store.get_user_spaces(&member_pk).unwrap();
        assert_eq!(spaces.len(), 3);
    }

    #[test]
    fn test_update_member_key() {
        let (store, _dir) = create_test_store();
        let space_id = [1u8; 16];
        let member_pk = [2u8; 32];

        let record = MemberRecord {
            member_pk,
            role: MemberRole::Member,
            joined_at: 1000,
            invited_by: [0u8; 32],
            encrypted_space_key: vec![1, 2, 3],
            key_version: 0,
        };

        store.add_member(&space_id, &record).unwrap();

        store
            .update_member_key(&space_id, &member_pk, vec![4, 5, 6], 1)
            .unwrap();

        let updated = store.get_member(&space_id, &member_pk).unwrap().unwrap();
        assert_eq!(updated.encrypted_space_key, vec![4, 5, 6]);
        assert_eq!(updated.key_version, 1);
    }

    #[test]
    fn test_invite_operations() {
        let (store, _dir) = create_test_store();

        let invite = InviteRecord {
            invite_hash: [1u8; 32],
            space_id: [2u8; 16],
            inviter_pk: [3u8; 32],
            invitee_pk: [4u8; 32],
            encrypted_space_key: vec![1, 2, 3],
            created_at: 1000,
            expires_at: Some(2000),
            status: InviteStatus::Pending,
            message: None,
        };

        store.add_invite(&invite).unwrap();

        // Get by hash
        let retrieved = store.get_invite(&[1u8; 32]).unwrap().unwrap();
        assert_eq!(retrieved.status, InviteStatus::Pending);

        // Get user invites
        let user_invites = store.get_user_invites(&[4u8; 32]).unwrap();
        assert_eq!(user_invites.len(), 1);

        // Update status
        store
            .update_invite_status(&[1u8; 32], InviteStatus::Accepted)
            .unwrap();

        let updated = store.get_invite(&[1u8; 32]).unwrap().unwrap();
        assert_eq!(updated.status, InviteStatus::Accepted);

        // Accepted invites should not appear in pending list
        let user_invites = store.get_user_invites(&[4u8; 32]).unwrap();
        assert_eq!(user_invites.len(), 0);
    }

    #[test]
    fn test_dm_request_operations() {
        let (store, _dir) = create_test_store();

        let request = DMRequestRecord {
            request_hash: [1u8; 32],
            requester_pk: [2u8; 32],
            recipient_pk: [3u8; 32],
            requester_key_share: vec![1, 2, 3],
            created_at: 1000,
            status: DMRequestStatus::Pending,
            space_id: None,
        };

        store.add_dm_request(&request).unwrap();

        // Get request
        let retrieved = store.get_dm_request(&[2u8; 32], &[3u8; 32]).unwrap().unwrap();
        assert_eq!(retrieved.status, DMRequestStatus::Pending);

        // Check exists
        assert!(store.dm_request_exists(&[2u8; 32], &[3u8; 32]).unwrap());
        assert!(!store.dm_request_exists(&[3u8; 32], &[2u8; 32]).unwrap());

        // Get pending requests for recipient
        let pending = store.get_pending_dm_requests(&[3u8; 32]).unwrap();
        assert_eq!(pending.len(), 1);

        // Accept
        store
            .update_dm_request_status(
                &[2u8; 32],
                &[3u8; 32],
                DMRequestStatus::Accepted,
                Some([5u8; 16]),
            )
            .unwrap();

        let updated = store.get_dm_request(&[2u8; 32], &[3u8; 32]).unwrap().unwrap();
        assert_eq!(updated.status, DMRequestStatus::Accepted);
        assert_eq!(updated.space_id, Some([5u8; 16]));

        // No longer pending
        let pending = store.get_pending_dm_requests(&[3u8; 32]).unwrap();
        assert_eq!(pending.len(), 0);
    }

    #[test]
    fn test_member_count() {
        let (store, _dir) = create_test_store();
        let space_id = [1u8; 16];

        assert_eq!(store.member_count(&space_id).unwrap(), 0);

        for i in 0..10 {
            let record = MemberRecord {
                member_pk: [i as u8; 32],
                role: MemberRole::Member,
                joined_at: 1000,
                invited_by: [0u8; 32],
                encrypted_space_key: vec![],
                key_version: 0,
            };
            store.add_member(&space_id, &record).unwrap();
        }

        assert_eq!(store.member_count(&space_id).unwrap(), 10);
    }

    #[test]
    fn test_stats() {
        let (store, _dir) = create_test_store();

        let stats = store.stats().unwrap();
        assert_eq!(stats.member_records, 0);
        assert_eq!(stats.pending_invites, 0);
        assert_eq!(stats.dm_requests, 0);
    }
}
