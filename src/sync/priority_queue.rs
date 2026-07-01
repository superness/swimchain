//! Priority Queue for Sync System (SPEC_09 §4.6)
//!
//! Implements priority-based request handling for sync operations.
//! Under light load, uses FIFO ordering. Under heavy load, switches
//! to priority ordering to give better service to high-level contributors.

use std::cmp::Reverse;
use std::collections::{BinaryHeap, VecDeque};

/// Default maximum queue size to prevent unbounded memory growth.
pub const DEFAULT_MAX_QUEUE_SIZE: usize = 10_000;

/// Priority levels for sync requests.
///
/// Higher priority requests are processed first when the queue is congested.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum Priority {
    /// Normal priority (default)
    Normal,
    /// Above normal priority
    AboveNormal,
    /// High priority
    High,
    /// Highest priority
    Highest,
}

/// Activation threshold: only use priority ordering when queue exceeds this size.
///
/// Below this threshold, all requests are processed FIFO regardless of priority.
/// This ensures that priority only matters when there's actual congestion.
pub const PRIORITY_QUEUE_ACTIVATION_THRESHOLD: usize = 50;

/// Wrapper that combines priority with sequence number for FIFO within priority.
///
/// When two requests have the same priority, the one with the lower sequence
/// number (older) is processed first, maintaining FIFO order within priority levels.
#[derive(Debug, Clone)]
pub struct PrioritizedRequest<T> {
    /// Priority level for this request
    pub priority: Priority,
    /// Sequence number for FIFO tie-breaking (lower = older)
    pub sequence: u64,
    /// The actual request payload
    pub request: T,
}

// Manual implementations for PartialEq/Eq that only compare priority and sequence
impl<T> PartialEq for PrioritizedRequest<T> {
    fn eq(&self, other: &Self) -> bool {
        self.priority == other.priority && self.sequence == other.sequence
    }
}

impl<T> Eq for PrioritizedRequest<T> {}

impl<T> PartialOrd for PrioritizedRequest<T> {
    fn partial_cmp(&self, other: &Self) -> Option<std::cmp::Ordering> {
        Some(self.cmp(other))
    }
}

impl<T> Ord for PrioritizedRequest<T> {
    fn cmp(&self, other: &Self) -> std::cmp::Ordering {
        // We use BinaryHeap<Reverse<PrioritizedRequest>> which is a min-heap on our ordering.
        // To get "higher priority first, then lower sequence first":
        // - Larger Ord = pops last (due to Reverse making it a min-heap)
        // - So we want: higher priority = Smaller, lower sequence = Smaller
        //
        // Example: Priority::Highest with seq=0 should compare as "smallest"
        //          so it gets popped first from min-heap.
        match self.priority.cmp(&other.priority) {
            std::cmp::Ordering::Equal => {
                // Same priority: lower sequence should come first
                // In min-heap, lower = first, so lower sequence = Smaller ordering
                self.sequence.cmp(&other.sequence)
            }
            // Higher priority should come first
            // Priority enum: Highest > High > AboveNormal > Normal
            // So higher = greater in enum, but we want higher = first = Smaller in ordering
            ord => ord.reverse(),
        }
    }
}

/// Priority queue that falls back to FIFO under light load.
///
/// When the queue size is below `PRIORITY_QUEUE_ACTIVATION_THRESHOLD`,
/// requests are processed in FIFO order regardless of priority.
/// When the threshold is exceeded, requests are reordered by priority.
///
/// This ensures:
/// 1. No priority overhead under normal load
/// 2. Fair treatment when there's congestion
/// 3. High-level contributors get better service under load
///
/// The queue enforces a maximum size to prevent unbounded memory growth.
/// When at capacity, new requests are rejected with backpressure.
pub struct SyncPriorityQueue<T> {
    /// Binary heap for priority ordering (used when activated)
    heap: BinaryHeap<Reverse<PrioritizedRequest<T>>>,
    /// FIFO queue for light load
    fallback: VecDeque<T>,
    /// Next sequence number for ordering
    next_sequence: u64,
    /// Whether we're currently using priority mode
    use_priority: bool,
    /// Maximum queue size (memory bound)
    max_size: usize,
}

impl<T> Default for SyncPriorityQueue<T> {
    fn default() -> Self {
        Self::new()
    }
}

impl<T> SyncPriorityQueue<T> {
    /// Create a new empty priority queue with default maximum size.
    #[must_use]
    pub fn new() -> Self {
        Self::with_max_size(DEFAULT_MAX_QUEUE_SIZE)
    }

    /// Create a new empty priority queue with a custom maximum size.
    #[must_use]
    pub fn with_max_size(max_size: usize) -> Self {
        Self {
            heap: BinaryHeap::new(),
            fallback: VecDeque::new(),
            next_sequence: 0,
            use_priority: false,
            max_size,
        }
    }

    /// Add a request to the queue with the given priority.
    ///
    /// If the queue is below the activation threshold, the priority is
    /// ignored and the request is added to a FIFO queue. Once the threshold
    /// is crossed, all requests are moved to the priority heap.
    ///
    /// Returns `true` if the request was added, `false` if the queue is at
    /// capacity (backpressure).
    pub fn push(&mut self, request: T, priority: Priority) -> bool {
        let total_len = self.heap.len() + self.fallback.len();

        // Enforce maximum queue size
        if total_len >= self.max_size {
            return false;
        }

        if total_len >= PRIORITY_QUEUE_ACTIVATION_THRESHOLD {
            // Migrate fallback to heap if just crossed threshold
            if !self.use_priority {
                self.use_priority = true;
                while let Some(req) = self.fallback.pop_front() {
                    self.heap.push(Reverse(PrioritizedRequest {
                        priority: Priority::Normal,
                        sequence: self.next_sequence,
                        request: req,
                    }));
                    self.next_sequence += 1;
                }
            }

            self.heap.push(Reverse(PrioritizedRequest {
                priority,
                sequence: self.next_sequence,
                request,
            }));
            self.next_sequence += 1;
        } else {
            // Under threshold: just use FIFO
            self.fallback.push_back(request);
        }
        true
    }

    /// Get the maximum queue size.
    #[must_use]
    pub fn max_size(&self) -> usize {
        self.max_size
    }

    /// Check if the queue is at capacity.
    #[must_use]
    pub fn is_full(&self) -> bool {
        self.len() >= self.max_size
    }

    /// Remove and return the highest-priority request.
    ///
    /// In priority mode, returns the request with the highest priority
    /// (and oldest within that priority). In FIFO mode, returns the oldest request.
    pub fn pop(&mut self) -> Option<T> {
        if self.use_priority {
            let result = self.heap.pop().map(|Reverse(pr)| pr.request);

            // If we've drained below threshold, switch back to FIFO mode
            if self.heap.is_empty() {
                self.use_priority = false;
            }

            result
        } else {
            self.fallback.pop_front()
        }
    }

    /// Peek at the highest-priority request without removing it.
    pub fn peek(&self) -> Option<&T> {
        if self.use_priority {
            self.heap.peek().map(|Reverse(pr)| &pr.request)
        } else {
            self.fallback.front()
        }
    }

    /// Return the number of pending requests.
    #[must_use]
    pub fn len(&self) -> usize {
        self.heap.len() + self.fallback.len()
    }

    /// Check if the queue is empty.
    #[must_use]
    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }

    /// Check if priority mode is currently active.
    #[must_use]
    pub fn is_priority_mode(&self) -> bool {
        self.use_priority
    }

    /// Clear all pending requests.
    pub fn clear(&mut self) {
        self.heap.clear();
        self.fallback.clear();
        self.use_priority = false;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_fifo_under_threshold() {
        let mut queue: SyncPriorityQueue<i32> = SyncPriorityQueue::new();

        // Add items with different priorities (below threshold)
        queue.push(1, Priority::Normal);
        queue.push(2, Priority::Highest);
        queue.push(3, Priority::Normal);

        // Should be FIFO regardless of priority
        assert!(!queue.is_priority_mode());
        assert_eq!(queue.pop(), Some(1));
        assert_eq!(queue.pop(), Some(2));
        assert_eq!(queue.pop(), Some(3));
        assert_eq!(queue.pop(), None);
    }

    #[test]
    fn test_priority_mode_activation() {
        let mut queue: SyncPriorityQueue<i32> = SyncPriorityQueue::new();

        // Fill up to threshold
        for i in 0..PRIORITY_QUEUE_ACTIVATION_THRESHOLD {
            queue.push(i as i32, Priority::Normal);
        }

        // Should still be FIFO mode at threshold
        assert!(!queue.is_priority_mode());

        // Add one more to cross threshold
        queue.push(100, Priority::Highest);

        // Now should be in priority mode
        assert!(queue.is_priority_mode());
    }

    #[test]
    fn test_priority_ordering_after_threshold() {
        let mut queue: SyncPriorityQueue<&str> = SyncPriorityQueue::new();

        // Fill up to threshold with normal priority
        for _ in 0..PRIORITY_QUEUE_ACTIVATION_THRESHOLD {
            queue.push("normal", Priority::Normal);
        }

        // Now add requests with different priorities
        queue.push("highest", Priority::Highest);
        queue.push("high", Priority::High);
        queue.push("above_normal", Priority::AboveNormal);
        queue.push("another_normal", Priority::Normal);

        assert!(queue.is_priority_mode());

        // Should get Highest first, then High, then AboveNormal
        assert_eq!(queue.pop(), Some("highest"));
        assert_eq!(queue.pop(), Some("high"));
        assert_eq!(queue.pop(), Some("above_normal"));
    }

    #[test]
    fn test_fifo_within_same_priority() {
        let mut queue: SyncPriorityQueue<i32> = SyncPriorityQueue::new();

        // Fill to threshold
        for i in 0..PRIORITY_QUEUE_ACTIVATION_THRESHOLD {
            queue.push(i as i32, Priority::Normal);
        }

        // Add items at same priority
        queue.push(100, Priority::High);
        queue.push(101, Priority::High);
        queue.push(102, Priority::High);

        // First should be the High priority items in FIFO order
        assert_eq!(queue.pop(), Some(100));
        assert_eq!(queue.pop(), Some(101));
        assert_eq!(queue.pop(), Some(102));
    }

    #[test]
    fn test_len_and_is_empty() {
        let mut queue: SyncPriorityQueue<i32> = SyncPriorityQueue::new();

        assert!(queue.is_empty());
        assert_eq!(queue.len(), 0);

        queue.push(1, Priority::Normal);
        assert!(!queue.is_empty());
        assert_eq!(queue.len(), 1);

        queue.pop();
        assert!(queue.is_empty());
    }

    #[test]
    fn test_peek() {
        let mut queue: SyncPriorityQueue<i32> = SyncPriorityQueue::new();

        assert_eq!(queue.peek(), None);

        queue.push(1, Priority::Normal);
        assert_eq!(queue.peek(), Some(&1));
        assert_eq!(queue.len(), 1); // peek doesn't remove

        queue.pop();
        assert_eq!(queue.peek(), None);
    }

    #[test]
    fn test_clear() {
        let mut queue: SyncPriorityQueue<i32> = SyncPriorityQueue::new();

        for i in 0..100 {
            queue.push(i, Priority::Normal);
        }

        queue.clear();
        assert!(queue.is_empty());
        assert!(!queue.is_priority_mode());
    }

    #[test]
    fn test_priority_ordering_comprehensive() {
        let mut queue: SyncPriorityQueue<(Priority, u32)> = SyncPriorityQueue::new();

        // Fill to threshold
        for _ in 0..PRIORITY_QUEUE_ACTIVATION_THRESHOLD {
            queue.push((Priority::Normal, 0), Priority::Normal);
        }

        // Add mixed priorities
        queue.push((Priority::Normal, 1), Priority::Normal);
        queue.push((Priority::Highest, 1), Priority::Highest);
        queue.push((Priority::AboveNormal, 1), Priority::AboveNormal);
        queue.push((Priority::High, 1), Priority::High);
        queue.push((Priority::Highest, 2), Priority::Highest);

        // Highest priority first (in FIFO order within priority)
        let first = queue.pop().unwrap();
        assert_eq!(first.0, Priority::Highest);
        assert_eq!(first.1, 1);

        let second = queue.pop().unwrap();
        assert_eq!(second.0, Priority::Highest);
        assert_eq!(second.1, 2);

        // Then High
        let third = queue.pop().unwrap();
        assert_eq!(third.0, Priority::High);

        // Then AboveNormal
        let fourth = queue.pop().unwrap();
        assert_eq!(fourth.0, Priority::AboveNormal);
    }

    #[test]
    fn test_switches_back_to_fifo_when_drained() {
        let mut queue: SyncPriorityQueue<i32> = SyncPriorityQueue::new();

        // Fill to threshold + 10
        for i in 0..(PRIORITY_QUEUE_ACTIVATION_THRESHOLD + 10) {
            queue.push(i as i32, Priority::Normal);
        }

        assert!(queue.is_priority_mode());

        // Drain all
        while queue.pop().is_some() {}

        // Should be back to FIFO mode
        assert!(!queue.is_priority_mode());

        // New items should be FIFO
        queue.push(1, Priority::Normal);
        queue.push(2, Priority::Highest);
        assert!(!queue.is_priority_mode());
        assert_eq!(queue.pop(), Some(1)); // FIFO, not priority
    }

    #[test]
    fn test_max_size_backpressure() {
        let mut queue: SyncPriorityQueue<i32> = SyncPriorityQueue::with_max_size(5);

        // Fill to capacity
        for i in 0..5 {
            assert!(queue.push(i, Priority::Normal));
        }

        assert_eq!(queue.len(), 5);
        assert!(queue.is_full());

        // Should reject additional items
        assert!(!queue.push(100, Priority::Highest));
        assert_eq!(queue.len(), 5);

        // Pop one and try again
        queue.pop();
        assert!(!queue.is_full());
        assert!(queue.push(100, Priority::Highest));
        assert_eq!(queue.len(), 5);
    }

    #[test]
    fn test_max_size_getter() {
        let queue: SyncPriorityQueue<i32> = SyncPriorityQueue::with_max_size(100);
        assert_eq!(queue.max_size(), 100);

        let default_queue: SyncPriorityQueue<i32> = SyncPriorityQueue::new();
        assert_eq!(default_queue.max_size(), DEFAULT_MAX_QUEUE_SIZE);
    }
}
