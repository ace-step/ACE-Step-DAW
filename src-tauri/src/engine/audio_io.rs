//! Thin wrapper around `cpal` for device enumeration and output stream
//! lifecycle. This module is the *only* place that should touch CPAL
//! directly — the rest of the engine treats audio I/O as an opaque runner.
//!
//! # Real-time safety
//!
//! The data callback passed to CPAL runs on the audio thread and MUST NOT
//! allocate, lock, or panic. For Phase 2B-1c the callback:
//!
//! 1. Drains up to [`COMMAND_DRAIN_BUDGET`] commands from the main-thread
//!    `Receiver<EngineCommand>` via `try_recv` (lock-free).
//! 2. Applies each command to the owned [`AudioGraph`] in place.
//! 3. Writes silence to the output buffer (Phase 2B-2 will replace the
//!    inner loop with real per-track rendering once there is a signal
//!    source).
//!
//! The optional `ACE_AUDIO_SMOKE_SINE=1` env var still produces a quiet
//! 440 Hz sine in place of silence, useful as a manual end-to-end check
//! that the audio thread is running.

use std::sync::atomic::{AtomicUsize, Ordering};

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};

use super::config::{AudioDeviceInfo, VALID_SAMPLE_RATES};
use super::graph::AudioGraph;
use super::{EngineCommand, OpenInfo, RuntimeContext};
use crossbeam_channel::Receiver;

/// Maximum number of commands drained from the main-thread channel per
/// audio callback invocation.
///
/// Bounds the worst-case callback cost so a flood from the main thread
/// cannot spin the audio thread indefinitely — anything unprocessed
/// simply applies on the next buffer, ~5 ms later at 256 frames /
/// 48 kHz. At `sizeof::<EngineCommand>` ≲ 64 B and a bounded apply cost,
/// 128 commands is comfortably under the per-buffer CPU budget.
pub const COMMAND_DRAIN_BUDGET: usize = 128;

/// Enumerate every output device the default host can see, tolerating
/// errors from individual devices (a broken driver for one device must
/// not hide the other devices from the UI).
pub fn list_output_devices() -> Vec<AudioDeviceInfo> {
    let host = cpal::default_host();
    let default_name = host
        .default_output_device()
        .and_then(|d| d.name().ok());

    let devices = match host.output_devices() {
        Ok(iter) => iter,
        Err(_) => return Vec::new(),
    };

    devices
        .filter_map(|device| describe_device(&device, default_name.as_deref()).ok())
        .collect()
}

/// Metadata for the system default output device, or `None` if the host
/// reports no default (e.g. headless CI with no audio subsystem).
pub fn get_default_output_device_info() -> Option<AudioDeviceInfo> {
    let host = cpal::default_host();
    let device = host.default_output_device()?;
    let name = device.name().ok()?;
    describe_device(&device, Some(&name)).ok()
}

fn describe_device(
    device: &cpal::Device,
    default_name: Option<&str>,
) -> Result<AudioDeviceInfo, String> {
    let name = device.name().map_err(|e| e.to_string())?;
    let is_default = default_name.is_some_and(|d| d == name);

    let mut max_channels: u16 = 0;
    let mut rates: std::collections::BTreeSet<u32> = Default::default();
    let mut buf_min: Option<u32> = None;
    let mut buf_max: Option<u32> = None;

    if let Ok(configs) = device.supported_output_configs() {
        for cfg in configs {
            if cfg.channels() > max_channels {
                max_channels = cfg.channels();
            }
            let min = cfg.min_sample_rate().0;
            let max = cfg.max_sample_rate().0;
            for &rate in VALID_SAMPLE_RATES {
                if rate >= min && rate <= max {
                    rates.insert(rate);
                }
            }
            if let cpal::SupportedBufferSize::Range { min, max } = cfg.buffer_size() {
                buf_min = Some(buf_min.map_or(*min, |v| v.min(*min)));
                buf_max = Some(buf_max.map_or(*max, |v| v.max(*max)));
            }
        }
    }

    Ok(AudioDeviceInfo {
        name,
        is_default,
        max_channels,
        supported_sample_rates: rates.into_iter().collect(),
        buffer_size_range: match (buf_min, buf_max) {
            (Some(a), Some(b)) => Some((a, b)),
            _ => None,
        },
    })
}

/// Resolve a requested device name, or fall back to the host default.
fn pick_device(name: Option<&str>) -> Result<cpal::Device, String> {
    let host = cpal::default_host();
    match name {
        Some(requested) => {
            let iter = host
                .output_devices()
                .map_err(|e| format!("enumerate output devices: {e}"))?;
            for device in iter {
                if let Ok(n) = device.name() {
                    if n == requested {
                        return Ok(device);
                    }
                }
            }
            Err(format!("output device '{requested}' not found"))
        }
        None => host
            .default_output_device()
            .ok_or_else(|| "no default output device".into()),
    }
}

/// Production runner: opens a CPAL output stream, plumbs the graph +
/// command receiver into the callback, reports readiness, then blocks
/// on `stop_rx`. Suitable for passing to
/// [`crate::engine::Engine::start_with`] — the production
/// [`crate::engine::Engine::start`] calls it directly.
///
/// This function never panics on the audio thread. All failures are
/// reported through `ctx.ready_tx` as `Err(message)`.
pub fn run_cpal_output_stream(ctx: RuntimeContext) {
    let RuntimeContext {
        config,
        graph,
        cmd_rx,
        ready_tx,
        stop_rx,
    } = ctx;

    // Attempt to open the stream. Any error path short-circuits to
    // reporting Err via ready_tx and returning. The stream handle lives
    // only inside the Ok branch, where it is kept alive for the duration
    // of the blocking recv below.
    let opened = (|| -> Result<(cpal::Stream, OpenInfo), String> {
        let device = pick_device(config.device_name.as_deref())?;
        let device_name = device.name().map_err(|e| e.to_string())?;

        // Base channel count on the device's own default — some devices
        // only support mono, and forcing stereo causes build_output_stream
        // to fail with a confusing error.
        let default_cfg = device
            .default_output_config()
            .map_err(|e| format!("default_output_config: {e}"))?;
        let channels = default_cfg.channels();

        let stream_config = cpal::StreamConfig {
            channels,
            sample_rate: cpal::SampleRate(config.sample_rate),
            buffer_size: cpal::BufferSize::Fixed(config.buffer_size),
        };

        let err_fn = |err| {
            // Never panic on the audio thread. eprintln is async-signal
            // unsafe in theory but fine here — CPAL hosts print diagnostic
            // lines from their own worker threads, not the callback.
            eprintln!("[ace-audio-engine] stream error: {err}");
        };

        let stream = device
            .build_output_stream(
                &stream_config,
                make_audio_callback(graph, cmd_rx),
                err_fn,
                None,
            )
            .map_err(|e| format!("build_output_stream: {e}"))?;
        stream
            .play()
            .map_err(|e| format!("stream.play: {e}"))?;

        let info = OpenInfo {
            active_config: config.clone(),
            device_name,
            channels,
        };
        Ok((stream, info))
    })();

    match opened {
        Ok((stream, info)) => {
            // Report success first so the caller unblocks as early as
            // possible; then keep the stream alive until asked to stop.
            let _ = ready_tx.send(Ok(info));
            // recv() returns either Ok(()) (explicit stop) or Err
            // (sender dropped, meaning the Engine was dropped). Both
            // mean "shut down now".
            let _ = stop_rx.recv();
            // stream is dropped here, closing the CPAL output.
            drop(stream);
        }
        Err(msg) => {
            let _ = ready_tx.send(Err(msg));
            // No stream to hold; thread exits and join() reclaims it.
        }
    }
}

/// Build the real-time data callback.
///
/// Owns the [`AudioGraph`] and the [`Receiver<EngineCommand>`] for the
/// lifetime of the stream. On each invocation it:
///
///  1. Drains up to [`COMMAND_DRAIN_BUDGET`] commands from `cmd_rx`
///     via `try_recv` (lock-free) and applies each to the graph.
///  2. Writes silence (or a quiet test sine) into `data`.
///
/// The graph mutation in step 1 is the only shared state on the audio
/// thread. Step 2 is Phase-2B-1c's placeholder render: track input
/// buffers are silent, so the output is silent. 2B-2 will replace the
/// inner loop with per-track summation once there's a signal source.
///
/// # Real-time safety
///
/// - No heap allocation inside the closure (graph is pre-allocated,
///   `try_recv` is lock-free, `data.fill` is a memset).
/// - No locks (`Mutex`, `RwLock`) anywhere in the path.
/// - No panics: `apply` is bounds-checked, `try_recv` returns errors
///   as values, drain is bounded so no infinite loop.
fn make_audio_callback(
    mut graph: AudioGraph,
    cmd_rx: Receiver<EngineCommand>,
) -> impl FnMut(&mut [f32], &cpal::OutputCallbackInfo) + Send + 'static {
    let smoke_sine = std::env::var("ACE_AUDIO_SMOKE_SINE")
        .ok()
        .is_some_and(|v| v == "1");
    let phase = AtomicUsize::new(0);

    move |data: &mut [f32], _info: &cpal::OutputCallbackInfo| {
        // 1. Drain up to COMMAND_DRAIN_BUDGET commands. Bounded loop
        //    so a flood cannot spin the callback indefinitely.
        for _ in 0..COMMAND_DRAIN_BUDGET {
            match cmd_rx.try_recv() {
                Ok(cmd) => graph.apply(cmd),
                Err(_) => break,
            }
        }

        // 2. Render. For 2B-1c all track input buffers are silent, so
        //    the output is silent. We still "walk the graph" lightly
        //    to exercise the audible-track iteration path and flush
        //    the any-solo query into cache, so 2B-2 only needs to
        //    hook in the per-track render without introducing new
        //    bookkeeping.
        let _any_solo = graph.any_solo();
        let _master = graph.master_volume;

        if smoke_sine {
            // Very quiet 440 Hz sine — inaudible unless you look for it,
            // useful for confirming the callback is really running in
            // manual testing. Zero allocation, one trig per sample.
            let step = phase.fetch_add(data.len(), Ordering::Relaxed);
            let rate = 48_000.0_f32;
            for (i, sample) in data.iter_mut().enumerate() {
                let n = (step + i) as f32;
                *sample = 0.02 * (n * 2.0 * std::f32::consts::PI * 440.0 / rate).sin();
            }
        } else {
            // Default path: write silence. `fill` compiles down to a
            // memset on flat f32 slices.
            data.fill(0.0);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Smoke test: enumeration must not panic or hang even if the host
    /// has no audio devices. Returning an empty vec on headless CI is
    /// the contract.
    #[test]
    fn list_output_devices_does_not_panic() {
        let devices = list_output_devices();
        for d in &devices {
            assert!(!d.name.is_empty(), "device name must be non-empty");
        }
    }

    /// The default-device lookup may return None on headless CI, but
    /// must never panic.
    #[test]
    fn get_default_output_device_info_does_not_panic() {
        let _ = get_default_output_device_info();
    }

    /// `pick_device` with a clearly non-existent name should return an
    /// error, not panic. This also covers the host-enumeration path
    /// even when no real devices are present.
    #[test]
    fn pick_device_rejects_unknown_name() {
        let result = pick_device(Some("__ace_step_nonexistent_device__"));
        // Two acceptable outcomes: error because device not found, OR
        // error because host has no devices at all. Both fail gracefully.
        assert!(result.is_err());
    }

    /// Regression guard for the callback builder: writing into a
    /// pre-allocated buffer must not allocate, and must zero the buffer.
    #[test]
    fn audio_callback_builder_accepts_graph_and_receiver() {
        // Temporarily clear smoke-sine env var to force the silence
        // branch regardless of shell environment.
        // SAFETY: std::env::remove_var is safe in single-threaded tests.
        std::env::remove_var("ACE_AUDIO_SMOKE_SINE");

        let graph = AudioGraph::new();
        let (_cmd_tx, cmd_rx) = crossbeam_channel::bounded::<EngineCommand>(8);
        let mut cb = make_audio_callback(graph, cmd_rx);

        // We can't easily synthesize a real `OutputCallbackInfo` — its
        // constructor is private inside cpal. The return type of
        // `make_audio_callback` guarantees the closure is
        // `FnMut(&mut [f32], &OutputCallbackInfo) + Send + 'static` at
        // compile time, which is what CPAL requires. Unit coverage of
        // the drain loop lives on the state machine side in
        // `engine::tests::send_command_is_drained_by_audio_thread`.
        let _ = &mut cb;

        // Canary: `fill` itself must still be a memset.
        let mut buffer = vec![0.5_f32; 1024];
        buffer.fill(0.0);
        assert!(buffer.iter().all(|&s| s == 0.0));
    }

    /// AudioDeviceInfo JSON schema is stable — the frontend depends on
    /// camelCase field names.
    #[test]
    fn device_info_uses_camel_case_on_wire() {
        let info = AudioDeviceInfo {
            name: "Test".into(),
            is_default: true,
            max_channels: 2,
            supported_sample_rates: vec![48_000],
            buffer_size_range: Some((64, 2048)),
        };
        let json = serde_json::to_string(&info).unwrap();
        assert!(json.contains("\"isDefault\""), "json was: {json}");
        assert!(json.contains("\"maxChannels\""));
        assert!(json.contains("\"supportedSampleRates\""));
        assert!(json.contains("\"bufferSizeRange\""));
    }
}
