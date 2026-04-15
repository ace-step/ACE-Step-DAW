//! Slot allocator for the audio graph's track array.
//!
//! Runs entirely on the main thread. The audio callback never calls
//! into this — it only reads `Track::occupied` on each slot. Slot
//! allocation happens in response to UI actions (add/remove track),
//! which are rare relative to audio callback frequency, so a linear
//! O(N) insertion cost on `release` is fine for the 256-slot capacity.

use super::graph::MAX_TRACKS;

/// Hands out and recycles track slot indices.
///
/// Internally stores a free-list in **reverse** order (largest index
/// first, smallest last) so that `Vec::pop()` can return the smallest
/// free index in O(1). Insertion on `release` maintains the reverse
/// order with a linear scan — cheap for N = 256 and only happens when
/// the user removes a track.
///
/// # Invariants
///
/// - Every index in `free` is `< capacity`.
/// - No duplicates: releasing an already-free slot is a no-op.
/// - Out-of-range release is a no-op (tolerates stale callers).
#[derive(Debug)]
pub struct SlotAllocator {
    capacity: usize,
    /// Reverse-sorted: `free[0]` is the largest free index, `free.last()`
    /// is the smallest. `pop()` therefore returns the smallest.
    free: Vec<usize>,
}

impl SlotAllocator {
    pub fn new(capacity: usize) -> Self {
        // Reverse-preload so pop() returns 0, then 1, then 2 ...
        Self {
            capacity,
            free: (0..capacity).rev().collect(),
        }
    }

    /// Convenience constructor matching [`MAX_TRACKS`].
    pub fn with_default_capacity() -> Self {
        Self::new(MAX_TRACKS)
    }

    pub fn capacity(&self) -> usize {
        self.capacity
    }

    pub fn free_count(&self) -> usize {
        self.free.len()
    }

    pub fn in_use(&self) -> usize {
        self.capacity - self.free.len()
    }

    /// Acquire the smallest free slot. Returns `None` when the allocator
    /// is at full capacity.
    pub fn acquire(&mut self) -> Option<usize> {
        self.free.pop()
    }

    /// Return a slot to the free pool.
    ///
    /// - Out-of-range slot: no-op.
    /// - Already-free slot: no-op (idempotent release is safe under any
    ///   caller race between remove and stop).
    /// - Otherwise inserted into the free list so the next `acquire`
    ///   sees it at the correct sort position.
    pub fn release(&mut self, slot: usize) {
        if slot >= self.capacity {
            return;
        }
        if self.free.iter().any(|&f| f == slot) {
            return;
        }
        // Reverse-sorted list: find the first index whose value is
        // strictly less than `slot`, insert before it. Linear scan is
        // intentional — capacity is 256 and release is not a hot path.
        let idx = self
            .free
            .iter()
            .position(|&f| f < slot)
            .unwrap_or(self.free.len());
        self.free.insert(idx, slot);
    }
}

impl Default for SlotAllocator {
    fn default() -> Self {
        Self::with_default_capacity()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn zero_capacity_never_hands_out_a_slot() {
        let mut a = SlotAllocator::new(0);
        assert_eq!(a.capacity(), 0);
        assert_eq!(a.free_count(), 0);
        assert_eq!(a.acquire(), None);
    }

    #[test]
    fn acquire_hands_out_smallest_index_first() {
        let mut a = SlotAllocator::new(4);
        assert_eq!(a.acquire(), Some(0));
        assert_eq!(a.acquire(), Some(1));
        assert_eq!(a.acquire(), Some(2));
        assert_eq!(a.acquire(), Some(3));
        assert_eq!(a.acquire(), None);
    }

    #[test]
    fn full_then_release_then_acquire_returns_released_slot() {
        let mut a = SlotAllocator::new(3);
        let s0 = a.acquire().unwrap();
        let s1 = a.acquire().unwrap();
        let _s2 = a.acquire().unwrap();
        assert_eq!(a.acquire(), None);

        a.release(s0);
        assert_eq!(a.acquire(), Some(s0));

        a.release(s1);
        assert_eq!(a.acquire(), Some(s1));
    }

    #[test]
    fn release_restores_smallest_first_ordering() {
        // Fill completely, then release in scrambled order. The next
        // acquires must come back in ascending index order, not in the
        // order of release.
        let mut a = SlotAllocator::new(4);
        for _ in 0..4 {
            a.acquire().unwrap();
        }

        a.release(3);
        a.release(0);
        a.release(2);
        a.release(1);

        assert_eq!(a.acquire(), Some(0));
        assert_eq!(a.acquire(), Some(1));
        assert_eq!(a.acquire(), Some(2));
        assert_eq!(a.acquire(), Some(3));
        assert_eq!(a.acquire(), None);
    }

    #[test]
    fn double_release_is_idempotent() {
        let mut a = SlotAllocator::new(4);
        let s = a.acquire().unwrap();
        a.release(s);
        a.release(s); // must not duplicate in free list
        assert_eq!(a.free_count(), 4);
        assert_eq!(a.acquire(), Some(s));
    }

    #[test]
    fn out_of_range_release_is_ignored() {
        let mut a = SlotAllocator::new(4);
        let before = a.free_count();
        a.release(99);
        a.release(usize::MAX);
        assert_eq!(a.free_count(), before);
    }

    #[test]
    fn in_use_accounting_matches_acquires_and_releases() {
        let mut a = SlotAllocator::new(8);
        assert_eq!(a.in_use(), 0);
        let s0 = a.acquire().unwrap();
        let s1 = a.acquire().unwrap();
        let s2 = a.acquire().unwrap();
        assert_eq!(a.in_use(), 3);
        a.release(s1);
        assert_eq!(a.in_use(), 2);
        a.release(s0);
        a.release(s2);
        assert_eq!(a.in_use(), 0);
    }

    #[test]
    fn default_uses_max_tracks() {
        let a = SlotAllocator::default();
        assert_eq!(a.capacity(), MAX_TRACKS);
        assert_eq!(a.free_count(), MAX_TRACKS);
    }

    #[test]
    fn stress_full_cycle_across_capacity() {
        // Allocate every slot, release them in reverse, re-acquire all —
        // the second pass must return the same indices in the same
        // order, proving the free-list bookkeeping is consistent across
        // a full capacity cycle.
        let mut a = SlotAllocator::new(MAX_TRACKS);
        let first: Vec<usize> = (0..MAX_TRACKS).map(|_| a.acquire().unwrap()).collect();
        assert_eq!(a.acquire(), None);

        for &slot in first.iter().rev() {
            a.release(slot);
        }
        assert_eq!(a.free_count(), MAX_TRACKS);

        let second: Vec<usize> = (0..MAX_TRACKS).map(|_| a.acquire().unwrap()).collect();
        assert_eq!(first, second);
    }
}
