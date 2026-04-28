//! Multi-level mipmap waveform pyramid for DAW-quality waveform visualization.
//!
//! Generates a pyramid of min/max/RMS summaries at multiple block sizes,
//! enabling O(1) waveform queries at any zoom level. Same architecture as
//! peaks.js (BBC), Audacity, and professional DAWs.
//!
//! Block sizes: [32, 128, 512, 2048] — 4 levels with 4× spacing.
//! Each block stores: [min_l, max_l, rms_l, min_r, max_r, rms_r] (stride 6).

#![cfg_attr(not(feature = "std"), no_std)]
extern crate alloc;

use alloc::vec;
use alloc::vec::Vec;

/// Values stored per block: min_l, max_l, rms_l, min_r, max_r, rms_r
pub const BLOCK_STRIDE: usize = 6;

/// Block sizes for the mipmap pyramid (4 levels, 4× spacing).
pub const BLOCK_SIZES: [u32; 4] = [32, 128, 512, 2048];

/// Binary format magic bytes and version.
const MAGIC: [u8; 4] = [b'A', b'W', b'F', b'M']; // "AWFM" = Ace Waveform Mipmap
const FORMAT_VERSION: u8 = 1;

/// One level of the mipmap pyramid.
#[derive(Debug, Clone)]
pub struct MipmapLevel {
    pub block_size: u32,
    pub num_blocks: u32,
    /// Packed data: [min_l, max_l, rms_l, min_r, max_r, rms_r] × num_blocks
    pub data: Vec<f32>,
}

/// Complete mipmap pyramid for a stereo audio clip.
#[derive(Debug, Clone)]
pub struct WaveformMipmap {
    pub sample_count: u32,
    pub sample_rate: u32,
    pub levels: Vec<MipmapLevel>,
}

/// Query result for one display column.
#[derive(Debug, Clone, Copy, Default)]
pub struct PeakColumn {
    pub min_l: f32,
    pub max_l: f32,
    pub rms_l: f32,
    pub min_r: f32,
    pub max_r: f32,
    pub rms_r: f32,
}

/// Compute the full mipmap pyramid from raw stereo audio samples.
///
/// `left` and `right` must be the same length. For mono audio, pass the same slice for both.
pub fn compute_mipmap(left: &[f32], right: &[f32], sample_rate: u32) -> WaveformMipmap {
    let sample_count = left.len().min(right.len()) as u32;
    let mut levels = Vec::with_capacity(BLOCK_SIZES.len());

    // Level 0: compute directly from samples
    let level0 = compute_level_from_samples(left, right, BLOCK_SIZES[0]);
    levels.push(level0);

    // Levels 1-3: compute from the previous level by merging blocks
    for i in 1..BLOCK_SIZES.len() {
        let ratio = (BLOCK_SIZES[i] / BLOCK_SIZES[i - 1]) as usize;
        let prev = &levels[i - 1];
        let level = compute_level_from_parent(prev, BLOCK_SIZES[i], ratio);
        levels.push(level);
    }

    WaveformMipmap {
        sample_count,
        sample_rate,
        levels,
    }
}

/// Compute a mipmap level directly from raw audio samples.
fn compute_level_from_samples(left: &[f32], right: &[f32], block_size: u32) -> MipmapLevel {
    let bs = block_size as usize;
    let sample_count = left.len().min(right.len());
    let num_blocks = (sample_count + bs - 1) / bs;
    let mut data = vec![0.0f32; num_blocks * BLOCK_STRIDE];

    for b in 0..num_blocks {
        let start = b * bs;
        let end = (start + bs).min(sample_count);
        let count = end - start;
        if count == 0 {
            continue;
        }

        let mut min_l = f32::MAX;
        let mut max_l = f32::MIN;
        let mut sum_sq_l = 0.0f64;
        let mut min_r = f32::MAX;
        let mut max_r = f32::MIN;
        let mut sum_sq_r = 0.0f64;

        for i in start..end {
            let sl = left[i];
            let sr = right[i];
            if sl < min_l { min_l = sl; }
            if sl > max_l { max_l = sl; }
            sum_sq_l += (sl as f64) * (sl as f64);
            if sr < min_r { min_r = sr; }
            if sr > max_r { max_r = sr; }
            sum_sq_r += (sr as f64) * (sr as f64);
        }

        let rms_l = libm::sqrt(sum_sq_l / count as f64) as f32;
        let rms_r = libm::sqrt(sum_sq_r / count as f64) as f32;

        let offset = b * BLOCK_STRIDE;
        data[offset] = min_l;
        data[offset + 1] = max_l;
        data[offset + 2] = rms_l;
        data[offset + 3] = min_r;
        data[offset + 4] = max_r;
        data[offset + 5] = rms_r;
    }

    MipmapLevel {
        block_size,
        num_blocks: num_blocks as u32,
        data,
    }
}

/// Compute a mipmap level by merging blocks from the parent (finer) level.
fn compute_level_from_parent(parent: &MipmapLevel, block_size: u32, ratio: usize) -> MipmapLevel {
    let parent_blocks = parent.num_blocks as usize;
    let num_blocks = (parent_blocks + ratio - 1) / ratio;
    let mut data = vec![0.0f32; num_blocks * BLOCK_STRIDE];

    for b in 0..num_blocks {
        let child_start = b * ratio;
        let child_end = (child_start + ratio).min(parent_blocks);
        let child_count = child_end - child_start;
        if child_count == 0 {
            continue;
        }

        let mut min_l = f32::MAX;
        let mut max_l = f32::MIN;
        let mut sum_rms_sq_l = 0.0f64;
        let mut min_r = f32::MAX;
        let mut max_r = f32::MIN;
        let mut sum_rms_sq_r = 0.0f64;

        for c in child_start..child_end {
            let off = c * BLOCK_STRIDE;
            let c_min_l = parent.data[off];
            let c_max_l = parent.data[off + 1];
            let c_rms_l = parent.data[off + 2];
            let c_min_r = parent.data[off + 3];
            let c_max_r = parent.data[off + 4];
            let c_rms_r = parent.data[off + 5];

            if c_min_l < min_l { min_l = c_min_l; }
            if c_max_l > max_l { max_l = c_max_l; }
            sum_rms_sq_l += (c_rms_l as f64) * (c_rms_l as f64);
            if c_min_r < min_r { min_r = c_min_r; }
            if c_max_r > max_r { max_r = c_max_r; }
            sum_rms_sq_r += (c_rms_r as f64) * (c_rms_r as f64);
        }

        let rms_l = libm::sqrt(sum_rms_sq_l / child_count as f64) as f32;
        let rms_r = libm::sqrt(sum_rms_sq_r / child_count as f64) as f32;

        let offset = b * BLOCK_STRIDE;
        data[offset] = min_l;
        data[offset + 1] = max_l;
        data[offset + 2] = rms_l;
        data[offset + 3] = min_r;
        data[offset + 4] = max_r;
        data[offset + 5] = rms_r;
    }

    MipmapLevel {
        block_size,
        num_blocks: num_blocks as u32,
        data,
    }
}

/// Query the mipmap for per-column peak data over a sample range.
///
/// Automatically selects the optimal mipmap level based on the number of columns.
/// Returns one `PeakColumn` per display column.
pub fn query_peaks(
    mipmap: &WaveformMipmap,
    start_sample: u32,
    end_sample: u32,
    num_columns: u32,
) -> Vec<PeakColumn> {
    if num_columns == 0 || start_sample >= end_sample || mipmap.levels.is_empty() {
        return Vec::new();
    }

    let sample_range = (end_sample - start_sample) as usize;
    let samples_per_column = sample_range / num_columns as usize;

    // Pick the coarsest level whose block_size <= samples_per_column.
    // This ensures at least ~1 block per column for accurate rendering.
    let level = mipmap
        .levels
        .iter()
        .rev()
        .find(|l| (l.block_size as usize) <= samples_per_column)
        .unwrap_or(&mipmap.levels[0]);

    let bs = level.block_size as usize;
    let mut columns = Vec::with_capacity(num_columns as usize);

    for col in 0..num_columns as usize {
        let col_start = start_sample as usize + (col * sample_range) / num_columns as usize;
        let col_end = start_sample as usize + ((col + 1) * sample_range) / num_columns as usize;

        // Map sample range to block indices
        let block_start = col_start / bs;
        let block_end = ((col_end + bs - 1) / bs).min(level.num_blocks as usize);

        if block_start >= block_end {
            columns.push(PeakColumn::default());
            continue;
        }

        let mut min_l = f32::MAX;
        let mut max_l = f32::MIN;
        let mut sum_rms_sq_l = 0.0f64;
        let mut min_r = f32::MAX;
        let mut max_r = f32::MIN;
        let mut sum_rms_sq_r = 0.0f64;
        let block_count = block_end - block_start;

        for b in block_start..block_end {
            let off = b * BLOCK_STRIDE;
            if off + 5 >= level.data.len() {
                break;
            }
            let b_min_l = level.data[off];
            let b_max_l = level.data[off + 1];
            let b_rms_l = level.data[off + 2];
            let b_min_r = level.data[off + 3];
            let b_max_r = level.data[off + 4];
            let b_rms_r = level.data[off + 5];

            if b_min_l < min_l { min_l = b_min_l; }
            if b_max_l > max_l { max_l = b_max_l; }
            sum_rms_sq_l += (b_rms_l as f64) * (b_rms_l as f64);
            if b_min_r < min_r { min_r = b_min_r; }
            if b_max_r > max_r { max_r = b_max_r; }
            sum_rms_sq_r += (b_rms_r as f64) * (b_rms_r as f64);
        }

        let rms_l = if block_count > 0 {
            libm::sqrt(sum_rms_sq_l / block_count as f64) as f32
        } else {
            0.0
        };
        let rms_r = if block_count > 0 {
            libm::sqrt(sum_rms_sq_r / block_count as f64) as f32
        } else {
            0.0
        };

        columns.push(PeakColumn {
            min_l: if min_l == f32::MAX { 0.0 } else { min_l },
            max_l: if max_l == f32::MIN { 0.0 } else { max_l },
            rms_l,
            min_r: if min_r == f32::MAX { 0.0 } else { min_r },
            max_r: if max_r == f32::MIN { 0.0 } else { max_r },
            rms_r,
        });
    }

    columns
}

/// Extract legacy peaks in the old stride-4 format: [Lmax, Lmin, Rmax, Rmin, ...]
/// Used for backward compatibility with existing `Clip.waveformPeaks`.
pub fn extract_legacy_peaks(mipmap: &WaveformMipmap, num_peaks: u32) -> Vec<f32> {
    if mipmap.levels.is_empty() || num_peaks == 0 {
        return Vec::new();
    }

    let columns = query_peaks(mipmap, 0, mipmap.sample_count, num_peaks);
    let mut peaks = Vec::with_capacity(columns.len() * 4);
    for col in &columns {
        peaks.push(col.max_l.max(col.max_r)); // Lmax (mono-merged max)
        peaks.push(col.min_l.min(col.min_r)); // Lmin (mono-merged min)
        peaks.push(col.max_l.max(col.max_r)); // Rmax (same for mono-merged)
        peaks.push(col.min_l.min(col.min_r)); // Rmin (same for mono-merged)
    }
    peaks
}

/// Serialize a mipmap to a compact binary format for IndexedDB storage.
pub fn serialize_mipmap(mipmap: &WaveformMipmap) -> Vec<u8> {
    // Header: magic(4) + version(1) + sample_count(4) + sample_rate(4) + num_levels(1) = 14 bytes
    // Per level: block_size(4) + num_blocks(4) + data(num_blocks * 6 * 4)
    let mut buf = Vec::new();

    // Header
    buf.extend_from_slice(&MAGIC);
    buf.push(FORMAT_VERSION);
    buf.extend_from_slice(&mipmap.sample_count.to_le_bytes());
    buf.extend_from_slice(&mipmap.sample_rate.to_le_bytes());
    buf.push(mipmap.levels.len() as u8);

    // Levels
    for level in &mipmap.levels {
        buf.extend_from_slice(&level.block_size.to_le_bytes());
        buf.extend_from_slice(&level.num_blocks.to_le_bytes());
        for &val in &level.data {
            buf.extend_from_slice(&val.to_le_bytes());
        }
    }

    buf
}

/// Deserialize a mipmap from its binary format.
pub fn deserialize_mipmap(data: &[u8]) -> Result<WaveformMipmap, &'static str> {
    if data.len() < 14 {
        return Err("data too short");
    }
    if &data[0..4] != &MAGIC {
        return Err("invalid magic bytes");
    }
    if data[4] != FORMAT_VERSION {
        return Err("unsupported format version");
    }

    let sample_count = u32::from_le_bytes([data[5], data[6], data[7], data[8]]);
    let sample_rate = u32::from_le_bytes([data[9], data[10], data[11], data[12]]);
    let num_levels = data[13] as usize;

    let mut offset = 14;
    let mut levels = Vec::with_capacity(num_levels);

    for _ in 0..num_levels {
        if offset + 8 > data.len() {
            return Err("truncated level header");
        }
        let block_size = u32::from_le_bytes([
            data[offset], data[offset + 1], data[offset + 2], data[offset + 3],
        ]);
        let num_blocks = u32::from_le_bytes([
            data[offset + 4], data[offset + 5], data[offset + 6], data[offset + 7],
        ]);
        offset += 8;

        let float_count = num_blocks as usize * BLOCK_STRIDE;
        let byte_count = float_count * 4;
        if offset + byte_count > data.len() {
            return Err("truncated level data");
        }

        let mut level_data = Vec::with_capacity(float_count);
        for i in 0..float_count {
            let base = offset + i * 4;
            let val = f32::from_le_bytes([
                data[base], data[base + 1], data[base + 2], data[base + 3],
            ]);
            level_data.push(val);
        }
        offset += byte_count;

        levels.push(MipmapLevel {
            block_size,
            num_blocks,
            data: level_data,
        });
    }

    Ok(WaveformMipmap {
        sample_count,
        sample_rate,
        levels,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_sine(len: usize, freq: f32, sample_rate: f32) -> Vec<f32> {
        (0..len)
            .map(|i| libm::sinf(2.0 * core::f32::consts::PI * freq * i as f32 / sample_rate))
            .collect()
    }

    #[test]
    fn test_compute_mipmap_basic() {
        let samples = make_sine(44100, 440.0, 44100.0); // 1 second of 440Hz
        let mipmap = compute_mipmap(&samples, &samples, 44100);

        assert_eq!(mipmap.sample_count, 44100);
        assert_eq!(mipmap.sample_rate, 44100);
        assert_eq!(mipmap.levels.len(), 4);

        // Level 0: block_size=32, num_blocks = ceil(44100/32) = 1379
        assert_eq!(mipmap.levels[0].block_size, 32);
        assert_eq!(mipmap.levels[0].num_blocks, 1379);
        assert_eq!(mipmap.levels[0].data.len(), 1379 * BLOCK_STRIDE);

        // Level 3: block_size=2048, num_blocks = ceil(44100/2048) = 22
        assert_eq!(mipmap.levels[3].block_size, 2048);
        assert_eq!(mipmap.levels[3].num_blocks, 22);
    }

    #[test]
    fn test_min_max_values() {
        let samples = make_sine(1024, 440.0, 44100.0);
        let mipmap = compute_mipmap(&samples, &samples, 44100);

        // Check that min/max are within [-1, 1] for a sine wave
        let level = &mipmap.levels[0];
        for b in 0..level.num_blocks as usize {
            let off = b * BLOCK_STRIDE;
            assert!(level.data[off] >= -1.0, "min_l out of range");
            assert!(level.data[off + 1] <= 1.0, "max_l out of range");
            assert!(level.data[off] <= level.data[off + 1], "min > max");
            assert!(level.data[off + 2] >= 0.0, "rms_l negative");
        }
    }

    #[test]
    fn test_query_peaks() {
        let samples = make_sine(44100, 440.0, 44100.0);
        let mipmap = compute_mipmap(&samples, &samples, 44100);

        let columns = query_peaks(&mipmap, 0, 44100, 100);
        assert_eq!(columns.len(), 100);

        // Each column should have reasonable values
        for col in &columns {
            assert!(col.min_l <= col.max_l);
            assert!(col.rms_l >= 0.0);
            assert!(col.rms_l <= 1.0);
        }
    }

    #[test]
    fn test_query_peaks_partial_range() {
        let samples = make_sine(44100, 440.0, 44100.0);
        let mipmap = compute_mipmap(&samples, &samples, 44100);

        // Query only the first half
        let columns = query_peaks(&mipmap, 0, 22050, 50);
        assert_eq!(columns.len(), 50);
    }

    #[test]
    fn test_query_peaks_empty() {
        let samples = make_sine(44100, 440.0, 44100.0);
        let mipmap = compute_mipmap(&samples, &samples, 44100);

        assert!(query_peaks(&mipmap, 0, 44100, 0).is_empty());
        assert!(query_peaks(&mipmap, 44100, 44100, 10).is_empty());
    }

    #[test]
    fn test_extract_legacy_peaks() {
        let samples = make_sine(44100, 440.0, 44100.0);
        let mipmap = compute_mipmap(&samples, &samples, 44100);

        let peaks = extract_legacy_peaks(&mipmap, 1024);
        assert_eq!(peaks.len(), 1024 * 4); // stride-4 format
    }

    #[test]
    fn test_serialize_deserialize_roundtrip() {
        let samples = make_sine(44100, 440.0, 44100.0);
        let mipmap = compute_mipmap(&samples, &samples, 44100);

        let bytes = serialize_mipmap(&mipmap);
        let restored = deserialize_mipmap(&bytes).expect("deserialization failed");

        assert_eq!(restored.sample_count, mipmap.sample_count);
        assert_eq!(restored.sample_rate, mipmap.sample_rate);
        assert_eq!(restored.levels.len(), mipmap.levels.len());

        for (orig, rest) in mipmap.levels.iter().zip(restored.levels.iter()) {
            assert_eq!(orig.block_size, rest.block_size);
            assert_eq!(orig.num_blocks, rest.num_blocks);
            assert_eq!(orig.data.len(), rest.data.len());
            for (a, b) in orig.data.iter().zip(rest.data.iter()) {
                assert!((a - b).abs() < 1e-7, "data mismatch: {} vs {}", a, b);
            }
        }
    }

    #[test]
    fn test_deserialize_invalid() {
        assert!(deserialize_mipmap(&[]).is_err());
        assert!(deserialize_mipmap(&[0; 14]).is_err()); // wrong magic
    }

    #[test]
    fn test_level_hierarchy() {
        let samples = make_sine(44100 * 3, 440.0, 44100.0); // 3 seconds
        let mipmap = compute_mipmap(&samples, &samples, 44100);

        // Each level should have fewer blocks than the previous
        for i in 1..mipmap.levels.len() {
            assert!(
                mipmap.levels[i].num_blocks <= mipmap.levels[i - 1].num_blocks,
                "level {} has more blocks than level {}",
                i, i - 1,
            );
        }
    }

    #[test]
    fn test_silence() {
        let silence = vec![0.0f32; 44100];
        let mipmap = compute_mipmap(&silence, &silence, 44100);

        let columns = query_peaks(&mipmap, 0, 44100, 100);
        for col in &columns {
            assert_eq!(col.min_l, 0.0);
            assert_eq!(col.max_l, 0.0);
            assert_eq!(col.rms_l, 0.0);
        }
    }
}
