//! Speaker-arrangement helpers for `IAudioProcessor::setBusArrangements`.
//!
//! VST3's `SpeakerArrangement` is a `uint64` bitmask — bit `n` is
//! "speaker `n` is present". The full table is in
//! `pluginterfaces/vst/ivstspeaker.h` but we only need mono + stereo
//! for 4B-3a; surround / Atmos / arbitrary layouts land in a later
//! sub-phase and should add their constants here rather than reach
//! into raw bit values at call sites.
//!
//! Ported-by-convention from the Steinberg SDK rather than the
//! companion app, which never called `setBusArrangements` — its
//! `inputParameterChanges` TODO had a sibling `bus-arrangement TODO`
//! that never shipped.

use vst3::Steinberg::Vst::SpeakerArrangement;

/// No channels — used for "this bus is disconnected" slots when a
/// plugin exposes more busses than we're actively driving (e.g. a
/// sidechain input we want to silence).
pub const EMPTY: SpeakerArrangement = 0;

/// `kSpeakerL` — single front-left channel. This is VST3's mono
/// convention; a truly center-channel mono would use `kSpeakerC` but
/// `kSpeakerL` is what every stock plugin expects for "the mono
/// signal".
pub const MONO: SpeakerArrangement = 1 << 0;

/// `kSpeakerL | kSpeakerR` — standard stereo main bus layout.
pub const STEREO: SpeakerArrangement = (1 << 0) | (1 << 1);

/// Map a plain channel count to the default arrangement we'll
/// request from the plugin. Returns `None` for counts that 4B-3a
/// doesn't yet support (3+ channels, surround layouts).
pub fn arrangement_for_channel_count(channels: u32) -> Option<SpeakerArrangement> {
    match channels {
        0 => Some(EMPTY),
        1 => Some(MONO),
        2 => Some(STEREO),
        _ => None,
    }
}

/// Number of channels advertised by a `SpeakerArrangement`. Useful
/// for double-checking the plugin's preference against our request.
pub fn channel_count(arr: SpeakerArrangement) -> u32 {
    arr.count_ones()
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mono_has_one_speaker() {
        assert_eq!(channel_count(MONO), 1);
    }

    #[test]
    fn stereo_has_two_speakers() {
        assert_eq!(channel_count(STEREO), 2);
    }

    #[test]
    fn empty_has_no_speakers() {
        assert_eq!(channel_count(EMPTY), 0);
    }

    #[test]
    fn arrangement_for_zero_is_empty() {
        assert_eq!(arrangement_for_channel_count(0), Some(EMPTY));
    }

    #[test]
    fn arrangement_for_one_is_mono() {
        assert_eq!(arrangement_for_channel_count(1), Some(MONO));
    }

    #[test]
    fn arrangement_for_two_is_stereo() {
        assert_eq!(arrangement_for_channel_count(2), Some(STEREO));
    }

    #[test]
    fn arrangement_for_three_plus_is_unsupported_in_4b3a() {
        assert!(arrangement_for_channel_count(3).is_none());
        assert!(arrangement_for_channel_count(6).is_none());
        assert!(arrangement_for_channel_count(8).is_none());
    }
}
