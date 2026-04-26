//! Commands that mutate the audio processing graph.
//!
//! The command queue is a one-way pipe from the main thread (Tauri
//! command handlers) to the audio thread (CPAL callback). Commands are
//! applied to the [`super::graph::AudioGraph`] in-place via
//! [`super::graph::AudioGraph::apply`]; they are never reflected back
//! to the main thread.
//!
//! # Generation-checked slot targeting
//!
//! Targeted commands carry a [`super::slot::SlotHandle`] (slot index
//! plus generation counter) rather than a bare `usize`. The audio
//! thread validates the generation against the live value stored on
//! the track before mutating, so a stale command from a previous
//! owner — for example a `SetTrackParams` queued just before the
//! main thread released and re-acquired the same slot for a new
//! track — is silently dropped instead of overwriting the new
//! owner's state. Found by codex review on PR #1696.
//!
//! # Caller invariants
//!
//! - Commands targeting an out-of-range slot index are silently
//!   ignored by `apply` — tolerant of stale UI state.

use serde::{Deserialize, Serialize};

use super::slot::SlotHandle;

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
    /// Seed a slot: mark it occupied, store the handle's generation,
    /// and write the initial params. `AddTrack` is the *first* command
    /// for a new owner so it does not validate the existing state —
    /// it *establishes* the generation that subsequent commands will
    /// be checked against.
    AddTrack {
        handle: SlotHandle,
        params: TrackParams,
    },

    /// Clear a slot back to `Track::default()` (occupied=false,
    /// generation=0, volume=1, pan=0, mute=false, solo=false).
    /// Applied only if the handle's generation matches the live
    /// value on the track — a stale remove from a previous owner
    /// is silently dropped.
    RemoveTrack { handle: SlotHandle },

    /// Replace the parameters of an already-occupied slot.
    /// Generation-checked: a `SetTrackParams` whose handle's
    /// generation no longer matches the live track is silently
    /// dropped. This protects against a race where the main thread
    /// releases a slot and the next track acquires it before an
    /// in-flight `SetTrackParams` from the previous owner has been
    /// drained.
    SetTrackParams {
        handle: SlotHandle,
        params: TrackParams,
    },

    /// Master-bus linear gain. Unconditional — no slot targeting.
    SetMasterVolume { volume: f32 },

    /// Inject a continuous test signal into a track for integration
    /// testing. The audio callback generates a sine at the given
    /// frequency and amplitude into the track's contribution buffer.
    /// Generation-checked like `SetTrackParams`.
    InjectTestSignal {
        handle: SlotHandle,
        frequency: f32,
        amplitude: f32,
    },

    /// Stop any active test signal on a track. Generation-checked.
    StopTestSignal { handle: SlotHandle },

    /// Set the 3-band EQ gains for a track. Generation-checked.
    /// Gains are in dB: 0 = flat, positive = boost, negative = cut.
    SetEqParams {
        handle: SlotHandle,
        low_gain_db: f32,
        mid_gain_db: f32,
        high_gain_db: f32,
    },

    /// Set compressor parameters for a track. Generation-checked.
    SetCompressorParams {
        handle: SlotHandle,
        enabled: bool,
        threshold_db: f32,
        ratio: f32,
    },

    /// Set the send level from a track to an aux bus.
    /// Generation-checked on the track handle.
    SetTrackSendLevel {
        handle: SlotHandle,
        bus_index: u8,
        level: f32,
    },

    /// Set the volume of an aux return bus.
    SetAuxBusVolume { bus_index: u8, volume: f32 },

    /// Enable or disable an aux return bus.
    SetAuxBusEnabled { bus_index: u8, enabled: bool },

    // ── Transport (3A) ────────────────────────────────────────────────

    /// Begin playback from the current position.
    TransportPlay,

    /// Stop playback and rewind to position 0.
    TransportStop,

    /// Stop playback but keep the current position (standard DAW pause).
    TransportPause,

    /// Jump the transport to an absolute sample position.
    TransportSeek { sample_position: u64 },

    /// Scrub: move the playhead by a signed sample delta and put
    /// the transport in `Scrubbing` state. Saturates at 0 and
    /// u64::MAX rather than wrapping.
    TransportScrub { delta_samples: i64 },
}

// Note: `TransportSetTempo` existed in 3A but was removed in 3B once
// the ArcSwap<TempoMap> path shipped — see `Engine::transport_set_tempo`.
// Sending tempo through the command queue would race against direct
// `ArcSwap::store` from `set_tempo_map`, so both paths now publish via
// the same ArcSwap and a later call unambiguously wins.

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
        // new variants are added. `AddTrack` carries a `SlotHandle`
        // (usize + u32) + `TrackParams` (f32 × 2 + bool × 2) +
        // discriminant. 64 bytes is a generous ceiling that still
        // fits in one cache line on every reasonable target.
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
