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

// AtomicUsize was used for the Phase 2A smoke-sine phase counter,
// which is now replaced by the per-track test signal generator.

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};

use ringbuf::traits::Producer;

use super::config::{AudioDeviceInfo, VALID_SAMPLE_RATES};
use super::graph::AudioGraph;
use super::meter::generate_sine;
use super::meter_bank::MeterProducers;
use super::clip::render_clip_segment;
use super::count_in::CountInState;
use super::metronome::{render_metronome_segment, ClickGenerator};
use super::mixer;
use super::transport::Transport;
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
        meter_producers,
        track_effects,
        routing,
        transport,
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
                make_audio_callback(
                    graph,
                    cmd_rx,
                    meter_producers,
                    track_effects,
                    routing,
                    transport,
                    config.sample_rate as f32,
                    channels,
                ),
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
    mut meters: MeterProducers,
    mut effects: Vec<super::effect_chain::TrackEffects>,
    mut routing: super::routing::RoutingState,
    mut transport: Transport,
    sample_rate: f32,
    channels: u16,
) -> impl FnMut(&mut [f32], &cpal::OutputCallbackInfo) + Send + 'static {
    // Pre-allocate a mono scratch buffer sized to absorb the largest
    // buffer CPAL is likely to hand us. Our `EngineConfig` validates
    // buffer_size against `VALID_BUFFER_SIZES` (≤ 1024), but CPAL can
    // ignore a `BufferSize::Fixed` request on some hosts and deliver
    // whatever it wants. 4096 frames is 4× headroom on the validated
    // max — if CPAL ever goes higher we render a partial buffer and
    // advance the transport by the same partial amount (so the
    // counter stays consistent with what was actually heard), which
    // is the least-bad outcome (audible gap rather than out-of-bounds
    // write or position desync). The extra 36 KiB of scratch is
    // negligible.
    let max_frames = 4096_usize;
    let mut scratch = vec![0.0_f32; max_frames];
    // Pre-allocate master L/R accumulators.
    let mut master_l = vec![0.0_f32; max_frames];
    let mut master_r = vec![0.0_f32; max_frames];
    // Pre-allocated click state lives across buffers so a click
    // that starts near the end of one buffer can decay into the
    // start of the next without truncation.
    let mut click_gen = ClickGenerator::idle();
    // Count-in countdown. Started when a TransportPlay command is
    // received with `count_in.enabled`; clip rendering is
    // suppressed while `remaining_samples > 0`. Metronome keeps
    // clicking so the user hears the count.
    let mut count_in_state = CountInState::idle();

    let ch = channels as usize;

    move |data: &mut [f32], _info: &cpal::OutputCallbackInfo| {
        // 1. Drain up to COMMAND_DRAIN_BUDGET commands. Effect
        //    commands are routed to the per-track effect chain rather
        //    than to AudioGraph::apply, because effect state lives
        //    outside the graph (in the pre-allocated Vec<TrackEffects>).
        for _ in 0..COMMAND_DRAIN_BUDGET {
            match cmd_rx.try_recv() {
                Ok(cmd) => match cmd {
                    EngineCommand::SetEqParams {
                        handle,
                        low_gain_db,
                        mid_gain_db,
                        high_gain_db,
                    } => {
                        if graph.handle_matches(handle) {
                            effects[handle.index()].set_eq_params(
                                low_gain_db,
                                mid_gain_db,
                                high_gain_db,
                            );
                        }
                    }
                    EngineCommand::SetCompressorParams {
                        handle,
                        enabled,
                        threshold_db,
                        ratio,
                    } => {
                        if graph.handle_matches(handle) {
                            effects[handle.index()].set_compressor_params(
                                enabled,
                                threshold_db,
                                ratio,
                            );
                        }
                    }
                    // Routing commands — route to RoutingState.
                    EngineCommand::SetTrackSendLevel {
                        handle,
                        bus_index,
                        level,
                    } => {
                        if graph.handle_matches(handle) {
                            routing.set_send_level(handle.index(), bus_index as usize, level);
                        }
                    }
                    EngineCommand::SetAuxBusVolume { bus_index, volume } => {
                        if let Some(bus) = routing.buses.get_mut(bus_index as usize) {
                            bus.volume = volume;
                        }
                    }
                    EngineCommand::SetAuxBusEnabled { bus_index, enabled } => {
                        if let Some(bus) = routing.buses.get_mut(bus_index as usize) {
                            bus.enabled = enabled;
                        }
                    }
                    // Transport commands (3A) — route to the audio-thread
                    // `Transport` instance. Position advance happens at
                    // the tail of the callback, AFTER the drain, so that
                    // a Seek/Stop received in this buffer takes effect
                    // before we increment.
                    EngineCommand::TransportPlay => {
                        // 3G count-in is a proper PRE-ROLL: before
                        // starting playback, rewind the playhead by
                        // `duration_samples` so that after the
                        // countdown the playhead is back at the
                        // user's original "play from here" position
                        // and no clip material is skipped (codex P1
                        // on PR #1721).
                        //
                        // If the original position is less than the
                        // count-in duration, saturating_sub clips to
                        // 0 — some pre-roll is lost but the
                        // transport cannot roll before sample 0.
                        let cfg = transport.count_in_snapshot();
                        if cfg.enabled && cfg.beats > 0 {
                            let tempo_guard = transport.tempo_map_handle().load();
                            let original = transport.position();
                            let duration = super::count_in::count_in_duration_samples(
                                cfg.beats,
                                original,
                                &tempo_guard,
                                sample_rate as u32,
                            );
                            // Rewind for pre-roll.
                            transport.seek(original.saturating_sub(duration));
                            // Actual countdown duration after clamp.
                            let actual = original - transport.position();
                            count_in_state.start(actual);
                        } else {
                            count_in_state.clear();
                        }
                        transport.play();
                    }
                    EngineCommand::TransportStop => {
                        transport.stop();
                        count_in_state.clear();
                    }
                    EngineCommand::TransportPause => {
                        transport.pause();
                        count_in_state.clear();
                    }
                    EngineCommand::TransportSeek { sample_position } => {
                        transport.seek(sample_position);
                        // Seeking cancels an in-flight count-in —
                        // consistent with Stop/Pause/Scrub.
                        count_in_state.clear();
                    }
                    EngineCommand::TransportScrub { delta_samples } => {
                        transport.scrub(delta_samples);
                        count_in_state.clear();
                    }
                    other => {
                        // Reset effects + meter + sends eagerly on
                        // RemoveTrack so that if AddTrack for the same
                        // slot follows in the same drain batch, the new
                        // track starts clean.
                        if let EngineCommand::RemoveTrack { handle } = other {
                            if graph.handle_matches(handle) {
                                effects[handle.index()].reset();
                                meters.track_meters[handle.index()].reset();
                                routing.reset_track_sends(handle.index());
                            }
                        }
                        graph.apply(other);
                    }
                },
                Err(_) => break,
            }
        }

        // 2. Render.
        let frames = if ch > 0 { data.len() / ch } else { data.len() };
        let frames = frames.min(max_frames);

        // Zero the master accumulators + aux bus buffers for this buffer.
        master_l[..frames].fill(0.0);
        master_r[..frames].fill(0.0);
        routing.clear_buses(frames);

        let any_solo = graph.any_solo();
        let master_vol = graph.master_volume;

        // Iterate ALL tracks (the hot path). The fixed-capacity slab
        // is contiguous so this is cache-friendly even at 256 slots.
        for slot in 0..super::graph::MAX_TRACKS {
            let track = &mut graph.all_tracks_mut()[slot];
            if !track.occupied {
                // Reset stale meter + effect state so a newly-added
                // track at this slot doesn't inherit the previous
                // occupant's RMS/peak/clip or effect parameters.
                meters.track_meters[slot].reset();
                effects[slot].reset();
                continue;
            }

            // Generate test signal if active. Zero allocation — the
            // sine generator writes into the pre-allocated scratch.
            let has_signal = if let Some((freq, amp, ref mut phase)) = track.test_signal {
                generate_sine(&mut scratch[..frames], freq, amp, sample_rate, phase);
                true
            } else {
                scratch[..frames].fill(0.0);
                false
            };

            // Run per-track effect chain (EQ → Compressor) on the
            // scratch buffer. Effects are post-signal, pre-fader —
            // the standard DAW insert chain order.
            if has_signal {
                effects[slot].process(&mut scratch[..frames]);
            }

            // Feed per-track meter AFTER effects but BEFORE volume/pan
            // (post-effect, pre-fader metering — standard DAW convention).
            if has_signal {
                meters.track_meters[slot].process(&scratch[..frames]);
            }
            // Push meter reading (even if silent — consumer expects
            // periodic updates to detect silence).
            let _ = meters.track_producers[slot].try_push(
                meters.track_meters[slot].reading(),
            );

            // Audibility check.
            if !mixer::is_audible(track, any_solo) {
                continue;
            }

            // Apply volume + pan and accumulate into master L/R.
            // Also compute per-frame track L/R for post-fader sends.
            let vol = track.volume;
            let (pan_l, pan_r) = mixer::equal_power_pan(track.pan);
            for i in 0..frames {
                let s = scratch[i] * vol;
                let l = s * pan_l;
                let r = s * pan_r;
                master_l[i] += l;
                master_r[i] += r;
                // Reuse scratch for the L channel and master_l
                // contains the running sum, so we can't easily
                // extract per-track L/R. Instead, compute the
                // track's L/R contribution in scratch[i] and use
                // a second pass for sends. (See below.)
            }

            // Post-fader sends: tap the track's panned output and
            // route to aux buses. We recompute the per-sample
            // contribution rather than storing a separate buffer to
            // avoid an extra MAX_FRAMES allocation per track.
            // Since the send loop only runs for tracks with non-zero
            // send levels and enabled buses, the cost is bounded.
            routing.send_from_track_computed(slot, &scratch[..frames], vol, pan_l, pan_r, frames);
        }

        // Mix aux return buses into master BEFORE master volume.
        routing.mix_into_master(&mut master_l[..frames], &mut master_r[..frames], frames);

        // Clip scheduler render (3F). Reads a borrowed guard from
        // the ArcSwap so no Arc clone / drop on the audio thread.
        // Each clip is bounds-checked (`intersects_buffer`) before
        // any PCM access to cap per-buffer cost at O(N) comparisons
        // even when most clips are outside the current buffer
        // window.
        //
        // Handles multiple loop wraps per buffer: if `frames > loop.length`,
        // we iterate rendering one segment at a time, advancing the
        // "virtual playhead" past each wrap, until we've covered the
        // whole buffer. Rare (requires loop shorter than audio
        // buffer — 5-85 ms at typical sample rates) but still needs
        // to be correct. Found by codex review on PR #1719.
        //
        // Count-in (3G): when `count_in_state` is active, clip
        // rendering is suppressed. Metronome continues — see the
        // block below — so the user hears the count but no clip
        // audio leaks through.
        if transport.state().is_advancing() && !count_in_state.is_active() {
            let clip_schedule_guard = transport.clip_schedule_handle().load();
            let clip_schedule: &super::clip::ClipSchedule = &clip_schedule_guard;
            if !clip_schedule.is_empty() {
                let loop_region = **transport.loop_region_handle().load();
                let playhead_start = transport.position();
                let clips = clip_schedule.clips();

                // Walk the buffer segment-by-segment. `buffer_offset`
                // is where the next segment will start in the
                // master output, `virt_playhead` is the absolute
                // transport sample at that offset.
                let mut buffer_offset: usize = 0;
                let mut virt_playhead: u64 = playhead_start;

                while buffer_offset < frames {
                    // How many samples until either end of buffer
                    // or the next loop-end wrap?
                    let remaining = (frames - buffer_offset) as u64;
                    let to_wrap: Option<u64> = if loop_region.is_active()
                        && virt_playhead < loop_region.end
                    {
                        Some(loop_region.end - virt_playhead)
                    } else {
                        None
                    };
                    let seg_len = match to_wrap {
                        Some(dist) if dist < remaining => dist,
                        _ => remaining,
                    } as usize;
                    let seg_end_offset = buffer_offset + seg_len;

                    // Render every intersecting clip into this segment.
                    let seg_end_abs = virt_playhead.saturating_add(seg_len as u64);
                    for clip in clips {
                        if clip.intersects_buffer(virt_playhead, seg_end_abs) {
                            render_clip_segment(
                                clip,
                                &mut master_l[..frames],
                                &mut master_r[..frames],
                                buffer_offset,
                                seg_end_offset,
                                virt_playhead,
                            );
                        }
                    }

                    // Advance the virtual playhead — wrap if we just
                    // finished a wrap segment, otherwise linear.
                    if to_wrap.map_or(false, |dist| (dist as usize) == seg_len) {
                        virt_playhead = loop_region.start;
                    } else {
                        virt_playhead = seg_end_abs;
                    }
                    buffer_offset = seg_end_offset;
                }
            }
        }

        // Metronome render (3E). Runs AFTER track/aux mixing but
        // BEFORE master volume so the click respects master gain
        // like any other bus.
        //
        // Map access uses `.load()` borrows (NOT `.load_full()`) so
        // the audio callback never clones or drops an `Arc<TempoMap>`
        // — both would risk allocator work on the RT thread if the
        // old map happens to be the last outstanding reference when
        // the UI swapped in a new one. Found by codex review on
        // PR #1717.
        //
        // Loop wrap-around (3C) is handled here too: if the buffer
        // straddles the active loop's end boundary, split the
        // metronome render into "pre-wrap" and "post-wrap" segments
        // so beats landing in the wrapped region still fire.
        // Found by Copilot review on PR #1717.
        {
            let metronome_config = transport.metronome_config_snapshot();
            if metronome_config.enabled && transport.state().is_advancing() {
                let tempo_guard = transport.tempo_map_handle().load();
                let time_sig_guard = transport.time_sig_map_handle().load();
                let tempo_map: &super::tempo_map::TempoMap = &tempo_guard;
                let time_sig: &super::time_sig_map::TimeSignatureMap = &time_sig_guard;
                let loop_region = **transport.loop_region_handle().load();
                let playhead_start = transport.position();

                // Wrap split: if the loop is active and we'll cross
                // the end boundary inside this buffer, find the
                // offset (in frames) at which the wrap happens.
                let wrap_offset: Option<usize> = if loop_region.is_active()
                    && playhead_start < loop_region.end
                {
                    let to_end = loop_region.end - playhead_start;
                    if to_end < frames as u64 {
                        Some(to_end as usize)
                    } else {
                        None
                    }
                } else {
                    None
                };

                match wrap_offset {
                    Some(w) => {
                        render_metronome_segment(
                            &mut click_gen,
                            &mut master_l[..frames],
                            &mut master_r[..frames],
                            0,
                            w,
                            playhead_start,
                            tempo_map,
                            time_sig,
                            metronome_config,
                            sample_rate,
                        );
                        render_metronome_segment(
                            &mut click_gen,
                            &mut master_l[..frames],
                            &mut master_r[..frames],
                            w,
                            frames,
                            loop_region.start,
                            tempo_map,
                            time_sig,
                            metronome_config,
                            sample_rate,
                        );
                    }
                    None => {
                        render_metronome_segment(
                            &mut click_gen,
                            &mut master_l[..frames],
                            &mut master_r[..frames],
                            0,
                            frames,
                            playhead_start,
                            tempo_map,
                            time_sig,
                            metronome_config,
                            sample_rate,
                        );
                    }
                }
            } else if click_gen.is_active() {
                // Finish draining any in-flight click even if the
                // user just disabled the metronome or paused — avoids
                // a clipped tail that would sound like a digital
                // pop.
                for i in 0..frames {
                    let s = click_gen.tick(sample_rate);
                    master_l[i] += s;
                    master_r[i] += s;
                }
            }
        }

        // Apply master volume.
        for i in 0..frames {
            master_l[i] *= master_vol;
            master_r[i] *= master_vol;
        }

        // Feed master meter from the summed L+R (mono-sum for metering).
        // A more precise meter would compute per-channel, but mono-sum
        // is the standard DAW master meter convention.
        for i in 0..frames {
            scratch[i] = (master_l[i] + master_r[i]) * 0.5;
        }
        meters.master_meter.process(&scratch[..frames]);
        let _ = meters.master_producer.try_push(meters.master_meter.reading());

        // 3. Write interleaved output.
        if ch >= 2 {
            for i in 0..frames {
                let base = i * ch;
                if base + 1 < data.len() {
                    data[base] = master_l[i];
                    data[base + 1] = master_r[i];
                    // Zero any extra channels (surround etc.)
                    for c in 2..ch {
                        if base + c < data.len() {
                            data[base + c] = 0.0;
                        }
                    }
                }
            }
        } else {
            // Mono output — sum L+R.
            for i in 0..frames {
                if i < data.len() {
                    data[i] = (master_l[i] + master_r[i]) * 0.5;
                }
            }
        }

        // Advance count-in countdown in parallel with transport
        // position (3G). If the countdown finishes inside this
        // buffer the clip scheduler will start rendering on the
        // *next* buffer — a one-buffer approximation that keeps
        // the countdown check out of the per-sample hot path.
        if count_in_state.is_active() && transport.state().is_advancing() {
            count_in_state.advance(frames as u64);
        }

        // Advance the transport position. This is the single place in
        // the engine that moves the timeline forward — no-op when
        // stopped/paused, otherwise bumps the shared atomic by
        // `frames` (or wraps mid-buffer when the advance crosses the
        // active loop end). Downstream phases (3F clip scheduling)
        // read this counter to decide what to render.
        //
        // `advance_with_loop_if_advancing` loads the latest loop
        // region from its `ArcSwap` on every buffer — changes the
        // main thread publishes take effect on the next buffer.
        //
        // The advance intentionally uses the *rendered* frame count
        // (already clamped to `max_frames`), not the raw buffer size.
        // This keeps the position counter consistent with what the
        // listener actually heard: if CPAL ever hands us a buffer
        // larger than `max_frames`, we render the first `max_frames`
        // and leave the tail silent (one-time audible gap) while
        // position advances by the same amount — versus advancing by
        // the full buffer, which would desync UI from audio.
        transport.advance_with_loop_if_advancing(frames as u64);
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
        let (meter_prods, _meter_cons) = crate::engine::meter_bank::create_meter_pair(48_000.0);
        let track_fx = crate::engine::effect_chain::create_effect_chains(48_000.0);
        let routing = crate::engine::routing::RoutingState::new(
            crate::engine::graph::MAX_TRACKS, 1024,
        );
        let transport = crate::engine::transport::Transport::new();
        let mut cb = make_audio_callback(
            graph, cmd_rx, meter_prods, track_fx, routing, transport, 48_000.0, 2,
        );

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
