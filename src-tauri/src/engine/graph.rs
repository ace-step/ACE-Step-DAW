//! Audio processing graph — pure data structures.
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
//! - The command queue (`EngineCommand`) that mutates tracks → 2B-1b
//! - `AudioGraph::apply(cmd)` → 2B-1b
//! - Integration with the CPAL audio callback → 2B-1c
//!
//! This file is intentionally leaf data: `Track`, `AudioGraph`, and
//! simple queries. Nothing here is real-time sensitive yet.

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
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Track {
    pub occupied: bool,
    /// Linear gain (1.0 = unity, 0.0 = silent). UI-side dB values are
    /// converted to linear before being sent as a command.
    pub volume: f32,
    /// Pan ∈ [-1.0, 1.0]. -1 = hard left, 0 = center, +1 = hard right.
    /// Out-of-range input is clamped by `mixer::equal_power_pan`.
    pub pan: f32,
    pub mute: bool,
    pub solo: bool,
}

impl Default for Track {
    fn default() -> Self {
        Self {
            occupied: false,
            volume: 1.0,
            pan: 0.0,
            mute: false,
            solo: false,
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
        // Simulate a fresh "add" by re-flipping occupied (what
        // 2B-1b's EngineCommand::AddTrack will do via apply()).
        g.track_mut(0).unwrap().occupied = true;
        let t = g.track(0).unwrap();
        assert_eq!(t.volume, 1.0);
        assert_eq!(t.pan, 0.0);
        assert!(!t.mute);
        assert!(!t.solo);
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
