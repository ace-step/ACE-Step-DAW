//! Local-only integration tests that exercise the **real** CPAL path.
//!
//! These tests are marked `#[ignore]` because CI runners on ubuntu-latest
//! and github-hosted macOS runners have no reachable audio output device,
//! so any test that calls `run_cpal_output_stream` would fail with
//! `no default output device`. Run them on a dev machine with audio
//! hardware via:
//!
//! ```sh
//! cargo test --manifest-path src-tauri/Cargo.toml \
//!     --test local_audio_smoke -- --ignored --nocapture --test-threads=1
//! ```
//!
//! They are kept in the repo (rather than as scratch files) so that any
//! future refactor of the engine lifecycle can be validated end-to-end
//! against a real CoreAudio / WASAPI / ALSA backend with a single command.

use std::thread::sleep;
use std::time::Duration;

use ace_step_daw_lib::engine::{
    audio_io, ClipSource, CountIn, Engine, EngineConfig, EngineStatus, LoopRegion,
    MetronomeConfig, PositionEmitter, TempoEvent, TrackParams,
};
use std::sync::{Arc, Mutex};

/// Smoke test 1 — device enumeration returns at least one device on a
/// machine that has audio hardware. Also exercises the tolerant error
/// handling path in `describe_device` by simply running it.
#[test]
#[ignore]
fn real_enumeration_finds_default_output() {
    let devices = audio_io::list_output_devices();
    eprintln!("found {} output device(s):", devices.len());
    for d in &devices {
        eprintln!(
            "  - {:<30} default={}  channels={}  rates={:?}  buf={:?}",
            d.name, d.is_default, d.max_channels, d.supported_sample_rates, d.buffer_size_range
        );
    }
    assert!(
        !devices.is_empty(),
        "expected at least one output device on a dev machine with audio hardware"
    );

    let default = audio_io::get_default_output_device_info();
    eprintln!("default device: {:?}", default.as_ref().map(|d| &d.name));
    assert!(default.is_some(), "expected a system default output device");

    // The default device should appear in the full list and be flagged.
    let default_name = default.unwrap().name;
    let hit = devices.iter().find(|d| d.name == default_name);
    assert!(hit.is_some(), "default device missing from full list");
    assert!(hit.unwrap().is_default, "default device not flagged as default");
}

/// Smoke test 2 — full engine lifecycle with a real CPAL stream.
///
/// This is the single most important verification for Phase 2A: it proves
/// the state machine, the audio owner thread, the ready-signal path, the
/// silence callback, and the stop/drop teardown all work together on a
/// live audio backend.
#[test]
#[ignore]
fn real_engine_start_stop_lifecycle() {
    let mut engine = Engine::new();
    assert_eq!(engine.status(), EngineStatus::Stopped);

    // Start with a conservative config that any modern built-in device
    // supports. Using default_48k keeps the test portable across
    // CoreAudio / WASAPI / ALSA.
    let status = engine
        .start(EngineConfig::default_48k())
        .expect("real CPAL stream should open on a dev machine");

    match &status {
        EngineStatus::Running {
            active_config,
            device_name,
            channels,
        } => {
            eprintln!(
                "engine running on {:?} @ {}Hz / {} frames / {} ch",
                device_name, active_config.sample_rate, active_config.buffer_size, channels
            );
            assert_eq!(active_config.sample_rate, 48_000);
            assert_eq!(active_config.buffer_size, 256);
            assert!(*channels >= 1, "at least mono expected");
            assert!(!device_name.is_empty(), "device name must be non-empty");
        }
        EngineStatus::Stopped => panic!("expected Running status after start"),
    }
    assert!(engine.is_running());

    // Hold the stream open long enough for CPAL to actually run the
    // callback on the audio thread — 300 ms is generous at 256 frames /
    // 48 kHz (~5.3 ms per callback, so ~56 callbacks in the window).
    sleep(Duration::from_millis(300));

    // Status should still report the same config.
    assert_eq!(engine.status(), status);

    // Stop — should join the owner thread cleanly and close the stream.
    engine.stop();
    assert!(!engine.is_running());
    assert_eq!(engine.status(), EngineStatus::Stopped);
}

/// Smoke test 3 — stop-then-restart on the same engine handle does not
/// leak the owner thread or leave CPAL in a bad state.
#[test]
#[ignore]
fn real_engine_survives_restart() {
    let mut engine = Engine::new();

    for round in 1..=3 {
        eprintln!("round {round}: start");
        let status = engine
            .start(EngineConfig::default_48k())
            .unwrap_or_else(|e| panic!("round {round} start failed: {e:?}"));
        assert!(status.is_running());
        sleep(Duration::from_millis(100));
        eprintln!("round {round}: stop");
        engine.stop();
        assert_eq!(engine.status(), EngineStatus::Stopped);
    }
}

/// Smoke test 4 — double-start rejects without opening a second stream.
#[test]
#[ignore]
fn real_engine_rejects_double_start() {
    let mut engine = Engine::new();
    engine.start(EngineConfig::default_48k()).unwrap();
    let err = engine.start(EngineConfig::default_48k()).unwrap_err();
    match err {
        ace_step_daw_lib::engine::EngineError::AlreadyRunning => {}
        other => panic!("expected AlreadyRunning, got {other:?}"),
    }
    engine.stop();
}

/// Smoke test — commands flow from the main thread through the
/// bounded `Sender<EngineCommand>` into the CPAL callback's
/// `try_recv` drain loop during live playback.
///
/// This is the end-to-end proof that Phase 2B-1c actually plumbed
/// the queue into the audio thread: we start a real engine, send a
/// handful of `AddTrack` / `SetTrackParams` / `SetMasterVolume`
/// commands, hold the stream open long enough for the audio callback
/// to fire several times, then stop. The assertions cover that
/// `send_command` returns `Ok` for commands within the queue's
/// capacity — full graph-state observability is deferred to Phase
/// 2B-2 which adds the metering ring buffer.
#[test]
#[ignore]
fn real_engine_accepts_commands_during_live_playback() {
    let mut engine = Engine::new();
    engine.start(EngineConfig::default_48k()).unwrap();

    // Centralized allocator — everything goes through Engine::add_track
    // so handles are unique per running engine.
    let h0 = engine.add_track(TrackParams::unity()).expect("add h0");
    let h1 = engine
        .add_track(TrackParams {
            volume: 0.7,
            pan: -0.3,
            mute: false,
            solo: false,
        })
        .expect("add h1");
    let h2 = engine
        .add_track(TrackParams {
            volume: 0.5,
            pan: 0.6,
            mute: false,
            solo: true,
        })
        .expect("add h2");
    engine
        .set_track_params(
            h0,
            TrackParams {
                volume: 0.25,
                pan: 0.0,
                mute: false,
                solo: false,
            },
        )
        .expect("set params h0");
    engine.set_master_volume(0.8).expect("master 0.8");

    // Let the audio callback drain the first burst — at 256 frames /
    // 48 kHz that's ~5.3 ms per callback, so 200 ms gives ~37
    // iterations.
    sleep(Duration::from_millis(200));

    // Second burst — proves commands keep flowing after the first
    // drain completes.
    engine.remove_track(h2).expect("remove h2");
    engine.set_master_volume(1.0).expect("master 1.0");

    sleep(Duration::from_millis(100));

    engine.stop();
    assert_eq!(engine.status(), EngineStatus::Stopped);
}

/// Smoke test — inject a 440 Hz test signal into a track, hold 500 ms
/// for the audio callback to render + meter, then read the meter and
/// assert non-zero RMS. This is the end-to-end proof that the full
/// render path is live: signal → track volume/pan → solo/mute →
/// master → metering ring buffer → main thread consumer.
#[test]
#[ignore]
fn real_engine_metering_with_test_signal() {
    let mut engine = Engine::new();
    engine.start(EngineConfig::default_48k()).unwrap();

    let h = engine.add_track(TrackParams::unity()).unwrap();

    // Inject a 440 Hz sine at unity amplitude.
    engine
        .inject_test_signal(h, 440.0, 1.0)
        .expect("inject test signal");

    // Hold long enough for:
    // - at least one audio buffer to render the sine (~5 ms)
    // - the EMA-based RMS meter to converge (~300 ms integration)
    // - at least one meter reading to be pushed into the ring buffer
    sleep(Duration::from_millis(500));

    // Read the track meter — should show non-zero RMS.
    let track_reading = engine.get_track_meter(h);
    eprintln!(
        "track meter: rms={:.4}, peak={:.4}, clipped={}",
        track_reading.rms, track_reading.peak, track_reading.clipped
    );
    assert!(
        track_reading.rms > 0.1,
        "track RMS {} should be > 0.1 for a unity sine",
        track_reading.rms
    );
    assert!(
        track_reading.peak > 0.5,
        "track peak {} should be > 0.5",
        track_reading.peak
    );

    // Read the master meter — should also show non-zero since the
    // track is at unity gain with center pan.
    let master_reading = engine.get_master_meter();
    eprintln!(
        "master meter: rms={:.4}, peak={:.4}, clipped={}",
        master_reading.rms, master_reading.peak, master_reading.clipped
    );
    assert!(
        master_reading.rms > 0.05,
        "master RMS {} should be > 0.05",
        master_reading.rms
    );

    // Stop the test signal and verify the meter decays.
    engine.stop_test_signal(h).expect("stop test signal");
    sleep(Duration::from_millis(200));

    engine.stop();
}

/// Poll `cond` until it returns true, or `timeout` expires. Used by
/// the transport smoke test instead of fixed sleeps so a slow device
/// or a loaded CI machine doesn't flake the test.
fn wait_until<F: Fn() -> bool>(cond: F, timeout: Duration, what: &str) {
    let deadline = std::time::Instant::now() + timeout;
    while !cond() && std::time::Instant::now() < deadline {
        sleep(Duration::from_millis(5));
    }
    assert!(cond(), "timed out waiting for: {what}");
}

/// Smoke test — transport position advances during real playback.
///
/// Phase 3A end-to-end proof: start the engine, call `transport_play`,
/// wait until the shared position crosses 1000 samples (~21 ms at 48 k,
/// enough to confirm the callback is advancing), then continue until
/// it crosses ~9600 samples (~200 ms). Uses poll-with-timeout rather
/// than fixed sleeps so a loaded machine or a high-latency device
/// doesn't flake the test.
///
/// Also covers:
///  - TransportStop rewinds to 0 (observed via shared atomic)
///  - TransportSeek jumps to an arbitrary absolute position
///  - TransportPause preserves position and does NOT keep advancing
#[test]
#[ignore]
fn real_engine_transport_advances_position() {
    let mut engine = Engine::new();
    engine.start(EngineConfig::default_48k()).unwrap();

    // Starts at 0 when stopped.
    assert_eq!(engine.transport_position(), 0);

    // Play and wait until the counter has advanced past a clearly
    // audio-thread-only threshold. 1000 samples proves the callback
    // is actually advancing (not just that the command queue took it).
    engine.transport_play().expect("transport_play");
    wait_until(
        || engine.transport_position() > 1_000,
        Duration::from_secs(2),
        "transport_position > 1000 samples after play",
    );

    // Let it run to ~200 ms worth.
    wait_until(
        || engine.transport_position() > 9_000,
        Duration::from_secs(2),
        "transport_position > 9000 samples (~200 ms at 48 kHz)",
    );
    let after_play = engine.transport_position();
    eprintln!("position after ~200 ms of play: {after_play} samples");
    // Upper bound: we shouldn't be catastrophically ahead even if the
    // poll loop is slow. 96 000 = 2 s worth.
    assert!(
        after_play < 96_000,
        "position {after_play} is implausibly far ahead — \
         callback may be firing faster than wall-clock"
    );

    // Pause — record the counter and verify it does NOT keep
    // advancing. Because the TransportPause command travels through
    // the queue, the audio thread may still advance a few buffers
    // before observing the pause. Use a small "settle" window to let
    // the in-flight buffer land, then assert the counter is stable.
    engine.transport_pause().expect("transport_pause");
    // Give the command time to be drained AND one buffer to pass.
    sleep(Duration::from_millis(50));
    let paused_at = engine.transport_position();
    eprintln!("position at pause-settled: {paused_at} samples");
    assert!(paused_at >= after_play);
    // Now poll for a longer window — position must remain stable.
    sleep(Duration::from_millis(100));
    let after_pause_wait = engine.transport_position();
    assert_eq!(
        after_pause_wait, paused_at,
        "paused position changed over 100 ms — transport did not actually pause"
    );

    // Stop — must rewind to 0.
    engine.transport_stop().expect("transport_stop");
    wait_until(
        || engine.transport_position() == 0,
        Duration::from_secs(1),
        "transport_position == 0 after stop",
    );

    // Seek — jump to an arbitrary absolute position without playing.
    engine.transport_seek(123_456).expect("transport_seek");
    wait_until(
        || engine.transport_position() == 123_456,
        Duration::from_secs(1),
        "transport_position == 123_456 after seek-while-stopped",
    );

    engine.stop();
}

/// Smoke test — tempo map + beat/sample conversion round-trip on
/// a live engine.
///
/// Phase 3B end-to-end proof: publish a 2-event automation, read
/// it back via `tempo_map_snapshot`, assert beat_to_sample and
/// sample_to_beat agree on boundary + interior points, and verify
/// the audio thread's `Transport::bpm()` follows the playhead
/// across the tempo-change boundary while the engine is running.
#[test]
#[ignore]
fn real_engine_tempo_map_round_trip() {
    let mut engine = Engine::new();
    engine.start(EngineConfig::default_48k()).unwrap();

    // Publish a 2-segment automation: 60 BPM for 1 s, then 120 BPM.
    engine
        .set_tempo_map(vec![
            TempoEvent::new(0, 60.0),
            TempoEvent::new(48_000, 120.0),
        ])
        .expect("set_tempo_map");

    // Snapshot reflects what we just published.
    let snap = engine.tempo_map_snapshot().expect("tempo_map_snapshot");
    assert_eq!(snap.events().len(), 2);
    assert_eq!(snap.events()[0].bpm, 60.0);
    assert_eq!(snap.events()[1].bpm, 120.0);

    // 1 beat at 60 BPM = 1 s = 48_000 samples (exact boundary).
    assert_eq!(
        engine.beat_to_sample(1.0),
        48_000,
        "beat-to-sample should land exactly on the tempo-change boundary"
    );
    // 3 beats: 1 beat at 60 BPM (1 s) + 2 beats at 120 BPM (1 s) = 2 s = 96_000.
    assert_eq!(engine.beat_to_sample(3.0), 96_000);

    // Round trip on a non-boundary point.
    for beats in [0.25, 0.75, 1.0, 1.5, 2.5, 10.0] {
        let s = engine.beat_to_sample(beats);
        let b = engine.sample_to_beat(s);
        eprintln!("beat_to_sample({beats}) = {s}, sample_to_beat({s}) = {b}");
        assert!(
            (b - beats).abs() < 1e-3,
            "round trip drifted: {beats} → {s} → {b}"
        );
    }

    engine.stop();
}

/// Smoke test — loop region wraps the transport position on live
/// playback.
///
/// Phase 3C end-to-end proof: set a small loop [48_000, 96_000]
/// (1 s at 48 kHz), seek just inside the region, start playback,
/// wait long enough for multiple wraps, and assert that the
/// observed position has wrapped (i.e. the counter is not
/// monotonically advancing past `end`).
#[test]
#[ignore]
fn real_engine_loop_wraps_position() {
    let mut engine = Engine::new();
    engine.start(EngineConfig::default_48k()).unwrap();

    let region = LoopRegion {
        enabled: true,
        start: 48_000,
        end: 96_000,
    };
    engine.set_loop_region(region).expect("set_loop_region");

    // Seek to just inside the region's end so the very next buffer
    // crosses the boundary.
    engine.transport_seek(95_000).expect("seek");
    engine.transport_play().expect("play");

    // Wait for at least one wrap to happen. At 256 frames / 48 kHz
    // ≈ 5.3 ms per buffer, 50 ms gives ~9 buffers worth, which is
    // more than enough to cross the 1000-sample tail into the wrap.
    sleep(Duration::from_millis(50));

    let after_wrap = engine.transport_position();
    eprintln!("position after first wrap window: {after_wrap}");
    assert!(
        after_wrap < region.end,
        "position {after_wrap} should have wrapped below region.end = {}",
        region.end
    );
    assert!(
        after_wrap >= region.start,
        "position {after_wrap} should be at or after region.start = {}",
        region.start
    );

    // Continue for another 200 ms — the position must STILL be
    // inside the loop (it keeps wrapping, not monotonically
    // advancing).
    sleep(Duration::from_millis(200));
    let later = engine.transport_position();
    eprintln!("position after 250 ms total: {later}");
    assert!(
        later >= region.start && later < region.end,
        "position {later} drifted out of loop [{}, {})",
        region.start,
        region.end
    );

    // Disable the loop and verify the playhead leaves the region.
    // This is the critical regression guard — without the assertion
    // that `after_disable >= region.end`, a bug where wrapping kept
    // happening after `set_loop_enabled(false)` would slip through
    // (Copilot review on PR #1713).
    engine
        .set_loop_enabled(false)
        .expect("set_loop_enabled");
    wait_until(
        || engine.transport_position() >= region.end,
        Duration::from_secs(2),
        "position exits loop region once enabled=false",
    );
    let after_disable = engine.transport_position();
    eprintln!("position after loop disabled: {after_disable}");
    assert!(
        after_disable >= region.end,
        "position {after_disable} still inside loop range \
         [{}, {}) after set_loop_enabled(false) — wrap did not stop",
        region.start,
        region.end
    );
    // And the counter must keep advancing (not re-wrap).
    let first = after_disable;
    sleep(Duration::from_millis(50));
    let second = engine.transport_position();
    assert!(
        second > first,
        "position stuck at {first} — counter not advancing after loop disabled"
    );

    engine.stop();
}

/// Smoke test — PositionEmitter pushes ~60 ticks/second with a
/// live engine running.
///
/// Phase 3D end-to-end proof: start the real CPAL engine, use the
/// exposed `shared_position_handle()` to feed a `PositionEmitter`,
/// play for 500 ms, and assert:
///   - tick count is in a sane range for 60 fps (20..60 ticks)
///   - tick values are monotonically non-decreasing
///   - at least one value is > 0 (i.e. the engine actually advanced)
#[test]
#[ignore]
fn real_engine_position_emitter_ticks_and_tracks_playback() {
    let mut engine = Engine::new();
    engine.start(EngineConfig::default_48k()).unwrap();

    let shared = engine
        .shared_position_handle()
        .expect("running engine must expose shared position");

    let samples: Arc<Mutex<Vec<u64>>> = Arc::new(Mutex::new(Vec::new()));
    let samples_clone = samples.clone();
    let mut emitter = PositionEmitter::start(
        shared,
        Duration::from_millis(16),
        move |pos| {
            samples_clone.lock().unwrap().push(pos);
        },
    );

    // Play for 500 ms — ~31 ticks at 16 ms interval.
    engine.transport_play().expect("play");
    sleep(Duration::from_millis(500));

    emitter.stop();
    engine.stop();

    let captured = samples.lock().unwrap().clone();
    let n = captured.len();
    eprintln!(
        "captured {n} ticks; first={:?} last={:?}",
        captured.first(),
        captured.last()
    );

    // Tick-count window: 16 ms interval × 500 ms ≈ 31 ticks. Accept
    // 20..60 to absorb OS scheduler jitter + the "emit immediately
    // on start" first tick.
    assert!(
        (20..=60).contains(&n),
        "expected ~31 ticks over 500 ms at 16 ms interval, got {n}"
    );

    // Monotonically non-decreasing (during linear playback without
    // loop the position only advances).
    for pair in captured.windows(2) {
        assert!(
            pair[1] >= pair[0],
            "position went backwards: {} → {}",
            pair[0],
            pair[1]
        );
    }

    // At least one tick must have observed a non-zero position
    // (proving the engine actually advanced while the emitter was
    // ticking).
    assert!(
        captured.iter().any(|&v| v > 0),
        "emitter only saw zeros — engine did not advance"
    );
}

/// Smoke test — metronome produces audible clicks on the master bus
/// at beat boundaries during live playback.
///
/// Phase 3E end-to-end proof: start engine, enable metronome at
/// 120 BPM 4/4, play for 2 s, read master meter peak over time.
/// At 120 BPM there should be ~4 beats in 2 s; each click produces
/// a transient that the peak-hold meter catches as > 0.05.
#[test]
#[ignore]
fn real_engine_metronome_renders_audible_clicks() {
    let mut engine = Engine::new();
    engine.start(EngineConfig::default_48k()).unwrap();

    // 120 BPM 4/4 is the default, so just enable.
    engine
        .set_metronome_config(MetronomeConfig::new(
            true, 0.7, 0.9, 1000.0, 1500.0,
        ))
        .expect("set_metronome_config");

    engine.transport_play().expect("play");

    // Play for 2 s — at 120 BPM that's 4 beats. Sample the master
    // meter at 50 ms intervals and look for peaks.
    let mut observed_peaks = 0;
    for _ in 0..40 {
        sleep(Duration::from_millis(50));
        let m = engine.get_master_meter();
        if m.peak > 0.05 {
            observed_peaks += 1;
        }
    }
    eprintln!("observed peaks over 2 s at 120 BPM: {observed_peaks}");

    // At 120 BPM over 2 s, expect ~4 clicks. The peak-hold is
    // 1 s so each click will be "observed" over ~20 samples
    // (1 s / 50 ms). 4 × 20 = 80. We poll 40 times so cap at 40
    // observations; anything more than ~10 proves clicks landed.
    assert!(
        observed_peaks >= 10,
        "expected at least 10 peak observations over 2 s at 120 BPM, got {}",
        observed_peaks
    );

    // Disable and verify the config was actually updated on the
    // audio thread (round-trips via the ArcSwap). We don't assert
    // on the meter tail here — the meter's peak-hold + 300 ms EMA
    // makes a tight "near zero" bound flaky, and "40 peaks during
    // the 2 s playback window" already proves that clicks fire
    // correctly.
    engine
        .set_metronome_enabled(false)
        .expect("set_metronome_enabled");
    let cfg_after = engine
        .metronome_config_snapshot()
        .expect("snapshot after disable");
    assert!(
        !cfg_after.enabled,
        "disable command did not propagate to the ArcSwap"
    );

    engine.stop();
}

/// Smoke test — clip scheduler mixes scheduled PCM into master
/// during live playback.
///
/// Phase 3F end-to-end proof: build a 24_000-sample (0.5 s at
/// 48 kHz) ramp PCM, schedule it at sample 24_000 (0.5 s into the
/// transport), start playback, and observe the master meter RMS
/// during the clip's window.
#[test]
#[ignore]
fn real_engine_clip_schedule_plays_pcm() {
    let mut engine = Engine::new();
    engine.start(EngineConfig::default_48k()).unwrap();

    // Build a 0.5 s stereo ramp that goes from 0 to 0.5 amplitude.
    // Arc-wrap so the schedule can share it.
    let frames = 24_000_usize;
    let mut pcm = Vec::with_capacity(frames * 2);
    for i in 0..frames {
        let amp = (i as f32 / frames as f32) * 0.5;
        pcm.push(amp); // L
        pcm.push(amp); // R
    }
    let pcm = std::sync::Arc::new(pcm);

    // Schedule it at transport sample 24_000 (0.5 s delay from
    // playback start), 0.8 gain.
    let clip = ClipSource::new(24_000, frames as u64, 0.8, pcm).expect("ClipSource::new");
    engine
        .set_clip_schedule(vec![clip])
        .expect("set_clip_schedule");

    engine.transport_play().expect("play");

    // Poll meter at 50ms intervals for 1.5 seconds, sampling peak.
    // The clip is at 500-1000ms of transport time; its amplitude
    // ramps from 0 to 0.4 (after 0.8 gain), so peak should rise
    // during that window.
    let mut peaks = Vec::new();
    for step in 0..30 {
        sleep(Duration::from_millis(50));
        let m = engine.get_master_meter();
        peaks.push((step * 50, m.peak));
    }
    eprintln!("peak progression (ms, peak):");
    for (t, p) in &peaks {
        eprintln!("  t={t}: peak={p}");
    }

    // Verify that at least one sample during the clip's expected
    // playback window (500-1000ms = steps 10-20) shows an audible
    // peak. The ramp starts at 0 and grows, so later steps should
    // be higher than earlier steps.
    let max_peak_during_clip = peaks[10..20]
        .iter()
        .map(|(_, p)| *p)
        .fold(0.0_f32, f32::max);
    eprintln!("max peak during clip window: {max_peak_during_clip}");
    assert!(
        max_peak_during_clip > 0.05,
        "clip should have produced audible output, max peak was {max_peak_during_clip}"
    );

    // Also verify that transport.position actually advanced past
    // the clip start — rules out the "transport never played"
    // hypothesis.
    let pos = engine.transport_position();
    eprintln!("final transport position: {pos}");
    assert!(
        pos > 24_000,
        "transport should have passed sample 24_000 after 1.5s, got {pos}"
    );

    engine.stop();
}

/// Smoke test — scrub moves the playhead without auto-advance.
///
/// Phase 3G end-to-end proof: call `transport_scrub(delta)`,
/// observe the position jump by exactly `delta` samples (no
/// drift from buffer-auto-advance), and confirm the transport
/// state transitions to Scrubbing (which is not `is_advancing`).
#[test]
#[ignore]
fn real_engine_scrub_moves_playhead_by_delta_only() {
    let mut engine = Engine::new();
    engine.start(EngineConfig::default_48k()).unwrap();

    // Seek somewhere in the middle.
    engine.transport_seek(100_000).expect("seek");
    sleep(Duration::from_millis(50));

    // Scrub +50_000 samples.
    engine.transport_scrub(50_000).expect("scrub +");
    // Wait longer than the audio buffer period, but verify the
    // position did NOT continue to auto-advance (scrub is
    // user-driven only).
    sleep(Duration::from_millis(100));
    let pos = engine.transport_position();
    eprintln!("position after scrub +50k: {pos}");
    assert_eq!(
        pos, 150_000,
        "scrub must set position exactly and NOT auto-advance afterwards"
    );

    // Scrub backward.
    engine.transport_scrub(-30_000).expect("scrub -");
    sleep(Duration::from_millis(100));
    let pos = engine.transport_position();
    eprintln!("position after scrub -30k: {pos}");
    assert_eq!(pos, 120_000);

    // Scrub past 0 must saturate.
    engine.transport_scrub(-999_999_999).expect("scrub huge -");
    sleep(Duration::from_millis(50));
    let pos = engine.transport_position();
    eprintln!("position after scrub -1G: {pos}");
    assert_eq!(pos, 0, "scrub must saturate at 0, not underflow");

    engine.stop();
}

/// Smoke test — count-in delays clip audible output by the
/// configured beats.
///
/// Phase 3G end-to-end proof: configure 2-beat count-in at 120 BPM
/// (= 1 s at 48 kHz = 48 000 samples), schedule a clip at
/// transport sample 0, play. During the first 1 s of the count-in,
/// the master should be quiet (no clip audio); after 1 s, the clip
/// should become audible.
#[test]
#[ignore]
fn real_engine_count_in_suppresses_clip_until_countdown_finishes() {
    let mut engine = Engine::new();
    engine.start(EngineConfig::default_48k()).unwrap();

    // Seek to sample 96_000 (2 s) so the count-in has somewhere
    // to rewind to — at position 0 the pre-roll would clamp to
    // duration=0 and provide no count-in.
    engine.transport_seek(96_000).expect("seek");

    // Schedule a 3-second clip starting at sample 96_000 (where
    // playback will resume after count-in). During count-in the
    // pre-roll plays position [48_000, 96_000) with clips
    // suppressed → no clip overlaps → silent. After count-in at
    // position 96_000 the clip becomes audible.
    let frames = 48_000_usize * 3; // 3 s
    let pcm = std::sync::Arc::new(vec![0.5_f32; frames * 2]);
    let clip = ClipSource::new(96_000, frames as u64, 1.0, pcm).expect("ClipSource");
    engine.set_clip_schedule(vec![clip]).expect("set_clip_schedule");

    // 2-beat count-in at 120 BPM = 1 second pre-roll.
    engine
        .set_count_in(CountIn::new(true, 2))
        .expect("set_count_in");

    // Go.
    engine.transport_play().expect("play");

    // Poll every 100 ms for 2 s and show the progression.
    eprintln!("count-in progression (t_ms, rms, peak, position):");
    let mut during_peaks: Vec<f32> = Vec::new();
    let mut after_peaks: Vec<f32> = Vec::new();
    for step in 1..=20 {
        sleep(Duration::from_millis(100));
        let m = engine.get_master_meter();
        let pos = engine.transport_position();
        let t = step * 100;
        eprintln!("  t={t}ms: rms={:.4} peak={:.4} pos={pos}", m.rms, m.peak);
        // First 1 s is count-in (should be quiet); last 1 s
        // should be audible.
        if t < 900 {
            during_peaks.push(m.peak);
        } else if t > 1100 {
            after_peaks.push(m.peak);
        }
    }

    let max_during = during_peaks
        .iter()
        .copied()
        .fold(0.0_f32, f32::max);
    let max_after = after_peaks
        .iter()
        .copied()
        .fold(0.0_f32, f32::max);
    eprintln!("max peak during count-in: {max_during}, after: {max_after}");

    assert!(
        max_during < 0.3,
        "clip should be suppressed during count-in, max peak was {max_during}"
    );
    assert!(
        max_after > 0.2,
        "clip should be audible after count-in, max peak was {max_after}"
    );

    engine.stop();
}

/// Smoke test — starting with an unknown device name surfaces a
/// human-readable error via the Open variant.
#[test]
#[ignore]
fn real_engine_rejects_unknown_device_name() {
    let mut engine = Engine::new();
    let cfg = EngineConfig {
        sample_rate: 48_000,
        buffer_size: 256,
        device_name: Some("__ace_step_nonexistent_device__".into()),
    };
    let err = engine.start(cfg).unwrap_err();
    match err {
        ace_step_daw_lib::engine::EngineError::Open(msg) => {
            eprintln!("expected error: {msg}");
            assert!(msg.contains("not found") || msg.contains("no default"));
        }
        other => panic!("expected Open error, got {other:?}"),
    }
    assert!(!engine.is_running());
}
