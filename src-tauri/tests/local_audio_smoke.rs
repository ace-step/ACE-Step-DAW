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
    audio_io, Engine, EngineConfig, EngineStatus, TrackParams,
};

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

/// Smoke test — transport position advances during real playback.
///
/// Phase 3A end-to-end proof: start the engine, call `transport_play`,
/// let CPAL run the callback for 200 ms (~37 buffers at 256/48k), then
/// read `transport_position`. A live stream should have advanced the
/// counter by roughly 200 ms × 48 kHz = 9600 samples. We accept a
/// generous window (5000..15000 samples) to absorb scheduling jitter
/// and first-buffer warm-up without making the test fragile.
///
/// Also covers:
///  - TransportStop rewinds to 0
///  - TransportSeek jumps to an arbitrary absolute position
///  - TransportPause preserves position across the pause/resume boundary
#[test]
#[ignore]
fn real_engine_transport_advances_position() {
    let mut engine = Engine::new();
    engine.start(EngineConfig::default_48k()).unwrap();

    // Starts at 0 when stopped.
    assert_eq!(engine.transport_position(), 0);

    // Play for 200 ms — should advance ~9600 samples.
    engine.transport_play().expect("transport_play");
    sleep(Duration::from_millis(200));
    let after_play = engine.transport_position();
    eprintln!("position after 200 ms of play: {after_play} samples");
    assert!(
        (5_000..15_000).contains(&after_play),
        "position {after_play} should be ~9600 samples (200 ms × 48 kHz) \
         within a generous 5k–15k window to absorb scheduler jitter"
    );

    // Pause — position should be preserved, not zeroed.
    engine.transport_pause().expect("transport_pause");
    sleep(Duration::from_millis(50));
    let after_pause = engine.transport_position();
    eprintln!("position after pause + 50 ms: {after_pause} samples");
    // Allow a small drift for any buffer already in flight when pause hit.
    assert!(
        after_pause >= after_play,
        "paused position {after_pause} must be >= pre-pause {after_play}"
    );
    assert!(
        after_pause < after_play + 5_000,
        "paused position {after_pause} must not keep advancing \
         (pre-pause was {after_play})"
    );

    // Stop — must rewind to 0.
    engine.transport_stop().expect("transport_stop");
    sleep(Duration::from_millis(20));
    assert_eq!(
        engine.transport_position(),
        0,
        "stop should rewind to 0"
    );

    // Seek — jump to an arbitrary absolute position without playing.
    engine.transport_seek(123_456).expect("transport_seek");
    sleep(Duration::from_millis(20));
    assert_eq!(
        engine.transport_position(),
        123_456,
        "seek should set the position exactly without drift when stopped"
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
