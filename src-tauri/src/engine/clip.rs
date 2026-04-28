//! Sample-accurate clip scheduler.
//!
//! # Shape
//!
//! A [`ClipSchedule`] is a bounded-capacity set of [`ClipSource`]
//! values, each holding:
//!
//! - an absolute transport sample position where the clip starts,
//! - a length in samples,
//! - an owned linear gain (pre-clamped), and
//! - a reference-counted handle to the raw stereo-interleaved PCM
//!   (`Arc<Vec<f32>>`).
//!
//! Schedules are published from the main thread via an
//! [`arc_swap::ArcSwap`] held on the
//! [`super::transport::Transport`]. The audio callback reads the
//! schedule via wait-free `.load()` guards on every buffer and
//! mixes every clip that intersects the current buffer range into
//! the master bus.
//!
//! # Ownership of audio data
//!
//! `audio_data: Arc<Vec<f32>>` lets multiple clips share a single
//! PCM buffer (think "drag the same sample onto two lanes without
//! doubling memory"). The audio callback only reads through the
//! `Arc`, so publication is wait-free and deallocation happens on
//! whichever thread drops the last reference — typically the main
//! thread when a schedule is replaced.
//!
//! # Real-time safety
//!
//! - No allocation inside the render loop: the schedule is
//!   pre-allocated by the main thread and referenced via a borrow.
//! - Bounded work: the mix loop iterates every clip in the slab
//!   (capped at [`MAX_CLIPS`]), but for each clip the
//!   `intersects_buffer` check is O(1), so the per-buffer cost is
//!   `O(MAX_CLIPS)` comparisons + `O(rendered_samples)` reads for
//!   the intersecting subset.
//! - Interleaved PCM layout matches CPAL's output layout, so the
//!   mixer is a plain two-channel read-and-sum — no channel
//!   deinterleaving needed.

use serde::{Deserialize, Serialize};
use std::fmt;
use std::sync::Arc;

/// Maximum number of clips a single [`ClipSchedule`] can hold. This
/// bounds worst-case per-buffer scan cost; 1024 is an
/// order-of-magnitude more tracks × bars than a typical song.
pub const MAX_CLIPS: usize = 1024;

/// Errors from constructing a [`ClipSchedule`] or [`ClipSource`]
/// with invalid input.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ClipScheduleError {
    /// Schedule exceeded [`MAX_CLIPS`].
    TooManyClips(usize),
    /// Clip's audio_data was empty — would trigger division-by-zero
    /// in the channel-interleave calculation.
    EmptyAudio,
    /// Clip's `length_samples` is longer than the PCM frames
    /// available in `audio_data`.
    LengthExceedsAudio { length: u64, available_frames: u64 },
    /// Clip's `audio_data` length is odd — stereo-interleaved PCM
    /// must have `2 * frames` samples.
    OddAudioLength(usize),
}

impl fmt::Display for ClipScheduleError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ClipScheduleError::TooManyClips(n) => {
                write!(f, "too many clips ({n}, max {MAX_CLIPS})")
            }
            ClipScheduleError::EmptyAudio => {
                f.write_str("clip audio data is empty")
            }
            ClipScheduleError::LengthExceedsAudio {
                length,
                available_frames,
            } => write!(
                f,
                "length_samples ({length}) exceeds available PCM frames ({available_frames})"
            ),
            ClipScheduleError::OddAudioLength(n) => write!(
                f,
                "audio data has {n} samples, which is odd; stereo-interleaved PCM must have 2×frames samples"
            ),
        }
    }
}

impl std::error::Error for ClipScheduleError {}

/// A single audio clip scheduled at an absolute sample position.
///
/// Public fields are writable but values flow through
/// [`ClipSource::new`] before reaching the schedule so the audio
/// thread only ever sees clamped / validated state.
///
/// Serde: camelCase on the wire to match every other engine type.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClipSource {
    /// Absolute transport sample position at which the clip's
    /// first frame plays.
    pub start_sample: u64,
    /// Length in frames (NOT samples-of-interleaved-channels).
    /// The PCM buffer should hold at least `length_samples * 2`
    /// floats in stereo-interleaved layout.
    pub length_samples: u64,
    /// Linear gain applied while mixing, clamped to [0, 1] on
    /// construction.
    pub gain: f32,
    /// Stereo-interleaved PCM at the engine's sample rate. Shared
    /// via `Arc` so multiple `ClipSource`s can reference the same
    /// underlying audio without doubling memory.
    pub audio_data: Arc<Vec<f32>>,
}

impl ClipSource {
    /// Validated constructor. Clamps `gain` to `[0.0, 1.0]`,
    /// rejects empty or odd-length PCM (stereo-interleaved must be
    /// a multiple of 2), and rejects clips whose requested length
    /// exceeds what the PCM buffer actually holds.
    pub fn new(
        start_sample: u64,
        length_samples: u64,
        gain: f32,
        audio_data: Arc<Vec<f32>>,
    ) -> Result<Self, ClipScheduleError> {
        if audio_data.is_empty() {
            return Err(ClipScheduleError::EmptyAudio);
        }
        // Stereo-interleaved: 2 floats per frame. Odd length means
        // the caller handed us the wrong channel layout; reject it
        // here so the audio thread never has to handle a partial
        // trailing sample (found by Copilot review on PR #1719).
        if audio_data.len() % 2 != 0 {
            return Err(ClipScheduleError::OddAudioLength(audio_data.len()));
        }
        let available_frames = (audio_data.len() as u64) / 2;
        if length_samples > available_frames {
            return Err(ClipScheduleError::LengthExceedsAudio {
                length: length_samples,
                available_frames,
            });
        }
        Ok(Self {
            start_sample,
            length_samples,
            gain: normalize_gain(gain),
            audio_data,
        })
    }

    /// Returns `true` if the clip overlaps the half-open buffer
    /// range `[buf_start, buf_end)`. Zero-length clips never
    /// intersect — they span no samples by definition.
    #[inline]
    pub fn intersects_buffer(&self, buf_start: u64, buf_end: u64) -> bool {
        if self.length_samples == 0 {
            return false;
        }
        let clip_end = self.start_sample.saturating_add(self.length_samples);
        self.start_sample < buf_end && clip_end > buf_start
    }

    /// End sample (exclusive) — the first sample past the clip.
    #[inline]
    pub fn end_sample(&self) -> u64 {
        self.start_sample.saturating_add(self.length_samples)
    }
}

/// Fixed-capacity clip schedule. Construction validates the slab
/// fits into [`MAX_CLIPS`] and every contained clip is valid.
///
/// Intentionally `Deserialize` is NOT derived — deserializing a
/// `ClipSchedule` directly would bypass the validated
/// [`ClipSchedule::try_new`] constructor. Tauri commands accept
/// `Vec<ClipSource>` and route through `try_new` on the Rust side.
#[derive(Debug, Serialize)]
pub struct ClipSchedule {
    clips: Vec<ClipSource>,
}

impl ClipSchedule {
    /// Empty schedule. Default for a freshly-started engine.
    pub fn empty() -> Self {
        Self { clips: Vec::new() }
    }

    /// Validated constructor.
    /// Validated constructor.
    ///
    /// Normalizes every incoming clip's `gain` via
    /// [`normalize_gain`] so that a payload arriving via serde
    /// (which can set public fields directly) cannot inject NaN,
    /// ±∞, or out-of-range gain into the mix. Found by Copilot
    /// review on PR #1719.
    pub fn try_new(mut clips: Vec<ClipSource>) -> Result<Self, ClipScheduleError> {
        if clips.len() > MAX_CLIPS {
            return Err(ClipScheduleError::TooManyClips(clips.len()));
        }
        for c in &mut clips {
            if c.audio_data.is_empty() {
                return Err(ClipScheduleError::EmptyAudio);
            }
            if c.audio_data.len() % 2 != 0 {
                return Err(ClipScheduleError::OddAudioLength(c.audio_data.len()));
            }
            let available = (c.audio_data.len() as u64) / 2;
            if c.length_samples > available {
                return Err(ClipScheduleError::LengthExceedsAudio {
                    length: c.length_samples,
                    available_frames: available,
                });
            }
            // Normalize gain — closes the serde-bypass hole where a
            // raw ClipSource literal skipped ClipSource::new.
            c.gain = normalize_gain(c.gain);
        }
        Ok(Self { clips })
    }

    pub fn clips(&self) -> &[ClipSource] {
        &self.clips
    }

    pub fn len(&self) -> usize {
        self.clips.len()
    }

    pub fn is_empty(&self) -> bool {
        self.clips.is_empty()
    }
}

impl Default for ClipSchedule {
    fn default() -> Self {
        Self::empty()
    }
}

/// Clamp gain to the valid unit range, snapping non-finite inputs
/// (NaN / ±∞) to 0. Used by both `ClipSource::new` and
/// `ClipSchedule::try_new` so there is one canonical definition.
#[inline]
pub fn normalize_gain(gain: f32) -> f32 {
    if gain.is_finite() {
        gain.clamp(0.0, 1.0)
    } else {
        0.0
    }
}

/// Render a single clip's contribution into the given stereo
/// master buffers over a segment `[out_start_offset, out_end_offset)`
/// whose samples correspond to absolute transport positions
/// `[seg_start_sample, seg_start_sample + (end - start))`.
///
/// The function computes the intersection of the clip's absolute
/// range with the segment's absolute range and mixes PCM from
/// `clip.audio_data` into `out_l` / `out_r`. If there is no
/// intersection this is a no-op.
///
/// Pulled into its own function so the audio callback can call it
/// twice per buffer when the transport wraps mid-buffer via the
/// loop region — the pre-wrap and post-wrap segments each have
/// their own linear mapping but the same clip set applies.
#[allow(clippy::too_many_arguments)]
pub fn render_clip_segment(
    clip: &ClipSource,
    out_l: &mut [f32],
    out_r: &mut [f32],
    out_start_offset: usize,
    out_end_offset: usize,
    seg_start_sample: u64,
) {
    // Segment range in absolute transport samples.
    let seg_len = (out_end_offset - out_start_offset) as u64;
    let seg_end_sample = seg_start_sample.saturating_add(seg_len);

    // Clip range in absolute transport samples.
    let clip_start = clip.start_sample;
    let clip_end = clip.end_sample();

    // Intersection — the overlap we actually render.
    let overlap_start = clip_start.max(seg_start_sample);
    let overlap_end = clip_end.min(seg_end_sample);
    if overlap_start >= overlap_end {
        return; // no overlap
    }

    // Map overlap to positions inside the clip's PCM and inside
    // the output buffer.
    let pcm_offset_frames = (overlap_start - clip_start) as usize; // position inside clip
    let out_offset = out_start_offset + (overlap_start - seg_start_sample) as usize;
    let render_frames = (overlap_end - overlap_start) as usize;

    let pcm: &[f32] = &clip.audio_data;
    let gain = clip.gain;
    let pcm_len = pcm.len();
    let out_l_len = out_l.len();
    let out_r_len = out_r.len();

    // Stereo-interleaved reads. Each frame is 2 floats: L then R.
    //
    // Defensive bounds checks use `checked_mul`/`checked_add` so a
    // manually-constructed `ClipSource` with a forged length can't
    // wrap `usize` arithmetic and turn an out-of-range read into
    // an in-range one (found by codex review on PR #1719).
    for i in 0..render_frames {
        let Some(frame_idx) = pcm_offset_frames.checked_add(i) else {
            break;
        };
        let Some(src) = frame_idx.checked_mul(2) else {
            break;
        };
        let Some(src_r) = src.checked_add(1) else {
            break;
        };
        if src_r >= pcm_len {
            break;
        }
        let Some(dst) = out_offset.checked_add(i) else {
            break;
        };
        if dst >= out_l_len || dst >= out_r_len {
            break;
        }
        out_l[dst] += pcm[src] * gain;
        out_r[dst] += pcm[src_r] * gain;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_pcm(frames: usize, l_val: f32, r_val: f32) -> Arc<Vec<f32>> {
        let mut v = Vec::with_capacity(frames * 2);
        for _ in 0..frames {
            v.push(l_val);
            v.push(r_val);
        }
        Arc::new(v)
    }

    // ── ClipSource ──────────────────────────────────────────────────

    #[test]
    fn new_clamps_gain_to_unit_range() {
        let pcm = make_pcm(100, 1.0, 1.0);
        let a = ClipSource::new(0, 100, -5.0, pcm.clone()).unwrap();
        let b = ClipSource::new(0, 100, 99.0, pcm.clone()).unwrap();
        let c = ClipSource::new(0, 100, f32::NAN, pcm).unwrap();
        assert_eq!(a.gain, 0.0);
        assert_eq!(b.gain, 1.0);
        assert_eq!(c.gain, 0.0, "NaN snaps to 0");
    }

    #[test]
    fn new_rejects_odd_length_audio() {
        let odd = Arc::new(vec![1.0_f32, 2.0, 3.0]); // 3 samples
        match ClipSource::new(0, 1, 1.0, odd) {
            Err(ClipScheduleError::OddAudioLength(n)) => assert_eq!(n, 3),
            other => panic!("expected OddAudioLength, got {other:?}"),
        }
    }

    #[test]
    fn try_new_normalizes_nan_gain_in_bypass_path() {
        // Codex+Copilot regression: serde / struct-literal
        // construction of ClipSource can set gain to NaN, bypassing
        // ClipSource::new's clamp. try_new must re-normalize so the
        // audio thread never sees NaN.
        let pcm = make_pcm(10, 1.0, 1.0);
        let bad = ClipSource {
            start_sample: 0,
            length_samples: 10,
            gain: f32::NAN,
            audio_data: pcm,
        };
        let schedule = ClipSchedule::try_new(vec![bad]).unwrap();
        assert_eq!(schedule.clips()[0].gain, 0.0, "NaN snaps to 0");
    }

    #[test]
    fn try_new_normalizes_out_of_range_gain_in_bypass_path() {
        let pcm = make_pcm(10, 1.0, 1.0);
        let bad = ClipSource {
            start_sample: 0,
            length_samples: 10,
            gain: 99.0,
            audio_data: pcm,
        };
        let schedule = ClipSchedule::try_new(vec![bad]).unwrap();
        assert_eq!(schedule.clips()[0].gain, 1.0);
    }

    #[test]
    fn try_new_rejects_odd_length_in_bypass_path() {
        let odd = Arc::new(vec![0.5_f32; 7]);
        // Cannot use ClipSource::new (it would reject); build by
        // struct literal to bypass.
        let bad = ClipSource {
            start_sample: 0,
            length_samples: 3,
            gain: 1.0,
            audio_data: odd,
        };
        match ClipSchedule::try_new(vec![bad]) {
            Err(ClipScheduleError::OddAudioLength(_)) => {}
            other => panic!("expected OddAudioLength, got {other:?}"),
        }
    }

    #[test]
    fn error_display_is_human_readable() {
        // Copilot regression: use Display not Debug for user-facing
        // errors.
        let e = ClipScheduleError::TooManyClips(9999);
        assert!(format!("{e}").contains("9999"));
        let e = ClipScheduleError::EmptyAudio;
        assert_eq!(format!("{e}"), "clip audio data is empty");
        let e = ClipScheduleError::OddAudioLength(5);
        assert!(format!("{e}").contains("5"));
        let e = ClipScheduleError::LengthExceedsAudio {
            length: 100,
            available_frames: 50,
        };
        let s = format!("{e}");
        assert!(s.contains("100"));
        assert!(s.contains("50"));
    }

    #[test]
    fn new_rejects_empty_audio() {
        let empty = Arc::new(Vec::<f32>::new());
        assert_eq!(
            ClipSource::new(0, 10, 1.0, empty),
            Err(ClipScheduleError::EmptyAudio)
        );
    }

    #[test]
    fn new_rejects_length_exceeding_audio() {
        let pcm = make_pcm(10, 1.0, 1.0); // 10 frames = 20 floats
        match ClipSource::new(0, 100, 1.0, pcm) {
            Err(ClipScheduleError::LengthExceedsAudio { length, available_frames }) => {
                assert_eq!(length, 100);
                assert_eq!(available_frames, 10);
            }
            other => panic!("expected LengthExceedsAudio, got {other:?}"),
        }
    }

    #[test]
    fn intersects_buffer_true_for_overlap() {
        let pcm = make_pcm(1_000, 1.0, 1.0);
        let clip = ClipSource::new(100, 500, 1.0, pcm).unwrap();
        // Buffer straddles clip start.
        assert!(clip.intersects_buffer(50, 200));
        // Buffer inside clip.
        assert!(clip.intersects_buffer(200, 400));
        // Buffer straddles clip end.
        assert!(clip.intersects_buffer(500, 700));
    }

    #[test]
    fn intersects_buffer_false_outside_clip() {
        let pcm = make_pcm(1_000, 1.0, 1.0);
        let clip = ClipSource::new(100, 500, 1.0, pcm).unwrap();
        // Buffer entirely before clip.
        assert!(!clip.intersects_buffer(0, 100));
        // Buffer entirely after clip.
        assert!(!clip.intersects_buffer(600, 800));
    }

    #[test]
    fn intersects_buffer_edge_case_zero_length_clip() {
        let pcm = make_pcm(10, 1.0, 1.0);
        // 0-length clip is degenerate — should not intersect anything.
        let clip = ClipSource::new(100, 0, 1.0, pcm).unwrap();
        assert!(!clip.intersects_buffer(0, 200));
    }

    #[test]
    fn end_sample_is_start_plus_length() {
        let pcm = make_pcm(1_000, 1.0, 1.0);
        let clip = ClipSource::new(100, 500, 1.0, pcm).unwrap();
        assert_eq!(clip.end_sample(), 600);
    }

    #[test]
    fn end_sample_saturates_on_overflow() {
        let pcm = make_pcm(1_000, 1.0, 1.0);
        let clip = ClipSource::new(u64::MAX - 10, 100, 1.0, pcm).unwrap();
        // Would overflow without saturating_add.
        assert_eq!(clip.end_sample(), u64::MAX);
    }

    // ── ClipSchedule ────────────────────────────────────────────────

    #[test]
    fn empty_schedule_has_zero_clips() {
        let s = ClipSchedule::empty();
        assert_eq!(s.len(), 0);
        assert!(s.is_empty());
    }

    #[test]
    fn try_new_accepts_valid_clips() {
        let pcm = make_pcm(100, 1.0, 1.0);
        let clips = vec![
            ClipSource::new(0, 50, 1.0, pcm.clone()).unwrap(),
            ClipSource::new(100, 50, 0.8, pcm).unwrap(),
        ];
        let s = ClipSchedule::try_new(clips).unwrap();
        assert_eq!(s.len(), 2);
    }

    #[test]
    fn try_new_rejects_too_many_clips() {
        let pcm = make_pcm(10, 1.0, 1.0);
        let clips: Vec<_> = (0..MAX_CLIPS + 1)
            .map(|i| ClipSource::new(i as u64, 5, 1.0, pcm.clone()).unwrap())
            .collect();
        match ClipSchedule::try_new(clips) {
            Err(ClipScheduleError::TooManyClips(n)) => assert_eq!(n, MAX_CLIPS + 1),
            other => panic!("expected TooManyClips, got {other:?}"),
        }
    }

    #[test]
    fn try_new_accepts_max_clips_exactly() {
        let pcm = make_pcm(10, 1.0, 1.0);
        let clips: Vec<_> = (0..MAX_CLIPS)
            .map(|i| ClipSource::new(i as u64, 5, 1.0, pcm.clone()).unwrap())
            .collect();
        assert!(ClipSchedule::try_new(clips).is_ok());
    }

    // ── render_clip_segment ─────────────────────────────────────────

    #[test]
    fn render_no_overlap_leaves_output_unchanged() {
        let pcm = make_pcm(100, 0.5, 0.5);
        let clip = ClipSource::new(1000, 50, 1.0, pcm).unwrap();
        let mut l = vec![0.0_f32; 10];
        let mut r = vec![0.0_f32; 10];
        // Segment [0..10) at abs 0..10 — clip is at 1000, no overlap.
        render_clip_segment(&clip, &mut l, &mut r, 0, 10, 0);
        assert!(l.iter().all(|&s| s == 0.0));
        assert!(r.iter().all(|&s| s == 0.0));
    }

    #[test]
    fn render_clip_aligned_to_buffer_start() {
        let pcm = make_pcm(10, 0.25, 0.75);
        let clip = ClipSource::new(100, 10, 1.0, pcm).unwrap();
        let mut l = vec![0.0_f32; 10];
        let mut r = vec![0.0_f32; 10];
        // Segment [0..10) at abs 100..110 — clip fits exactly.
        render_clip_segment(&clip, &mut l, &mut r, 0, 10, 100);
        assert!(l.iter().all(|&s| (s - 0.25).abs() < 1e-6));
        assert!(r.iter().all(|&s| (s - 0.75).abs() < 1e-6));
    }

    #[test]
    fn render_clip_straddling_buffer_boundary_plays_both_halves() {
        let pcm = make_pcm(20, 0.5, 0.5);
        let clip = ClipSource::new(100, 20, 1.0, pcm).unwrap();
        // First buffer: [100..110) — expects first 10 frames of clip.
        let mut l = vec![0.0_f32; 10];
        let mut r = vec![0.0_f32; 10];
        render_clip_segment(&clip, &mut l, &mut r, 0, 10, 100);
        assert!(l.iter().all(|&s| (s - 0.5).abs() < 1e-6));
        // Second buffer: [110..120) — expects last 10 frames.
        let mut l2 = vec![0.0_f32; 10];
        let mut r2 = vec![0.0_f32; 10];
        render_clip_segment(&clip, &mut l2, &mut r2, 0, 10, 110);
        assert!(l2.iter().all(|&s| (s - 0.5).abs() < 1e-6));
    }

    #[test]
    fn render_applies_gain() {
        let pcm = make_pcm(10, 1.0, 1.0);
        let clip = ClipSource::new(0, 10, 0.5, pcm).unwrap();
        let mut l = vec![0.0_f32; 10];
        let mut r = vec![0.0_f32; 10];
        render_clip_segment(&clip, &mut l, &mut r, 0, 10, 0);
        assert!(l.iter().all(|&s| (s - 0.5).abs() < 1e-6));
        assert!(r.iter().all(|&s| (s - 0.5).abs() < 1e-6));
    }

    #[test]
    fn render_accumulates_into_existing_buffer_contents() {
        // Mixer is additive — existing non-zero content must be
        // preserved and the clip's contribution added on top.
        let pcm = make_pcm(5, 0.25, 0.25);
        let clip = ClipSource::new(0, 5, 1.0, pcm).unwrap();
        let mut l = vec![0.1_f32; 5];
        let mut r = vec![0.2_f32; 5];
        render_clip_segment(&clip, &mut l, &mut r, 0, 5, 0);
        assert!(l.iter().all(|&s| (s - 0.35).abs() < 1e-6));
        assert!(r.iter().all(|&s| (s - 0.45).abs() < 1e-6));
    }

    #[test]
    fn render_clip_partially_before_segment_only_renders_inside() {
        // Clip starts at 50, length 100 → [50, 150). Segment [100, 110)
        // at abs [100..110) should render PCM frames 50..60 of the clip.
        let mut pcm_data = Vec::new();
        for i in 0..100 {
            pcm_data.push(i as f32 * 0.01); // L
            pcm_data.push(i as f32 * 0.02); // R
        }
        let clip = ClipSource::new(50, 100, 1.0, Arc::new(pcm_data)).unwrap();
        let mut l = vec![0.0_f32; 10];
        let mut r = vec![0.0_f32; 10];
        render_clip_segment(&clip, &mut l, &mut r, 0, 10, 100);
        // At abs sample 100 we're 50 frames into the clip.
        // L[0] should be pcm L at frame 50 = 0.5.
        assert!((l[0] - 0.50).abs() < 1e-6, "expected 0.50 got {}", l[0]);
        // L[9] should be pcm L at frame 59 = 0.59.
        assert!((l[9] - 0.59).abs() < 1e-6, "expected 0.59 got {}", l[9]);
    }

    #[test]
    fn render_rejects_forged_length_that_would_overflow_usize() {
        // Codex P2 regression (PR #1719): if a caller constructs
        // ClipSource by struct literal (bypassing new) with a
        // forged length_samples approaching u64::MAX, the
        // `pcm_offset_frames * 2` arithmetic could overflow
        // usize and wrap. Checked_mul prevents that.
        let pcm = Arc::new(vec![1.0_f32; 4]); // 2 frames of PCM
        let clip = ClipSource {
            start_sample: 0,
            length_samples: u64::MAX, // forged
            gain: 1.0,
            audio_data: pcm,
        };
        let mut l = vec![0.0_f32; 10];
        let mut r = vec![0.0_f32; 10];
        // Segment at an offset that would overflow with a
        // non-checked `pcm_offset_frames * 2`.
        render_clip_segment(&clip, &mut l, &mut r, 0, 10, usize::MAX as u64 - 100);
        // Audio thread must NOT panic. We don't assert on output
        // content because there is no correct mapping for a
        // forged-length clip — we just need to survive.
    }

    #[test]
    fn render_is_defensive_against_out_of_bounds_pcm_read() {
        // If a caller mutated audio_data after ClipSource::new (via
        // Arc::make_mut shenanigans) so length_samples now exceeds
        // the PCM, the renderer must NOT panic.
        let pcm = Arc::new(vec![1.0; 2]); // 1 frame = 2 floats
        // Construct bypassing try_new-style check — but ClipSource::new
        // validates too, so build manually.
        let clip = ClipSource {
            start_sample: 0,
            length_samples: 100, // way more than 1 frame of PCM
            gain: 1.0,
            audio_data: pcm,
        };
        let mut l = vec![0.0_f32; 10];
        let mut r = vec![0.0_f32; 10];
        render_clip_segment(&clip, &mut l, &mut r, 0, 10, 0);
        // Should render only 1 frame (the one that's actually in the
        // PCM), then bail.
        assert!((l[0] - 1.0).abs() < 1e-6);
        // Frame 1 onward should be untouched (still 0).
        for v in &l[1..] {
            assert_eq!(*v, 0.0);
        }
    }

    #[test]
    fn serde_round_trip_preserves_clip() {
        let pcm = Arc::new(vec![0.1, 0.2, 0.3, 0.4]);
        let clip = ClipSource::new(48_000, 2, 0.7, pcm).unwrap();
        let json = serde_json::to_string(&clip).unwrap();
        assert!(
            json.contains("\"startSample\":48000"),
            "wire format must be camelCase; got {json}"
        );
        assert!(json.contains("\"lengthSamples\":2"));
        assert!(json.contains("\"gain\":0.7"));
        let back: ClipSource = serde_json::from_str(&json).unwrap();
        assert_eq!(back.start_sample, clip.start_sample);
        assert_eq!(back.length_samples, clip.length_samples);
        assert_eq!(back.gain, clip.gain);
        assert_eq!(&*back.audio_data, &*clip.audio_data);
    }
}
