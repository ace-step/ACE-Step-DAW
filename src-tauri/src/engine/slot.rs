//! Slot allocator for the audio graph's track array.
//!
//! Runs entirely on the main thread. The audio callback never calls
//! into this — it only reads `Track::occupied` on each slot. Slot
//! allocation happens in response to UI actions (add/remove track),
//! which are rare relative to audio callback frequency.
//!
//! # Why `SlotHandle` instead of a bare `usize`?
//!
//! Codex review on PR #1694 pointed out a race the original bare-usize
//! API could not defend against:
//!
//! 1. `acquire()` → slot 0 handed to owner A
//! 2. `release(0)` from owner A
//! 3. `acquire()` → slot 0 re-handed to owner B
//! 4. A stale, duplicated `release(0)` from owner A arrives
//!
//! With a bare `usize`, step 4 is indistinguishable from a legitimate
//! release by owner B — the allocator would add slot 0 back to the
//! free list while owner B is still using it, and the next `acquire()`
//! would alias a third caller onto the same slab entry.
//!
//! The [`SlotHandle`] returned from [`SlotAllocator::acquire`] carries
//! a generation counter that is bumped on every acquire. A stale
//! release whose generation does not match the current value is
//! dropped silently, so the re-acquired slot stays safely allocated.

use super::graph::MAX_TRACKS;

/// An opaque handle to a live slot. Contains the slot index and the
/// generation number the slot had at the moment of acquisition.
///
/// Handles are `Copy` so they can be stored alongside track metadata
/// without shared-ownership concerns.
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct SlotHandle {
    slot: usize,
    generation: u32,
}

impl SlotHandle {
    /// The raw slot index — use this to address `AudioGraph::track(idx)`
    /// and related accessors.
    pub fn index(&self) -> usize {
        self.slot
    }

    /// The generation at which this handle was issued. Exposed mostly
    /// for debug output; `release` compares it internally.
    pub fn generation(&self) -> u32 {
        self.generation
    }
}

/// Hands out and recycles track slot indices.
///
/// # Internals
///
/// - **`free`** is a reverse-sorted stack so that `Vec::pop()` returns
///   the smallest free slot in O(1), which keeps the user-visible
///   "new tracks appear at slot 0, 1, 2 …" property.
/// - **`generation[i]`** is incremented on every acquisition of slot
///   `i`. A release whose handle's generation does not match is a
///   no-op, closing the stale-release race.
/// - **`allocated[i]`** mirrors "is slot `i` currently handed out" —
///   it enables idempotent double-release within a single generation
///   (a caller that releases twice without re-acquiring sees the
///   second release as a no-op).
///
/// Insertion into `free` on release is an O(N) linear scan, which is
/// intentional: release happens on UI actions (track removed), not on
/// the audio callback. For N = 256 the cost is trivial.
#[derive(Debug)]
pub struct SlotAllocator {
    capacity: usize,
    /// Reverse-sorted: `free[0]` is the largest free index, `free.last()`
    /// is the smallest. `pop()` therefore returns the smallest.
    free: Vec<usize>,
    /// Per-slot generation counter. Incremented on `acquire`. `u32`
    /// with wrapping arithmetic — 4 billion acquisitions of a single
    /// slot before a generation aliases, far beyond any realistic
    /// session.
    generation: Vec<u32>,
    /// `allocated[i] == true` iff slot `i` is currently handed out.
    /// Authoritative state; `free` and `generation` are both
    /// maintained in lockstep with it.
    allocated: Vec<bool>,
}

impl SlotAllocator {
    pub fn new(capacity: usize) -> Self {
        Self {
            capacity,
            free: (0..capacity).rev().collect(),
            generation: vec![0; capacity],
            allocated: vec![false; capacity],
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

    /// True iff the given raw slot index is currently allocated to
    /// some live caller. Useful for tests and for defensive assertions.
    pub fn is_allocated(&self, slot: usize) -> bool {
        self.allocated.get(slot).copied().unwrap_or(false)
    }

    /// Acquire the smallest free slot. Returns `None` when the
    /// allocator is at full capacity.
    pub fn acquire(&mut self) -> Option<SlotHandle> {
        let slot = self.free.pop()?;
        debug_assert!(
            !self.allocated[slot],
            "slot {slot} was on the free list but already marked allocated"
        );
        self.generation[slot] = self.generation[slot].wrapping_add(1);
        self.allocated[slot] = true;
        Some(SlotHandle {
            slot,
            generation: self.generation[slot],
        })
    }

    /// Return a slot to the free pool.
    ///
    /// - Out-of-range handle: no-op.
    /// - Stale handle (generation mismatch): no-op. Protects against
    ///   the release → reacquire → stale-release race documented on
    ///   the module.
    /// - Already-released handle (within the same generation, i.e.
    ///   double release): no-op via the `allocated` check.
    /// - Otherwise the slot is marked free and inserted into the
    ///   free list so the next `acquire` sees it at the correct
    ///   sort position.
    pub fn release(&mut self, handle: SlotHandle) {
        if handle.slot >= self.capacity {
            return;
        }
        if self.generation[handle.slot] != handle.generation {
            // Stale release: the slot has been re-acquired since this
            // handle was issued. Dropping the release is the only
            // safe move — the current owner is still using the slot.
            return;
        }
        if !self.allocated[handle.slot] {
            // Double release within the same generation. Should not
            // happen in well-formed callers but we tolerate it.
            return;
        }
        self.allocated[handle.slot] = false;
        // Reverse-sorted list: find the first index whose value is
        // strictly less than `slot`, insert before it.
        let idx = self
            .free
            .iter()
            .position(|&f| f < handle.slot)
            .unwrap_or(self.free.len());
        self.free.insert(idx, handle.slot);
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
        assert!(a.acquire().is_none());
    }

    #[test]
    fn acquire_hands_out_smallest_index_first() {
        let mut a = SlotAllocator::new(4);
        assert_eq!(a.acquire().unwrap().index(), 0);
        assert_eq!(a.acquire().unwrap().index(), 1);
        assert_eq!(a.acquire().unwrap().index(), 2);
        assert_eq!(a.acquire().unwrap().index(), 3);
        assert!(a.acquire().is_none());
    }

    #[test]
    fn full_then_release_then_acquire_returns_released_slot() {
        let mut a = SlotAllocator::new(3);
        let h0 = a.acquire().unwrap();
        let h1 = a.acquire().unwrap();
        let _h2 = a.acquire().unwrap();
        assert!(a.acquire().is_none());

        a.release(h0);
        assert_eq!(a.acquire().unwrap().index(), h0.index());

        a.release(h1);
        assert_eq!(a.acquire().unwrap().index(), h1.index());
    }

    #[test]
    fn release_restores_smallest_first_ordering() {
        // Fill completely, then release in scrambled order. Next
        // acquires must come back in ascending index order.
        let mut a = SlotAllocator::new(4);
        let handles: Vec<SlotHandle> = (0..4).map(|_| a.acquire().unwrap()).collect();

        a.release(handles[3]);
        a.release(handles[0]);
        a.release(handles[2]);
        a.release(handles[1]);

        assert_eq!(a.acquire().unwrap().index(), 0);
        assert_eq!(a.acquire().unwrap().index(), 1);
        assert_eq!(a.acquire().unwrap().index(), 2);
        assert_eq!(a.acquire().unwrap().index(), 3);
        assert!(a.acquire().is_none());
    }

    #[test]
    fn double_release_is_idempotent() {
        let mut a = SlotAllocator::new(4);
        let h = a.acquire().unwrap();
        a.release(h);
        a.release(h); // same handle, same generation — no-op
        assert_eq!(a.free_count(), 4);
        assert_eq!(a.acquire().unwrap().index(), h.index());
    }

    #[test]
    fn stale_release_after_reacquire_does_not_double_free() {
        // Regression guard for codex finding #1 on PR #1694.
        //
        // Scenario:
        //   1. acquire() → handle_a (slot 0, gen 1)
        //   2. release(handle_a) → slot 0 returns to free list
        //   3. acquire() → handle_b (slot 0, gen 2) — NEW owner
        //   4. stale release(handle_a) from owner A arrives
        //
        // With a bare-usize API, step 4 would be indistinguishable
        // from a legitimate release by owner B. The generation
        // counter inside SlotHandle makes the stale handle detectable:
        // gen 1 != gen 2, so release(handle_a) is a no-op and
        // owner B's slot stays allocated.
        let mut a = SlotAllocator::new(4);
        let handle_a = a.acquire().unwrap();
        assert_eq!(handle_a.index(), 0);
        assert_eq!(handle_a.generation(), 1);

        a.release(handle_a);

        let handle_b = a.acquire().unwrap();
        assert_eq!(handle_b.index(), 0, "slot 0 should be reused");
        assert_eq!(handle_b.generation(), 2, "generation should advance");
        assert!(a.is_allocated(0));

        // Stale release from owner A:
        a.release(handle_a);

        // Owner B must still hold slot 0.
        assert!(
            a.is_allocated(0),
            "stale release must not free a slot that has been re-acquired"
        );
        assert_eq!(
            a.free_count(),
            3,
            "free list must not grow from a stale release"
        );

        // Acquiring the next free slots must NOT return 0 again.
        let next: Vec<usize> = (0..3).map(|_| a.acquire().unwrap().index()).collect();
        assert_eq!(next, vec![1, 2, 3]);
        assert!(a.acquire().is_none());
    }

    #[test]
    fn out_of_range_release_is_ignored() {
        let mut a = SlotAllocator::new(4);
        let before = a.free_count();
        // Construct an out-of-range handle manually. This is only
        // possible because `SlotHandle` fields are exposed to
        // `SlotAllocator` internally; external callers cannot forge
        // them — we do it here to exercise the guard.
        let fake = SlotHandle {
            slot: 99,
            generation: 0,
        };
        a.release(fake);
        assert_eq!(a.free_count(), before);
    }

    #[test]
    fn in_use_accounting_matches_acquires_and_releases() {
        let mut a = SlotAllocator::new(8);
        assert_eq!(a.in_use(), 0);
        let h0 = a.acquire().unwrap();
        let h1 = a.acquire().unwrap();
        let h2 = a.acquire().unwrap();
        assert_eq!(a.in_use(), 3);
        a.release(h1);
        assert_eq!(a.in_use(), 2);
        a.release(h0);
        a.release(h2);
        assert_eq!(a.in_use(), 0);
    }

    #[test]
    fn is_allocated_tracks_lifecycle() {
        let mut a = SlotAllocator::new(3);
        assert!(!a.is_allocated(0));
        let h = a.acquire().unwrap();
        assert!(a.is_allocated(h.index()));
        a.release(h);
        assert!(!a.is_allocated(h.index()));
        assert!(!a.is_allocated(99), "out of range returns false");
    }

    #[test]
    fn default_uses_max_tracks() {
        let a = SlotAllocator::default();
        assert_eq!(a.capacity(), MAX_TRACKS);
        assert_eq!(a.free_count(), MAX_TRACKS);
    }

    #[test]
    fn handle_generation_advances_monotonically() {
        let mut a = SlotAllocator::new(2);
        let h1 = a.acquire().unwrap();
        a.release(h1);
        let h2 = a.acquire().unwrap();
        a.release(h2);
        let h3 = a.acquire().unwrap();
        assert_eq!(h1.generation(), 1);
        assert_eq!(h2.generation(), 2);
        assert_eq!(h3.generation(), 3);
    }

    #[test]
    fn stress_full_cycle_across_capacity() {
        // Allocate every slot, release them in reverse, re-acquire all —
        // the second pass must return the same indices in the same
        // order, proving the free-list bookkeeping is consistent
        // across a full capacity cycle.
        let mut a = SlotAllocator::new(MAX_TRACKS);
        let first: Vec<SlotHandle> = (0..MAX_TRACKS).map(|_| a.acquire().unwrap()).collect();
        assert!(a.acquire().is_none());

        for handle in first.iter().rev() {
            a.release(*handle);
        }
        assert_eq!(a.free_count(), MAX_TRACKS);

        let second: Vec<usize> = (0..MAX_TRACKS)
            .map(|_| a.acquire().unwrap().index())
            .collect();
        assert_eq!(
            first.iter().map(|h| h.index()).collect::<Vec<_>>(),
            second
        );
    }
}
