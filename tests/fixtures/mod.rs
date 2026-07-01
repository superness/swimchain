//! Test data fixtures module
//!
//! Factory functions for creating test data: spaces, threads (content items), and users (identities).
//!
//! This module provides convenient builders and factory functions for creating
//! test data without the overhead of proof-of-work mining.
//!
//! # Usage
//!
//! ```rust,ignore
//! use crate::fixtures::{TestUser, TestSpace, TestThread, TestFixtures};
//!
//! // Create a test user
//! let user = TestUser::new();
//!
//! // Create a test space
//! let space = TestSpace::new("test-space");
//!
//! // Create a thread in the space
//! let thread = TestThread::new(&user, &space, "Hello world!");
//!
//! // Or use the fixtures helper for quick setup
//! let fixtures = TestFixtures::default();
//! let (user, space, thread) = fixtures.create_basic_thread("My post");
//! ```

use std::time::{SystemTime, UNIX_EPOCH};

use swimchain::crypto::signature::generate_keypair;
use swimchain::identity::KeyPair;
use swimchain::types::content::{
    ContentHash, ContentId, ContentItem, ContentType, EngagementRecord, EngagementType, SpaceId,
};
use swimchain::types::identity::{IdentityId, PublicKey, Signature};

/// Test user with a pre-generated keypair
///
/// Unlike production identity creation, this does not perform proof-of-work,
/// making it fast for test setup.
#[derive(Clone)]
pub struct TestUser {
    /// The user's keypair
    pub keypair: KeyPair,
    /// The user's identity ID (SHA-256 of public key)
    pub identity_id: IdentityId,
    /// Optional display name for testing
    pub display_name: Option<String>,
}

impl TestUser {
    /// Create a new test user with a random keypair
    #[must_use]
    pub fn new() -> Self {
        let keypair = generate_keypair();
        let identity_id = keypair.public_key.to_identity_id();
        Self {
            keypair,
            identity_id,
            display_name: None,
        }
    }

    /// Create a new test user with a display name
    #[must_use]
    pub fn with_name(name: &str) -> Self {
        let mut user = Self::new();
        user.display_name = Some(name.to_string());
        user
    }

    /// Create multiple test users
    #[must_use]
    pub fn create_many(count: usize) -> Vec<Self> {
        (0..count).map(|_| Self::new()).collect()
    }

    /// Create multiple test users with sequential names
    #[must_use]
    pub fn create_named(names: &[&str]) -> Vec<Self> {
        names.iter().map(|name| Self::with_name(name)).collect()
    }

    /// Get the public key
    #[must_use]
    pub fn public_key(&self) -> &PublicKey {
        &self.keypair.public_key
    }

    /// Sign a message
    #[must_use]
    pub fn sign(&self, message: &[u8]) -> Signature {
        swimchain::crypto::signature::sign(&self.keypair.private_key, message)
    }
}

impl Default for TestUser {
    fn default() -> Self {
        Self::new()
    }
}

/// Test space for organizing content
///
/// Provides a space_id and related metadata for testing.
#[derive(Clone, Debug)]
pub struct TestSpace {
    /// The space identifier
    pub space_id: SpaceId,
    /// Human-readable name for the space
    pub name: String,
    /// Optional description
    pub description: Option<String>,
    /// Creation timestamp (UNIX milliseconds)
    pub created_at: u64,
}

impl TestSpace {
    /// Create a new test space with the given name
    #[must_use]
    pub fn new(name: &str) -> Self {
        // Generate space_id from name hash for determinism in tests
        let space_id = Self::space_id_from_name(name);
        Self {
            space_id,
            name: name.to_string(),
            description: None,
            created_at: current_timestamp_ms(),
        }
    }

    /// Create a new test space with a random ID
    #[must_use]
    pub fn random() -> Self {
        let id = rand::random::<u64>();
        Self::new(&format!("space-{id}"))
    }

    /// Create a test space with a description
    #[must_use]
    pub fn with_description(name: &str, description: &str) -> Self {
        let mut space = Self::new(name);
        space.description = Some(description.to_string());
        space
    }

    /// Create multiple test spaces
    #[must_use]
    pub fn create_many(count: usize) -> Vec<Self> {
        (0..count).map(|i| Self::new(&format!("test-space-{i}"))).collect()
    }

    /// Create space ID from name (deterministic)
    fn space_id_from_name(name: &str) -> SpaceId {
        use sha2::{Digest, Sha256};
        let mut hasher = Sha256::new();
        hasher.update(b"test-space:");
        hasher.update(name.as_bytes());
        let hash: [u8; 32] = hasher.finalize().into();
        SpaceId::from_bytes(hash)
    }
}

impl Default for TestSpace {
    fn default() -> Self {
        Self::new("default-test-space")
    }
}

/// Builder for creating test threads (content items)
///
/// A "thread" in this context is a top-level post (ContentType::Post)
/// that can have replies.
pub struct TestThreadBuilder {
    author: TestUser,
    space: TestSpace,
    body: String,
    content_type: ContentType,
    parent_id: Option<ContentId>,
    created_at: Option<u64>,
    engagement_count: u32,
    pow_difficulty: u8,
}

impl TestThreadBuilder {
    /// Create a new thread builder
    pub fn new(author: &TestUser, space: &TestSpace, body: &str) -> Self {
        Self {
            author: author.clone(),
            space: space.clone(),
            body: body.to_string(),
            content_type: ContentType::Post,
            parent_id: None,
            created_at: None,
            engagement_count: 0,
            pow_difficulty: 1, // Minimal for tests
        }
    }

    /// Set as a reply to another content item
    pub fn as_reply_to(mut self, parent_id: ContentId) -> Self {
        self.content_type = ContentType::Reply;
        self.parent_id = Some(parent_id);
        self
    }

    /// Set as a quote of another content item
    pub fn as_quote_of(mut self, parent_id: ContentId) -> Self {
        self.content_type = ContentType::Quote;
        self.parent_id = Some(parent_id);
        self
    }

    /// Set the creation timestamp
    pub fn created_at(mut self, timestamp_ms: u64) -> Self {
        self.created_at = Some(timestamp_ms);
        self
    }

    /// Set the engagement count
    pub fn with_engagement(mut self, count: u32) -> Self {
        self.engagement_count = count;
        self
    }

    /// Set the PoW difficulty
    pub fn with_pow_difficulty(mut self, difficulty: u8) -> Self {
        self.pow_difficulty = difficulty;
        self
    }

    /// Build the content item
    #[must_use]
    pub fn build(self) -> ContentItem {
        let created_at = self.created_at.unwrap_or_else(current_timestamp_ms);
        let content_id = generate_content_id(&self.author.identity_id, created_at, &self.body);

        // Create signature over content
        let signature = self.author.sign(content_id.as_ref());

        ContentItem {
            content_id,
            author_id: self.author.identity_id,
            content_type: self.content_type,
            space_id: self.space.space_id,
            parent_id: self.parent_id,
            created_at,
            last_engagement: created_at,
            body_inline: Some(self.body),
            content_hash: None,
            content_size: None,
            content_type_mime: None,
            media_refs: vec![],
            pin_state: None,
            engagement_count: self.engagement_count,
            signature,
            pow_nonce: 0,
            pow_difficulty: self.pow_difficulty,
            preservation_pow: None,
            display_name: self.author.display_name.clone(),
        }
    }
}

/// Test thread (content item) factory
pub struct TestThread;

impl TestThread {
    /// Create a simple post
    #[must_use]
    pub fn post(author: &TestUser, space: &TestSpace, body: &str) -> ContentItem {
        TestThreadBuilder::new(author, space, body).build()
    }

    /// Create a reply to an existing content item
    #[must_use]
    pub fn reply(author: &TestUser, space: &TestSpace, body: &str, parent: &ContentItem) -> ContentItem {
        TestThreadBuilder::new(author, space, body)
            .as_reply_to(parent.content_id)
            .build()
    }

    /// Create a quote of an existing content item
    #[must_use]
    pub fn quote(author: &TestUser, space: &TestSpace, body: &str, quoted: &ContentItem) -> ContentItem {
        TestThreadBuilder::new(author, space, body)
            .as_quote_of(quoted.content_id)
            .build()
    }

    /// Create a thread with multiple replies
    #[must_use]
    pub fn with_replies(
        author: &TestUser,
        space: &TestSpace,
        body: &str,
        reply_authors: &[TestUser],
        reply_bodies: &[&str],
    ) -> (ContentItem, Vec<ContentItem>) {
        let post = Self::post(author, space, body);
        let replies: Vec<ContentItem> = reply_authors
            .iter()
            .zip(reply_bodies.iter())
            .map(|(reply_author, reply_body)| Self::reply(reply_author, space, reply_body, &post))
            .collect();
        (post, replies)
    }
}

/// Builder for creating test engagement records
pub struct TestEngagementBuilder {
    engager: TestUser,
    content: ContentItem,
    engagement_type: EngagementType,
    timestamp: Option<u64>,
    pow_work: u64,
    emoji: Option<u8>,
}

impl TestEngagementBuilder {
    /// Create a new engagement builder
    pub fn new(engager: &TestUser, content: &ContentItem) -> Self {
        Self {
            engager: engager.clone(),
            content: content.clone(),
            engagement_type: EngagementType::Engage,
            timestamp: None,
            pow_work: 100, // Minimal for tests
            emoji: None,
        }
    }

    /// Set as a reply engagement
    pub fn as_reply(mut self) -> Self {
        self.engagement_type = EngagementType::Reply;
        self
    }

    /// Set as a quote engagement
    pub fn as_quote(mut self) -> Self {
        self.engagement_type = EngagementType::Quote;
        self
    }

    /// Set with an emoji reaction
    pub fn with_emoji(mut self, emoji: u8) -> Self {
        self.emoji = Some(emoji);
        self
    }

    /// Set the timestamp
    pub fn at_time(mut self, timestamp_ms: u64) -> Self {
        self.timestamp = Some(timestamp_ms);
        self
    }

    /// Set the PoW work amount
    pub fn with_pow_work(mut self, work: u64) -> Self {
        self.pow_work = work;
        self
    }

    /// Build the engagement record
    #[must_use]
    pub fn build(self) -> EngagementRecord {
        let timestamp = self.timestamp.unwrap_or_else(current_timestamp_ms);

        // Create signature over engagement (content_id || timestamp)
        let mut message = [0u8; 40];
        message[..32].copy_from_slice(self.content.content_id.as_ref());
        message[32..40].copy_from_slice(&timestamp.to_le_bytes());
        let signature = self.engager.sign(&message);

        EngagementRecord {
            content_id: self.content.content_id,
            engager_id: self.engager.identity_id,
            engagement_type: self.engagement_type,
            timestamp,
            pow_nonce: 0,
            pow_work: self.pow_work,
            signature,
            emoji: self.emoji,
        }
    }
}

/// Test engagement factory
pub struct TestEngagement;

impl TestEngagement {
    /// Create a simple engagement
    #[must_use]
    pub fn engage(engager: &TestUser, content: &ContentItem) -> EngagementRecord {
        TestEngagementBuilder::new(engager, content).build()
    }

    /// Create an emoji reaction
    #[must_use]
    pub fn react(engager: &TestUser, content: &ContentItem, emoji: u8) -> EngagementRecord {
        TestEngagementBuilder::new(engager, content)
            .with_emoji(emoji)
            .build()
    }

    /// Create multiple engagements from different users
    #[must_use]
    pub fn from_users(engagers: &[TestUser], content: &ContentItem) -> Vec<EngagementRecord> {
        engagers
            .iter()
            .map(|engager| Self::engage(engager, content))
            .collect()
    }
}

/// Comprehensive test fixtures helper
///
/// Provides convenient methods for setting up common test scenarios.
pub struct TestFixtures {
    /// Pre-created users for quick access
    pub users: Vec<TestUser>,
    /// Pre-created spaces for quick access
    pub spaces: Vec<TestSpace>,
}

impl TestFixtures {
    /// Create new fixtures with specified counts
    #[must_use]
    pub fn new(user_count: usize, space_count: usize) -> Self {
        Self {
            users: TestUser::create_many(user_count),
            spaces: TestSpace::create_many(space_count),
        }
    }

    /// Get a user by index (wraps around if index exceeds count)
    #[must_use]
    pub fn user(&self, index: usize) -> &TestUser {
        &self.users[index % self.users.len()]
    }

    /// Get a space by index (wraps around if index exceeds count)
    #[must_use]
    pub fn space(&self, index: usize) -> &TestSpace {
        &self.spaces[index % self.spaces.len()]
    }

    /// Create a basic thread (post) with the first user and first space
    #[must_use]
    pub fn create_basic_thread(&self, body: &str) -> (TestUser, TestSpace, ContentItem) {
        let user = self.users[0].clone();
        let space = self.spaces[0].clone();
        let thread = TestThread::post(&user, &space, body);
        (user, space, thread)
    }

    /// Create a thread with replies
    #[must_use]
    pub fn create_thread_with_replies(
        &self,
        post_body: &str,
        reply_bodies: &[&str],
    ) -> (ContentItem, Vec<ContentItem>) {
        let post = TestThread::post(&self.users[0], &self.spaces[0], post_body);
        let replies: Vec<ContentItem> = reply_bodies
            .iter()
            .enumerate()
            .map(|(i, body)| {
                let author = self.user(i + 1); // Different authors for replies
                TestThread::reply(author, &self.spaces[0], body, &post)
            })
            .collect();
        (post, replies)
    }

    /// Create a conversation (alternating replies between users)
    #[must_use]
    pub fn create_conversation(&self, messages: &[&str]) -> Vec<ContentItem> {
        if messages.is_empty() {
            return vec![];
        }

        let mut items = Vec::with_capacity(messages.len());
        let first = TestThread::post(&self.users[0], &self.spaces[0], messages[0]);
        items.push(first);

        for (i, body) in messages.iter().enumerate().skip(1) {
            let author = self.user(i % self.users.len());
            let parent = &items[i - 1];
            let reply = TestThread::reply(author, &self.spaces[0], body, parent);
            items.push(reply);
        }

        items
    }

    /// Create a post with engagements from all users
    #[must_use]
    pub fn create_engaged_post(&self, body: &str) -> (ContentItem, Vec<EngagementRecord>) {
        let post = TestThread::post(&self.users[0], &self.spaces[0], body);
        let engagements: Vec<EngagementRecord> = self.users[1..]
            .iter()
            .map(|user| TestEngagement::engage(user, &post))
            .collect();
        (post, engagements)
    }
}

impl Default for TestFixtures {
    fn default() -> Self {
        Self::new(5, 3)
    }
}

// Helper functions

/// Get current timestamp in milliseconds
fn current_timestamp_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_millis() as u64
}

/// Generate a deterministic content ID from author, timestamp, and body
fn generate_content_id(author_id: &IdentityId, timestamp: u64, body: &str) -> ContentId {
    use sha2::{Digest, Sha256};
    let mut hasher = Sha256::new();
    hasher.update(author_id.as_ref());
    hasher.update(&timestamp.to_le_bytes());
    hasher.update(body.as_bytes());
    let hash: [u8; 32] = hasher.finalize().into();
    ContentId::from_bytes(hash)
}

/// Generate a deterministic hash from a seed (useful for predictable test data)
#[must_use]
pub fn test_hash(seed: u8) -> [u8; 32] {
    [seed; 32]
}

/// Generate a deterministic content hash from a seed
#[must_use]
pub fn test_content_hash(seed: u8) -> ContentHash {
    ContentHash::from_bytes(test_hash(seed))
}

/// Generate a deterministic content ID from a seed
#[must_use]
pub fn test_content_id(seed: u8) -> ContentId {
    ContentId::from_bytes(test_hash(seed))
}

/// Generate a deterministic space ID from a seed
#[must_use]
pub fn test_space_id(seed: u8) -> SpaceId {
    SpaceId::from_bytes(test_hash(seed))
}

/// Generate a deterministic identity ID from a seed
#[must_use]
pub fn test_identity_id(seed: u8) -> IdentityId {
    IdentityId::from_bytes(test_hash(seed))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_create_user() {
        let user = TestUser::new();
        assert_eq!(user.identity_id, user.keypair.public_key.to_identity_id());
    }

    #[test]
    fn test_create_user_with_name() {
        let user = TestUser::with_name("Alice");
        assert_eq!(user.display_name, Some("Alice".to_string()));
    }

    #[test]
    fn test_create_multiple_users() {
        let users = TestUser::create_many(5);
        assert_eq!(users.len(), 5);
        // All should have unique identity IDs
        let ids: std::collections::HashSet<_> = users.iter().map(|u| u.identity_id.0).collect();
        assert_eq!(ids.len(), 5);
    }

    #[test]
    fn test_create_space() {
        let space = TestSpace::new("my-space");
        assert_eq!(space.name, "my-space");
    }

    #[test]
    fn test_space_id_determinism() {
        let space1 = TestSpace::new("test");
        let space2 = TestSpace::new("test");
        assert_eq!(space1.space_id.0, space2.space_id.0);
    }

    #[test]
    fn test_create_post() {
        let user = TestUser::new();
        let space = TestSpace::new("test-space");
        let post = TestThread::post(&user, &space, "Hello world!");

        assert_eq!(post.author_id, user.identity_id);
        assert_eq!(post.space_id, space.space_id);
        assert_eq!(post.content_type, ContentType::Post);
        assert_eq!(post.body_inline, Some("Hello world!".to_string()));
        assert!(post.parent_id.is_none());
    }

    #[test]
    fn test_create_reply() {
        let user1 = TestUser::new();
        let user2 = TestUser::new();
        let space = TestSpace::new("test-space");

        let post = TestThread::post(&user1, &space, "Original post");
        let reply = TestThread::reply(&user2, &space, "A reply", &post);

        assert_eq!(reply.content_type, ContentType::Reply);
        assert_eq!(reply.parent_id, Some(post.content_id));
        assert_eq!(reply.author_id, user2.identity_id);
    }

    #[test]
    fn test_create_thread_with_replies() {
        let author = TestUser::new();
        let repliers = TestUser::create_many(3);
        let space = TestSpace::new("test-space");

        let (post, replies) = TestThread::with_replies(
            &author,
            &space,
            "Main post",
            &repliers,
            &["Reply 1", "Reply 2", "Reply 3"],
        );

        assert_eq!(replies.len(), 3);
        for reply in &replies {
            assert_eq!(reply.parent_id, Some(post.content_id));
            assert_eq!(reply.content_type, ContentType::Reply);
        }
    }

    #[test]
    fn test_create_engagement() {
        let author = TestUser::new();
        let engager = TestUser::new();
        let space = TestSpace::new("test-space");

        let post = TestThread::post(&author, &space, "A post");
        let engagement = TestEngagement::engage(&engager, &post);

        assert_eq!(engagement.content_id, post.content_id);
        assert_eq!(engagement.engager_id, engager.identity_id);
        assert_eq!(engagement.engagement_type, EngagementType::Engage);
    }

    #[test]
    fn test_emoji_reaction() {
        let author = TestUser::new();
        let engager = TestUser::new();
        let space = TestSpace::new("test-space");

        let post = TestThread::post(&author, &space, "A post");
        let reaction = TestEngagement::react(&engager, &post, 1); // Heart emoji

        assert_eq!(reaction.emoji, Some(1));
    }

    #[test]
    fn test_fixtures_default() {
        let fixtures = TestFixtures::default();
        assert_eq!(fixtures.users.len(), 5);
        assert_eq!(fixtures.spaces.len(), 3);
    }

    #[test]
    fn test_fixtures_create_conversation() {
        let fixtures = TestFixtures::new(3, 1);
        let messages = fixtures.create_conversation(&["Hello", "Hi there", "How are you?"]);

        assert_eq!(messages.len(), 3);
        // First message is a post
        assert_eq!(messages[0].content_type, ContentType::Post);
        // Rest are replies
        assert_eq!(messages[1].content_type, ContentType::Reply);
        assert_eq!(messages[2].content_type, ContentType::Reply);
        // Each reply has the previous message as parent
        assert_eq!(messages[1].parent_id, Some(messages[0].content_id));
        assert_eq!(messages[2].parent_id, Some(messages[1].content_id));
    }

    #[test]
    fn test_fixtures_create_engaged_post() {
        let fixtures = TestFixtures::new(5, 1);
        let (post, engagements) = fixtures.create_engaged_post("Popular post");

        assert_eq!(engagements.len(), 4); // All users except author
        for engagement in &engagements {
            assert_eq!(engagement.content_id, post.content_id);
        }
    }

    #[test]
    fn test_deterministic_hashes() {
        assert_eq!(test_hash(0x42), [0x42; 32]);
        assert_eq!(test_content_id(0xAB).0, [0xAB; 32]);
        assert_eq!(test_space_id(0xCD).0, [0xCD; 32]);
    }
}
