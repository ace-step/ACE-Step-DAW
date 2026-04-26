//! WASM bindings for the ace-waveform mipmap library.
//!
//! Designed to be called from a Web Worker for non-blocking mipmap computation.
//! All functions accept and return flat arrays (Float32Array / Uint8Array) for
//! zero-copy transfers between Worker and main thread.

use wasm_bindgen::prelude::*;
use ace_waveform::{
    compute_mipmap, query_peaks, extract_legacy_peaks,
    serialize_mipmap, deserialize_mipmap, BLOCK_STRIDE,
};

/// Compute a mipmap pyramid from stereo audio samples.
///
/// Accepts left/right channel Float32Arrays and sample rate.
/// Returns the serialized mipmap as a Uint8Array (compact binary format).
#[wasm_bindgen]
pub fn compute_mipmap_wasm(left: &[f32], right: &[f32], sample_rate: u32) -> Vec<u8> {
    let mipmap = compute_mipmap(left, right, sample_rate);
    serialize_mipmap(&mipmap)
}

/// Query peaks from a serialized mipmap for a given sample range and column count.
///
/// Returns a flat Float32Array with stride 6 per column:
/// [min_l, max_l, rms_l, min_r, max_r, rms_r, ...]
///
/// The optimal mipmap level is selected automatically.
#[wasm_bindgen]
pub fn query_peaks_wasm(
    mipmap_bytes: &[u8],
    start_sample: u32,
    end_sample: u32,
    num_columns: u32,
) -> Vec<f32> {
    let mipmap = match deserialize_mipmap(mipmap_bytes) {
        Ok(m) => m,
        Err(_) => return Vec::new(),
    };

    let columns = query_peaks(&mipmap, start_sample, end_sample, num_columns);
    let mut result = Vec::with_capacity(columns.len() * BLOCK_STRIDE);

    for col in &columns {
        result.push(col.min_l);
        result.push(col.max_l);
        result.push(col.rms_l);
        result.push(col.min_r);
        result.push(col.max_r);
        result.push(col.rms_r);
    }

    result
}

/// Extract legacy peaks in the old stride-4 format for backward compatibility.
///
/// Returns a flat Float32Array: [Lmax, Lmin, Rmax, Rmin, ...] × num_peaks.
/// Used to populate `Clip.waveformPeaks` for old rendering paths.
#[wasm_bindgen]
pub fn extract_legacy_peaks_wasm(mipmap_bytes: &[u8], num_peaks: u32) -> Vec<f32> {
    let mipmap = match deserialize_mipmap(mipmap_bytes) {
        Ok(m) => m,
        Err(_) => return Vec::new(),
    };

    extract_legacy_peaks(&mipmap, num_peaks)
}
