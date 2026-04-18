//! Audio processing graph — data structures and command application.
//!
//! # Why a fixed-capacity slab?
//!
//! The audio callback runs on a real-time thread that cannot allocate.
//! Pre-allocating the track storage at engine construction means the
//! audio thread only ever reads or mutates existing entries — it never
//! asks the allocator for memory while a buffer is being processed.
//!
//! 256 tracks is generous: Ableton Live 11 default templates cap at 128
//! and Logic Pro at 255. At `sizeof::<Track>` ≈ 20 bytes, the total cost
//! is ~5 KiB — cache-friendly, easy to iterate.
//!
//! # What's NOT in this module
//!
//! - Channel / `Sender<EngineCommand>` wiring → 2B-1c
//! - Integration with the CPAL audio callback → 2B-1c
//!
//! This file exposes leaf data (`Track`, `AudioGraph`) plus the pure
//! `apply` mutator that the audio thread will call once the channel is
//! plumbed in 2B-1c. Nothing here touches real-time audio yet.

use super::command::{EngineCommand, TrackParams};
use super::slot::SlotHandle;

/// Maximum number of simultaneously active tracks. Increase only after
/// a memory / cache-line audit — contiguous iteration over the full
/// slab runs on every callback, so the number directly affects CPU.
pub const MAX_TRACKS: usize = 256;

/// A single track in the processing graph. Flat POD — no heap allocation,
/// no references, cheap to copy, easy to reason about across threads.
///
/// `occupied` is the authoritative liveness flag: the main thread sets
/// it to `true` when a track is added and `false` when it is removed.
/// The audio callback iterates the full array and skips unoccupied
/// slots. Keeping occupancy inside the Track itself (rather than in a
/// side-channel bitmap) simplifies the audio-thread read path to a
/// single cache line per slot.
///
/// `generation` mirrors the [`super::slot::SlotHandle`] generation
/// that last occupied this slot via [`AudioGraph::apply`]. Commands
/// from stale owners (e.g. a `SetTrackParams` that raced against a
/// `RemoveTrack` + re-add) carry the owner's handle; `apply` compares
/// the handle's generation against the live one and silently drops
/// mismatches. `0` is a sentinel "uninitialised" value —
/// `SlotAllocator::acquire` never issues generation 0, so a fresh
/// slot cannot accidentally match a live handle. Found by codex
/// review on PR #1696.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Track {
    pub occupied: bool,
    pub generation: u32,
    /// Linear gain (1.0 = unity, 0.0 = silent). UI-side dB values are
    /// converted to linear before being sent as a command.
    pub volume: f32,
    /// Pan ∈ [-1.0, 1.0]. -1 = hard left, 0 = center, +1 = hard right.
    /// Out-of-range input is clamped by `mixer::equal_power_pan`.
    pub pan: f32,
    pub mute: bool,
    pub solo: bool,
    /// Active test signal: `Some((frequency, amplitude, phase))`.
    /// Set by `InjectTestSignal`, cleared by `StopTestSignal` or
    /// `RemoveTrack`. The audio callback generates a sine into the
    /// track's contribution when this is `Some`. Phase is carried
    /// across callbacks for waveform continuity.
    pub test_signal: Option<(f32, f32, f32)>,
}

impl Default for Track {
    fn default() -> Self {
        Self {
            occupied: false,
            generation: 0,
            volume: 1.0,
            pan: 0.0,
            mute: false,
            solo: false,
            test_signal: None,
        }
    }
}

/// The processing graph's audio-thread-visible state.
///
/// Owned by whoever runs the audio callback (in 2B-1c that will be the
/// CPAL owner thread). The main thread never touches this struct
/// directly — it sends `EngineCommand`s that the audio thread applies
/// in-place.
pub struct AudioGraph {
    tracks: Box<[Track; MAX_TRACKS]>,
    /// Master output gain (linear). Applied after all track summing.
    pub master_volume: f32,
}

impl AudioGraph {
    /// Construct an empty graph with every slot pre-allocated and
    /// `occupied = false`. Exactly one heap allocation happens here,
    /// on the main thread at engine init — zero allocation after.
    pub fn new() -> Self {
        Self {
            tracks: Box::new([Track::default(); MAX_TRACKS]),
            master_volume: 1.0,
        }
    }

    pub fn capacity(&self) -> usize {
        MAX_TRACKS
    }

    pub fn track(&self, slot: usize) -> Option<&Track> {
        self.tracks.get(slot)
    }

    pub fn track_mut(&mut self, slot: usize) -> Option<&mut Track> {
        self.tracks.get_mut(slot)
    }

    /// Unconditional slice accessor for the audio callback. Iterating
    /// the full slab (with an `if occupied` skip per slot) is the
    /// hot-path pattern in 2B-1c.
    pub fn all_tracks(&self) -> &[Track] {
        self.tracks.as_ref()
    }

    pub fn all_tracks_mut(&mut self) -> &mut [Track] {
        self.tracks.as_mut()
    }

    /// Iterator over currently-occupied tracks. Convenience for
    /// main-thread queries (tests, debug, metering summaries).
    pub fn active_tracks(&self) -> impl Iterator<Item = (usize, &Track)> {
        self.tracks
            .iter()
            .enumerate()
            .filter(|(_, t)| t.occupied)
    }

    /// True iff at least one occupied track has `solo = true`.
    pub fn any_solo(&self) -> bool {
        self.tracks.iter().any(|t| t.occupied && t.solo)
    }

    /// Count of currently-occupied tracks.
    pub fn active_count(&self) -> usize {
        self.tracks.iter().filter(|t| t.occupied).count()
    }

    /// Reset a slot back to [`Track::default`].
    ///
    /// This is the **only** supported way to remove a track: it
    /// clears `occupied`, `volume`, `pan`, `mute`, **and** `solo` in a
    /// single step. Callers that flip `occupied = false` directly and
    /// leave the other fields stale risk leaking that state into the
    /// next track that reuses the slot — e.g. the new track would
    /// start out muted, soloed, or hard-panned because the previous
    /// track was. Found by codex review on PR #1694.
    ///
    /// Out-of-range slots are ignored.
    pub fn clear_slot(&mut self, slot: usize) {
        if let Some(t) = self.tracks.get_mut(slot) {
            *t = Track::default();
        }
    }

    /// Apply a command to the graph in place.
    ///
    /// This is the **only** way the audio thread mutates the graph once
    /// 2B-1c plumbs the channel — the main thread sends commands, the
    /// audio callback drains them, and this method performs the actual
    /// mutation. For now it is invoked directly by tests.
    ///
    /// # Generation checks
    ///
    /// Commands that target a specific slot carry a
    /// [`super::slot::SlotHandle`], which bundles the slot index with
    /// the generation assigned by `SlotAllocator` at acquisition time.
    /// `apply` compares the handle's generation against the one
    /// currently stored on the track before performing any mutation.
    /// This closes the race where a `SetTrackParams` or `RemoveTrack`
    /// from a previous owner, queued just before the main thread
    /// released and re-acquired the slot, would otherwise overwrite
    /// the new owner's state — found by codex review on PR #1696.
    ///
    /// # Command semantics
    ///
    /// - [`EngineCommand::AddTrack`] unconditionally seeds the slot:
    ///   writes `occupied = true`, stores the handle's generation,
    ///   and copies params. Out-of-range slots are ignored. Add is
    ///   the *first* command for a new owner so there is nothing to
    ///   validate against — it *establishes* the generation.
    /// - [`EngineCommand::RemoveTrack`] validates the handle's
    ///   generation matches the live one before calling
    ///   [`Self::clear_slot`]. A stale remove is a no-op.
    /// - [`EngineCommand::SetTrackParams`] validates the handle's
    ///   generation matches, the slot is occupied, and then mutates.
    ///   Stale commands are silently dropped.
    /// - [`EngineCommand::SetMasterVolume`] writes the master-bus
    ///   gain unconditionally (no slot targeting).
    pub fn apply(&mut self, cmd: EngineCommand) {
        match cmd {
            EngineCommand::AddTrack { handle, params } => {
                if let Some(t) = self.tracks.get_mut(handle.index()) {
                    t.occupied = true;
                    t.generation = handle.generation();
                    copy_params(t, &params);
                }
            }
            EngineCommand::RemoveTrack { handle } => {
                if self.handle_matches(handle) {
                    // Delegate to clear_slot so the full-reset logic
                    // (including the stale-solo guard) stays in one
                    // place. clear_slot resets generation back to 0,
                    // which can never match a live SlotHandle because
                    // SlotAllocator::acquire never issues generation 0.
                    self.clear_slot(handle.index());
                }
            }
            EngineCommand::SetTrackParams { handle, params } => {
                if self.handle_matches(handle) {
                    // handle_matches already bounds-checked.
                    let t = self.tracks.get_mut(handle.index()).unwrap();
                    copy_params(t, &params);
                }
            }
            EngineCommand::SetMasterVolume { volume } => {
                self.master_volume = volume;
            }
            EngineCommand::InjectTestSignal {
                handle,
                frequency,
                amplitude,
            } => {
                if self.handle_matches(handle) {
                    let t = self.tracks.get_mut(handle.index()).unwrap();
                    t.test_signal = Some((frequency, amplitude, 0.0));
                }
            }
            EngineCommand::StopTestSignal { handle } => {
                if self.handle_matches(handle) {
                    let t = self.tracks.get_mut(handle.index()).unwrap();
                    t.test_signal = None;
                }
            }
            // Effect + routing commands are handled by the audio
            // callback's command router (which routes them to
            // TrackEffects / RoutingState) rather than by
            // AudioGraph::apply. They arrive here only if called
            // directly in tests — ignore them.
            EngineCommand::SetEqParams { .. }
            | EngineCommand::SetCompressorParams { .. }
            | EngineCommand::SetTrackSendLevel { .. }
            | EngineCommand::SetAuxBusVolume { .. }
            | EngineCommand::SetAuxBusEnabled { .. }
            | EngineCommand::TransportPlay
            | EngineCommand::TransportStop
            | EngineCommand::TransportPause
            | EngineCommand::TransportSeek { .. }
            | EngineCommand::TransportScrub { .. } => {}
        }
    }

    /// True iff the handle's slot is in range, currently occupied,
    /// and its generation matches the live value stored on the track.
    /// Pulled into its own helper so every validating arm of `apply`
    /// shares the exact same predicate.
    pub fn handle_matches(&self, handle: SlotHandle) -> bool {
        match self.tracks.get(handle.index()) {
            Some(t) => t.occupied && t.generation == handle.generation(),
            None => false,
        }
    }
}

#[inline]
fn copy_params(track: &mut Track, params: &TrackParams) {
    track.volume = params.volume;
    track.pan = params.pan;
    track.mute = params.mute;
    track.solo = params.solo;
}

impl Default for AudioGraph {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_track_is_unoccupied_unity_centered() {
        let t = Track::default();
        assert!(!t.occupied);
        assert_eq!(t.generation, 0, "sentinel generation");
        assert_eq!(t.volume, 1.0);
        assert_eq!(t.pan, 0.0);
        assert!(!t.mute);
        assert!(!t.solo);
    }

    #[test]
    fn new_graph_has_max_tracks_all_unoccupied() {
        let g = AudioGraph::new();
        assert_eq!(g.capacity(), MAX_TRACKS);
        assert_eq!(g.active_count(), 0);
        assert_eq!(g.master_volume, 1.0);
        assert!(g.all_tracks().iter().all(|t| !t.occupied));
        assert_eq!(g.all_tracks().len(), MAX_TRACKS);
    }

    #[test]
    fn active_tracks_returns_only_occupied_slots() {
        let mut g = AudioGraph::new();
        g.track_mut(5).unwrap().occupied = true;
        g.track_mut(42).unwrap().occupied = true;
        g.track_mut(200).unwrap().occupied = true;

        let active: Vec<usize> = g.active_tracks().map(|(i, _)| i).collect();
        assert_eq!(active, vec![5, 42, 200]);
        assert_eq!(g.active_count(), 3);
    }

    #[test]
    fn any_solo_is_false_on_empty_graph() {
        let g = AudioGraph::new();
        assert!(!g.any_solo());
    }

    #[test]
    fn any_solo_ignores_solo_flag_on_unoccupied_slots() {
        // Edge case: an unoccupied slot may still have dirty solo data
        // left over from a removed track. any_solo() must not observe it,
        // otherwise removing a soloed track would leave the mixer stuck
        // in "any solo" mode with all remaining tracks silent.
        let mut g = AudioGraph::new();
        g.track_mut(1).unwrap().solo = true; // occupied stays false
        assert!(!g.any_solo());
    }

    #[test]
    fn any_solo_detects_occupied_soloed_track() {
        let mut g = AudioGraph::new();
        let t = g.track_mut(7).unwrap();
        t.occupied = true;
        t.solo = true;
        assert!(g.any_solo());
    }

    #[test]
    fn track_accessors_return_none_for_out_of_range() {
        let mut g = AudioGraph::new();
        assert!(g.track(MAX_TRACKS).is_none());
        assert!(g.track_mut(MAX_TRACKS + 1).is_none());
    }

    // ── clear_slot() ────────────────────────────────────────────────

    #[test]
    fn clear_slot_wipes_all_fields_including_solo_and_pan() {
        // Regression guard for codex finding #2 on PR #1694.
        //
        // Directly toggling `occupied = false` leaves volume / pan /
        // mute / solo dirty on the slab entry, so the next track
        // added to that slot would inherit stale state. `clear_slot`
        // is the supported "remove" primitive — it must zero every
        // field so slot reuse is safe without callers having to
        // manually remember which fields to reset.
        let mut g = AudioGraph::new();
        {
            let t = g.track_mut(3).unwrap();
            t.occupied = true;
            t.volume = 0.2;
            t.pan = 0.8;
            t.mute = true;
            t.solo = true;
        }
        assert_eq!(g.active_count(), 1);
        assert!(g.any_solo());

        g.clear_slot(3);

        assert_eq!(g.active_count(), 0);
        assert!(!g.any_solo());
        let t = g.track(3).unwrap();
        assert_eq!(*t, Track::default(), "every field must be reset");
    }

    #[test]
    fn clear_slot_out_of_range_is_noop() {
        let mut g = AudioGraph::new();
        g.clear_slot(MAX_TRACKS);
        g.clear_slot(usize::MAX);
        assert_eq!(g.active_count(), 0);
    }

    #[test]
    fn clear_slot_then_reuse_has_no_leakage() {
        // End-to-end: create a soloed muted track, clear the slot,
        // re-mark it occupied with default params, verify no bleed.
        let mut g = AudioGraph::new();
        {
            let t = g.track_mut(0).unwrap();
            t.occupied = true;
            t.mute = true;
            t.solo = true;
            t.pan = -0.9;
            t.volume = 0.1;
        }
        g.clear_slot(0);
        // Simulate a fresh "add" by re-flipping occupied.
        g.track_mut(0).unwrap().occupied = true;
        let t = g.track(0).unwrap();
        assert_eq!(t.volume, 1.0);
        assert_eq!(t.pan, 0.0);
        assert!(!t.mute);
        assert!(!t.solo);
    }

    // ── apply() semantics ───────────────────────────────────────────

    use super::super::slot::SlotAllocator;

    fn solo_params() -> TrackParams {
        TrackParams {
            volume: 0.5,
            pan: -0.25,
            mute: false,
            solo: true,
        }
    }

    /// Set up a graph + allocator, acquire one handle, and return both.
    /// Tests that only need a single live track use this helper.
    fn graph_with_one_track() -> (AudioGraph, SlotAllocator, SlotHandle) {
        let g = AudioGraph::new();
        let mut alloc = SlotAllocator::with_default_capacity();
        let h = alloc.acquire().unwrap();
        (g, alloc, h)
    }

    #[test]
    fn apply_add_track_marks_slot_occupied_with_params_and_generation() {
        let (mut g, _alloc, h) = graph_with_one_track();
        g.apply(EngineCommand::AddTrack {
            handle: h,
            params: solo_params(),
        });
        let t = g.track(h.index()).unwrap();
        assert!(t.occupied);
        assert_eq!(t.generation, h.generation());
        assert_eq!(t.volume, 0.5);
        assert_eq!(t.pan, -0.25);
        assert!(!t.mute);
        assert!(t.solo);
        assert_eq!(g.active_count(), 1);
        assert!(g.any_solo());
    }

    #[test]
    fn apply_add_track_on_clamped_graph_with_oor_slot_is_noop() {
        // Construct a handle that points past the graph capacity by
        // using a SlotAllocator with a deliberately larger capacity.
        // Real code would never produce such a handle, but the guard
        // has to exist — out-of-range slots must be silently ignored.
        let mut g = AudioGraph::new();
        let mut alloc = SlotAllocator::new(MAX_TRACKS + 4);
        // Drain the in-range slots so the next acquire returns an
        // index past MAX_TRACKS.
        for _ in 0..MAX_TRACKS {
            alloc.acquire();
        }
        let h = alloc.acquire().unwrap();
        assert!(h.index() >= MAX_TRACKS);
        g.apply(EngineCommand::AddTrack {
            handle: h,
            params: TrackParams::unity(),
        });
        assert_eq!(g.active_count(), 0);
    }

    #[test]
    fn apply_remove_track_clears_all_fields_including_solo() {
        // Regression guard for the `any_solo` stale-bit edge case from
        // 2B-1a. After removing a soloed track, any_solo() must be
        // false — i.e. RemoveTrack must zero the solo bit, not just
        // the occupied bit.
        let (mut g, _alloc, h) = graph_with_one_track();
        g.apply(EngineCommand::AddTrack {
            handle: h,
            params: solo_params(),
        });
        assert!(g.any_solo());

        g.apply(EngineCommand::RemoveTrack { handle: h });
        assert!(!g.any_solo());
        assert_eq!(g.active_count(), 0);
        let t = g.track(h.index()).unwrap();
        assert_eq!(*t, Track::default());
    }

    #[test]
    fn apply_set_track_params_updates_occupied_slot() {
        let (mut g, _alloc, h) = graph_with_one_track();
        g.apply(EngineCommand::AddTrack {
            handle: h,
            params: TrackParams::unity(),
        });
        g.apply(EngineCommand::SetTrackParams {
            handle: h,
            params: TrackParams {
                volume: 0.1,
                pan: 0.9,
                mute: true,
                solo: false,
            },
        });
        let t = g.track(h.index()).unwrap();
        assert_eq!(t.volume, 0.1);
        assert_eq!(t.pan, 0.9);
        assert!(t.mute);
        assert!(!t.solo);
        assert!(t.occupied, "SetTrackParams must not clear occupancy");
        assert_eq!(t.generation, h.generation(), "generation unchanged");
    }

    #[test]
    fn apply_set_track_params_on_unoccupied_slot_is_dropped() {
        // A SetTrackParams that arrives without a prior AddTrack must
        // not silently re-occupy the slot. Otherwise a removed track
        // would pop back into the mix after the user expected it gone.
        let (mut g, _alloc, h) = graph_with_one_track();
        g.apply(EngineCommand::SetTrackParams {
            handle: h,
            params: TrackParams {
                volume: 2.0,
                pan: 0.5,
                mute: false,
                solo: true,
            },
        });
        let t = g.track(h.index()).unwrap();
        assert_eq!(*t, Track::default(), "slot must stay pristine");
        assert!(!g.any_solo());
    }

    #[test]
    fn apply_stale_set_track_params_from_previous_owner_is_dropped() {
        // Regression guard for codex finding on PR #1696.
        //
        // Scenario:
        //   1. Allocator hands handle_a to owner A (slot 0, gen 1)
        //   2. Main thread queues SetTrackParams(handle_a, X) for A
        //   3. Main thread removes owner A (RemoveTrack then release)
        //   4. Main thread re-acquires → handle_b (slot 0, gen 2) for owner B
        //   5. Main thread queues AddTrack(handle_b, Y) for B
        //   6. Audio thread drains. BUT the stale SetTrackParams from
        //      step 2 arrives BEFORE the RemoveTrack in a reordered
        //      scenario — or alternatively the main thread compiled
        //      SetTrackParams against handle_a after B was in place.
        //
        // Without generation checks, that stale SetTrackParams would
        // mutate owner B's state with A's params. With generation
        // checks, the handle's gen 1 doesn't match the live gen 2 on
        // the slot, and the command is silently dropped.
        let mut g = AudioGraph::new();
        let mut alloc = SlotAllocator::with_default_capacity();

        // Owner A acquires and is added.
        let handle_a = alloc.acquire().unwrap();
        g.apply(EngineCommand::AddTrack {
            handle: handle_a,
            params: TrackParams::unity(),
        });

        // Owner A is removed AND the slot released to the allocator.
        g.apply(EngineCommand::RemoveTrack { handle: handle_a });
        alloc.release(handle_a);

        // Owner B acquires the same slot and is added with distinct
        // params so we can observe whether a stale command mutates it.
        let handle_b = alloc.acquire().unwrap();
        assert_eq!(handle_a.index(), handle_b.index(), "slot reused");
        assert_ne!(
            handle_a.generation(),
            handle_b.generation(),
            "generation should advance"
        );
        let owner_b_params = TrackParams {
            volume: 0.9,
            pan: 0.3,
            mute: false,
            solo: false,
        };
        g.apply(EngineCommand::AddTrack {
            handle: handle_b,
            params: owner_b_params,
        });

        // A stale SetTrackParams from owner A arrives late. It must be
        // silently dropped and leave owner B's state untouched.
        g.apply(EngineCommand::SetTrackParams {
            handle: handle_a,
            params: TrackParams {
                volume: 0.01,
                pan: -0.99,
                mute: true,
                solo: true,
            },
        });

        let t = g.track(handle_b.index()).unwrap();
        assert_eq!(t.volume, owner_b_params.volume);
        assert_eq!(t.pan, owner_b_params.pan);
        assert!(!t.mute);
        assert!(!t.solo);
        assert_eq!(t.generation, handle_b.generation());

        // A stale RemoveTrack from owner A must also be dropped.
        g.apply(EngineCommand::RemoveTrack { handle: handle_a });
        let t = g.track(handle_b.index()).unwrap();
        assert!(t.occupied, "owner B must still be live");
        assert_eq!(t.generation, handle_b.generation());
    }

    #[test]
    fn apply_set_master_volume_writes_master_bus_gain() {
        let mut g = AudioGraph::new();
        g.apply(EngineCommand::SetMasterVolume { volume: 0.25 });
        assert_eq!(g.master_volume, 0.25);

        g.apply(EngineCommand::SetMasterVolume { volume: 1.5 });
        assert_eq!(g.master_volume, 1.5);
    }

    #[test]
    fn apply_sequence_add_remove_readd_is_clean() {
        // End-to-end simulation: add track, mutate params, remove,
        // re-add at the same slot with different params. Final state
        // must reflect only the second add; no leakage from the first.
        let mut g = AudioGraph::new();
        let mut alloc = SlotAllocator::with_default_capacity();
        let h1 = alloc.acquire().unwrap();

        g.apply(EngineCommand::AddTrack {
            handle: h1,
            params: solo_params(),
        });
        g.apply(EngineCommand::SetTrackParams {
            handle: h1,
            params: TrackParams {
                volume: 0.8,
                pan: 0.6,
                mute: true,
                solo: true,
            },
        });
        g.apply(EngineCommand::RemoveTrack { handle: h1 });
        alloc.release(h1);

        let h2 = alloc.acquire().unwrap();
        assert_eq!(h1.index(), h2.index());
        g.apply(EngineCommand::AddTrack {
            handle: h2,
            params: TrackParams::unity(),
        });
        let t = g.track(h2.index()).unwrap();
        assert!(t.occupied);
        assert_eq!(t.volume, 1.0);
        assert_eq!(t.pan, 0.0);
        assert!(!t.mute);
        assert!(!t.solo);
        assert_eq!(t.generation, h2.generation());
        assert_eq!(g.active_count(), 1);
        assert!(!g.any_solo());
    }

    #[test]
    fn apply_does_not_allocate_on_hot_path() {
        // Proxy check for allocation-free: `apply` is pure mutation on
        // a pre-allocated slab, so the graph's storage pointer must be
        // stable before and after a burst of commands.
        let mut g = AudioGraph::new();
        let mut alloc = SlotAllocator::with_default_capacity();
        let handles: Vec<SlotHandle> = (0..128).map(|_| alloc.acquire().unwrap()).collect();

        let ptr_before = g.all_tracks().as_ptr();
        for &h in &handles {
            g.apply(EngineCommand::AddTrack {
                handle: h,
                params: TrackParams::unity(),
            });
        }
        for &h in &handles {
            g.apply(EngineCommand::SetTrackParams {
                handle: h,
                params: TrackParams {
                    volume: 0.5,
                    pan: 0.1,
                    mute: false,
                    solo: false,
                },
            });
        }
        for &h in &handles {
            g.apply(EngineCommand::RemoveTrack { handle: h });
        }
        g.apply(EngineCommand::SetMasterVolume { volume: 0.75 });
        let ptr_after = g.all_tracks().as_ptr();
        assert_eq!(ptr_before, ptr_after);
        assert_eq!(g.active_count(), 0);
        assert_eq!(g.master_volume, 0.75);
    }

    #[test]
    fn graph_storage_pointer_is_stable_after_mutation() {
        // The audio callback will hold &[Track] across mutations — the
        // underlying storage must be stable. Box<[Track; N]> is a fixed
        // allocation so this is trivially true, but assert it here so a
        // future refactor to Vec<Track> cannot silently break the
        // invariant.
        let mut g = AudioGraph::new();
        let ptr_before = g.all_tracks().as_ptr();
        g.track_mut(0).unwrap().occupied = true;
        g.track_mut(255).unwrap().occupied = true;
        g.master_volume = 0.5;
        let ptr_after = g.all_tracks().as_ptr();
        assert_eq!(ptr_before, ptr_after, "graph storage moved");
    }
}
