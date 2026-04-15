//! Commands that mutate the audio processing graph.
//!
//! The command queue is a one-way pipe from the main thread (Tauri
//! command handlers) to the audio thread (CPAL callback). Commands are
//! applied to the [`super::graph::AudioGraph`] in-place via
//! [`super::graph::AudioGraph::apply`]; they are never reflected back
//! to the main thread.
//!
//! # Invariants relied on by callers
//!
//! - **Do not reuse a slot** until any outstanding commands that
//!   reference it have been processed by the audio thread. In practice
//!   the command latency is one audio buffer (~5 ms at 256 frames /
//!   48 kHz), so the main thread can safely assume a command is
//!   applied after this much time. Reusing a slot immediately would
//!   risk an in-flight `SetTrackParams` from the old occupant
//!   mutating the new occupant's state.
//!
//! - Commands targeting an out-of-range slot index are silently
//!   ignored by `apply` — tolerant of stale UI state.

use serde::{Deserialize, Serialize};

/// Per-track parameters that the main thread can push at any time.
/// This is the full mutable state of a `Track`; finer-grained commands
/// (set volume only, set pan only) can be added later if automation
/// wants to avoid the churn of re-sending unchanged fields.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrackParams {
    pub volume: f32,
    pub pan: f32,
    pub mute: bool,
    pub solo: bool,
}

impl TrackParams {
    /// Unity-gain, center-pan, unmuted, unsoloed — the default state of
    /// a freshly added track.
    pub fn unity() -> Self {
        Self {
            volume: 1.0,
            pan: 0.0,
            mute: false,
            solo: false,
        }
    }
}

impl Default for TrackParams {
    fn default() -> Self {
        Self::unity()
    }
}

/// A command that mutates the audio graph.
///
/// Deliberately a flat `Copy` enum so that sending one through a
/// lock-free channel (added in 2B-1c) is a plain memcpy with no heap
/// allocation, keeping the audio-thread cost of `try_recv` to a
/// cache-friendly constant.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum EngineCommand {
    /// Mark a slot as occupied and seed its parameters. Out-of-range
    /// slots are ignored. Idempotent: applying twice to the same slot
    /// with the same params produces the same state.
    AddTrack { slot: usize, params: TrackParams },

    /// Clear a slot back to `Track::default()` (occupied=false,
    /// volume=1, pan=0, mute=false, solo=false). Crucially this also
    /// clears the `solo` flag, so `any_solo()` cannot be left stuck on
    /// a stale bit after the soloed track is removed.
    RemoveTrack { slot: usize },

    /// Replace the parameters of an **already occupied** slot. Applied
    /// only if the slot is currently occupied — a command that arrives
    /// after the track was removed is silently dropped, which is the
    /// safer default when commands can race with remove-then-re-add.
    SetTrackParams { slot: usize, params: TrackParams },

    /// Master-bus linear gain.
    SetMasterVolume { volume: f32 },
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn track_params_default_is_unity() {
        assert_eq!(TrackParams::default(), TrackParams::unity());
        let p = TrackParams::default();
        assert_eq!(p.volume, 1.0);
        assert_eq!(p.pan, 0.0);
        assert!(!p.mute);
        assert!(!p.solo);
    }

    #[test]
    fn engine_command_is_copy_and_small() {
        // The whole point of making EngineCommand flat and Copy is
        // that it can be sent through a lock-free channel without
        // allocation. Assert the type is Copy at compile time and
        // that its size is bounded.
        fn assert_copy<T: Copy>() {}
        assert_copy::<EngineCommand>();

        // Regression guard: keep the enum from growing unboundedly as
        // new variants are added. `AddTrack` is currently the largest
        // variant (usize + f32*2 + bool*2 + discriminant). 64 bytes is
        // a generous ceiling that still fits comfortably in a single
        // cache line.
        assert!(
            std::mem::size_of::<EngineCommand>() <= 64,
            "EngineCommand grew to {} bytes",
            std::mem::size_of::<EngineCommand>()
        );
    }

    #[test]
    fn track_params_round_trips_through_serde() {
        let p = TrackParams {
            volume: 0.75,
            pan: -0.3,
            mute: false,
            solo: true,
        };
        let json = serde_json::to_string(&p).unwrap();
        let back: TrackParams = serde_json::from_str(&json).unwrap();
        assert_eq!(p, back);
        // camelCase field names on the wire for the frontend.
        assert!(json.contains("\"volume\":0.75"));
        assert!(json.contains("\"pan\":-0.3"));
        assert!(json.contains("\"solo\":true"));
    }
}
