//! Engagement graph persistent storage

use std::collections::HashSet;

use sled::Db;

use super::types::{EngagementEdge, EngagementStats, EngagementType, MutualEngagement};

/// Prefix for edge data: edge:{engager}:{author}
const EDGE_PREFIX: &[u8] = b"edge:";
/// Prefix for outgoing adjacency list: out:{engager}
const OUT_PREFIX: &[u8] = b"out:";
/// Prefix for incoming adjacency list: in:{author}
const IN_PREFIX: &[u8] = b"in:";
/// Prefix for identity stats: stats:{identity}
const STATS_PREFIX: &[u8] = b"stats:";

/// Persistent engagement graph storage
pub struct EngagementGraphStore {
    db: Db,
}

impl EngagementGraphStore {
    /// Open or create engagement graph store
    pub fn open(db: Db) -> Self {
        Self { db }
    }

    /// Record an engagement: engager engaged with author's content
    pub fn record_engagement(
        &self,
        engager: &[u8; 32],
        author: &[u8; 32],
        engagement_type: EngagementType,
        timestamp: u64,
    ) -> Result<(), EngagementGraphError> {
        // Get or create edge
        let edge_key = self.edge_key(engager, author);
        let (mut edge, is_new_edge) = match self.db.get(&edge_key)? {
            Some(data) => {
                let edge = serde_json::from_slice(&data).map_err(|e| EngagementGraphError::Serialization(e.to_string()))?;
                (edge, false)
            }
            None => {
                // New edge - update adjacency lists
                self.add_to_adjacency_list(OUT_PREFIX, engager, author)?;
                self.add_to_adjacency_list(IN_PREFIX, author, engager)?;
                (EngagementEdge::new(*engager, *author, engagement_type, timestamp), true)
            }
        };

        // Update edge if it already existed (new edges already have count=1)
        if edge.total_count > 1 || edge.last_engagement != timestamp {
            edge.record(engagement_type, timestamp);
        }

        // Persist edge
        let edge_data = serde_json::to_vec(&edge)
            .map_err(|e| EngagementGraphError::Serialization(e.to_string()))?;
        self.db.insert(&edge_key, edge_data)?;

        // Update stats for both identities
        self.update_stats_outgoing(engager, engagement_type, timestamp, engager == author, is_new_edge)?;
        self.update_stats_incoming(author, engagement_type, timestamp, engager == author, is_new_edge)?;

        Ok(())
    }

    /// Get edge between two identities
    pub fn get_edge(&self, engager: &[u8; 32], author: &[u8; 32]) -> Result<Option<EngagementEdge>, EngagementGraphError> {
        let edge_key = self.edge_key(engager, author);
        match self.db.get(&edge_key)? {
            Some(data) => {
                let edge = serde_json::from_slice(&data)
                    .map_err(|e| EngagementGraphError::Serialization(e.to_string()))?;
                Ok(Some(edge))
            }
            None => Ok(None),
        }
    }

    /// Get mutual engagement between two identities
    pub fn get_mutual(&self, identity_a: &[u8; 32], identity_b: &[u8; 32]) -> Result<MutualEngagement, EngagementGraphError> {
        let a_to_b = self.get_edge(identity_a, identity_b)?;
        let b_to_a = self.get_edge(identity_b, identity_a)?;
        Ok(MutualEngagement {
            identity_a: *identity_a,
            identity_b: *identity_b,
            a_to_b,
            b_to_a,
        })
    }

    /// Get stats for an identity
    pub fn get_stats(&self, identity: &[u8; 32]) -> Result<EngagementStats, EngagementGraphError> {
        let stats_key = self.stats_key(identity);
        match self.db.get(&stats_key)? {
            Some(data) => {
                serde_json::from_slice(&data)
                    .map_err(|e| EngagementGraphError::Serialization(e.to_string()))
            }
            None => Ok(EngagementStats::new(*identity)),
        }
    }

    /// Get all authors that an identity has engaged with
    pub fn get_engaged_authors(&self, engager: &[u8; 32]) -> Result<Vec<[u8; 32]>, EngagementGraphError> {
        self.get_adjacency_list(OUT_PREFIX, engager)
    }

    /// Get all identities that have engaged with an author
    pub fn get_engagers(&self, author: &[u8; 32]) -> Result<Vec<[u8; 32]>, EngagementGraphError> {
        self.get_adjacency_list(IN_PREFIX, author)
    }

    /// Get top engagers for an author (by engagement count)
    pub fn get_top_engagers(&self, author: &[u8; 32], limit: usize) -> Result<Vec<(EngagementEdge, u64)>, EngagementGraphError> {
        let engagers = self.get_engagers(author)?;
        let mut edges: Vec<_> = engagers
            .iter()
            .filter_map(|engager| {
                self.get_edge(engager, author).ok().flatten().map(|e| (e.clone(), e.total_count))
            })
            .collect();

        edges.sort_by(|a, b| b.1.cmp(&a.1));
        edges.truncate(limit);
        Ok(edges)
    }

    /// Find identities with mutual engagement above threshold
    pub fn find_mutual_connections(&self, identity: &[u8; 32], min_mutual: u64) -> Result<Vec<MutualEngagement>, EngagementGraphError> {
        let engaged_authors = self.get_engaged_authors(identity)?;
        let engagers = self.get_engagers(identity)?;

        // Find intersection - identities that both engaged with us and we engaged with
        let engaged_set: HashSet<_> = engaged_authors.iter().collect();
        let mutual_ids: Vec<_> = engagers
            .iter()
            .filter(|id| engaged_set.contains(id))
            .cloned()
            .collect();

        // Get mutual engagement for each
        let mut results = Vec::new();
        for other in mutual_ids {
            let mutual = self.get_mutual(identity, &other)?;
            if mutual.total() >= min_mutual {
                results.push(mutual);
            }
        }

        // Sort by total engagement
        results.sort_by(|a, b| b.total().cmp(&a.total()));
        Ok(results)
    }

    /// Get engagement graph statistics
    pub fn graph_stats(&self) -> Result<GraphStats, EngagementGraphError> {
        let mut stats = GraphStats::default();

        // Count edges
        for result in self.db.scan_prefix(EDGE_PREFIX) {
            let (_, _) = result?;
            stats.total_edges += 1;
        }

        // Count identities with stats
        for result in self.db.scan_prefix(STATS_PREFIX) {
            let (_, _) = result?;
            stats.total_identities += 1;
        }

        Ok(stats)
    }

    // === Private helpers ===

    fn edge_key(&self, engager: &[u8; 32], author: &[u8; 32]) -> Vec<u8> {
        let mut key = Vec::with_capacity(EDGE_PREFIX.len() + 64 + 1);
        key.extend_from_slice(EDGE_PREFIX);
        key.extend_from_slice(engager);
        key.push(b':');
        key.extend_from_slice(author);
        key
    }

    fn stats_key(&self, identity: &[u8; 32]) -> Vec<u8> {
        let mut key = Vec::with_capacity(STATS_PREFIX.len() + 32);
        key.extend_from_slice(STATS_PREFIX);
        key.extend_from_slice(identity);
        key
    }

    fn adjacency_key(&self, prefix: &[u8], identity: &[u8; 32]) -> Vec<u8> {
        let mut key = Vec::with_capacity(prefix.len() + 32);
        key.extend_from_slice(prefix);
        key.extend_from_slice(identity);
        key
    }

    fn add_to_adjacency_list(&self, prefix: &[u8], identity: &[u8; 32], other: &[u8; 32]) -> Result<(), EngagementGraphError> {
        let key = self.adjacency_key(prefix, identity);
        let mut list: Vec<[u8; 32]> = match self.db.get(&key)? {
            Some(data) => serde_json::from_slice(&data)
                .map_err(|e| EngagementGraphError::Serialization(e.to_string()))?,
            None => Vec::new(),
        };

        // Only add if not already present
        if !list.contains(other) {
            list.push(*other);
            let data = serde_json::to_vec(&list)
                .map_err(|e| EngagementGraphError::Serialization(e.to_string()))?;
            self.db.insert(&key, data)?;
        }

        Ok(())
    }

    fn get_adjacency_list(&self, prefix: &[u8], identity: &[u8; 32]) -> Result<Vec<[u8; 32]>, EngagementGraphError> {
        let key = self.adjacency_key(prefix, identity);
        match self.db.get(&key)? {
            Some(data) => {
                serde_json::from_slice(&data)
                    .map_err(|e| EngagementGraphError::Serialization(e.to_string()))
            }
            None => Ok(Vec::new()),
        }
    }

    fn update_stats_outgoing(
        &self,
        identity: &[u8; 32],
        engagement_type: EngagementType,
        timestamp: u64,
        is_self: bool,
        is_new_edge: bool,
    ) -> Result<(), EngagementGraphError> {
        let stats_key = self.stats_key(identity);
        let mut stats: EngagementStats = match self.db.get(&stats_key)? {
            Some(data) => serde_json::from_slice(&data)
                .map_err(|e| EngagementGraphError::Serialization(e.to_string()))?,
            None => EngagementStats::new(*identity),
        };

        stats.total_outgoing += 1;
        match engagement_type {
            EngagementType::Reply => stats.outgoing_replies += 1,
            EngagementType::Reaction => stats.outgoing_reactions += 1,
            EngagementType::Quote => stats.outgoing_quotes += 1,
        }
        stats.last_updated = timestamp;

        // Increment unique authors count when this is a new edge (first engagement with this author)
        if is_new_edge {
            stats.unique_authors_engaged += 1;
        }

        let data = serde_json::to_vec(&stats)
            .map_err(|e| EngagementGraphError::Serialization(e.to_string()))?;
        self.db.insert(&stats_key, data)?;

        Ok(())
    }

    fn update_stats_incoming(
        &self,
        identity: &[u8; 32],
        engagement_type: EngagementType,
        timestamp: u64,
        is_self: bool,
        is_new_edge: bool,
    ) -> Result<(), EngagementGraphError> {
        let stats_key = self.stats_key(identity);
        let mut stats: EngagementStats = match self.db.get(&stats_key)? {
            Some(data) => serde_json::from_slice(&data)
                .map_err(|e| EngagementGraphError::Serialization(e.to_string()))?,
            None => EngagementStats::new(*identity),
        };

        stats.total_incoming += 1;
        match engagement_type {
            EngagementType::Reply => stats.incoming_replies += 1,
            EngagementType::Reaction => stats.incoming_reactions += 1,
            EngagementType::Quote => stats.incoming_quotes += 1,
        }
        if is_self {
            stats.self_engagement_count += 1;
        }
        stats.last_updated = timestamp;

        // Increment unique engagers count when this is a new edge (first engagement from this engager)
        if is_new_edge {
            stats.unique_engagers += 1;
        }

        let data = serde_json::to_vec(&stats)
            .map_err(|e| EngagementGraphError::Serialization(e.to_string()))?;
        self.db.insert(&stats_key, data)?;

        Ok(())
    }
}

/// Graph-wide statistics
#[derive(Debug, Clone, Default)]
pub struct GraphStats {
    pub total_edges: u64,
    pub total_identities: u64,
}

/// Engagement graph errors
#[derive(Debug)]
pub enum EngagementGraphError {
    Storage(sled::Error),
    Serialization(String),
}

impl From<sled::Error> for EngagementGraphError {
    fn from(e: sled::Error) -> Self {
        EngagementGraphError::Storage(e)
    }
}

impl std::fmt::Display for EngagementGraphError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            EngagementGraphError::Storage(e) => write!(f, "Storage error: {}", e),
            EngagementGraphError::Serialization(e) => write!(f, "Serialization error: {}", e),
        }
    }
}

impl std::error::Error for EngagementGraphError {}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_db() -> Db {
        sled::Config::new().temporary(true).open().unwrap()
    }

    #[test]
    fn test_record_and_retrieve() {
        let store = EngagementGraphStore::open(test_db());

        let engager = [1u8; 32];
        let author = [2u8; 32];

        store.record_engagement(&engager, &author, EngagementType::Reply, 1000).unwrap();

        let edge = store.get_edge(&engager, &author).unwrap().unwrap();
        assert_eq!(edge.total_count, 1);
        assert_eq!(edge.reply_count, 1);
    }

    #[test]
    fn test_multiple_engagements() {
        let store = EngagementGraphStore::open(test_db());

        let engager = [1u8; 32];
        let author = [2u8; 32];

        store.record_engagement(&engager, &author, EngagementType::Reply, 1000).unwrap();
        store.record_engagement(&engager, &author, EngagementType::Reaction, 2000).unwrap();
        store.record_engagement(&engager, &author, EngagementType::Reply, 3000).unwrap();

        let edge = store.get_edge(&engager, &author).unwrap().unwrap();
        assert_eq!(edge.total_count, 3);
        assert_eq!(edge.reply_count, 2);
        assert_eq!(edge.reaction_count, 1);
    }

    #[test]
    fn test_mutual_engagement() {
        let store = EngagementGraphStore::open(test_db());

        let alice = [1u8; 32];
        let bob = [2u8; 32];

        store.record_engagement(&alice, &bob, EngagementType::Reply, 1000).unwrap();
        store.record_engagement(&bob, &alice, EngagementType::Reaction, 2000).unwrap();

        let mutual = store.get_mutual(&alice, &bob).unwrap();
        assert!(mutual.is_mutual());
        assert_eq!(mutual.total(), 2);
    }

    #[test]
    fn test_self_engagement_tracking() {
        let store = EngagementGraphStore::open(test_db());

        let user = [1u8; 32];

        // Self-engagement
        store.record_engagement(&user, &user, EngagementType::Reaction, 1000).unwrap();
        store.record_engagement(&user, &user, EngagementType::Reaction, 2000).unwrap();

        let stats = store.get_stats(&user).unwrap();
        assert_eq!(stats.self_engagement_count, 2);
        assert_eq!(stats.total_incoming, 2);
    }

    #[test]
    fn test_unique_engagement_counters() {
        let store = EngagementGraphStore::open(test_db());

        let alice = [1u8; 32];
        let bob = [2u8; 32];
        let carol = [3u8; 32];

        // Alice engages with Bob multiple times - should only count as 1 unique author
        store.record_engagement(&alice, &bob, EngagementType::Reply, 1000).unwrap();
        store.record_engagement(&alice, &bob, EngagementType::Reaction, 2000).unwrap();
        store.record_engagement(&alice, &bob, EngagementType::Reply, 3000).unwrap();

        let alice_stats = store.get_stats(&alice).unwrap();
        assert_eq!(alice_stats.unique_authors_engaged, 1);
        assert_eq!(alice_stats.total_outgoing, 3);

        let bob_stats = store.get_stats(&bob).unwrap();
        assert_eq!(bob_stats.unique_engagers, 1);
        assert_eq!(bob_stats.total_incoming, 3);

        // Alice engages with Carol - should now have 2 unique authors
        store.record_engagement(&alice, &carol, EngagementType::Reply, 4000).unwrap();

        let alice_stats = store.get_stats(&alice).unwrap();
        assert_eq!(alice_stats.unique_authors_engaged, 2);
        assert_eq!(alice_stats.total_outgoing, 4);

        // Carol also engages with Bob - Bob should now have 2 unique engagers
        store.record_engagement(&carol, &bob, EngagementType::Reaction, 5000).unwrap();

        let bob_stats = store.get_stats(&bob).unwrap();
        assert_eq!(bob_stats.unique_engagers, 2);
        assert_eq!(bob_stats.total_incoming, 4);
    }
}
