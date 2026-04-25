//! Background-thread poller that reads the transport's shared
//! sample-position counter at a fixed interval and invokes a
//! user-supplied callback with the current value.
//!
//! # Why a separate thread?
//!
//! The audio callback already updates the
//! [`super::transport::SharedPosition`] atomically every buffer, so
//! any reader can snapshot it with a single atomic load. Rather than
//! asking the UI to poll the Tauri command for position at 60 Hz
//! (which would serialize through the engine mutex and add IPC
//! latency to every frame), we push the value from a background
//! thread that owns the polling loop.
//!
//! # Real-time safety
//!
//! **This thread is NOT the audio callback.** It is a plain
//! `std::thread`, so it is free to allocate, emit events, log,
//! block on `thread::sleep`, etc. The audio thread is not involved
//! — it only writes the atomic counter; the emitter only reads it.
//!
//! # Typical use
//!
//! The Tauri command layer constructs a `PositionEmitter` whose
//! callback emits a `transport-position` event to the webview, so
//! the UI can animate the playhead without querying the engine on
//! every frame.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread::{self, JoinHandle};
use std::time::Duration;

use super::transport::SharedPosition;

/// Minimum polling interval. Faster than 200 Hz is pointless for a
/// visual playhead and starts costing real CPU (wake-ups, Tauri
/// event serialization).
pub const MIN_INTERVAL: Duration = Duration::from_millis(5);

/// Maximum polling interval. Slower than 1 Hz is effectively a
/// "no emit" state and should be modeled with an explicit stop
/// instead — clamping here ensures a bogus caller config doesn't
/// make the UI look frozen.
pub const MAX_INTERVAL: Duration = Duration::from_secs(1);

/// Default polling interval — 16 ms ≈ 60 Hz, which matches typical
/// browser `requestAnimationFrame` cadence and is smooth for a
/// playhead animation.
pub const DEFAULT_INTERVAL: Duration = Duration::from_millis(16);

/// Background polling thread that repeatedly snapshots a
/// `SharedPosition` and hands the value to a callback.
///
/// Lifecycle: `start` spawns the thread, `stop` (or `Drop`) joins
/// it. `stop` is idempotent.
pub struct PositionEmitter {
    running: Arc<AtomicBool>,
    thread: Option<JoinHandle<()>>,
}

impl PositionEmitter {
    /// Spawn the polling thread. The callback is invoked on every
    /// tick with the current sample position; the thread sleeps
    /// for `interval` between ticks. `interval` is clamped to
    /// `[MIN_INTERVAL, MAX_INTERVAL]` so pathological inputs — in
    /// particular `Duration::ZERO` (would hot-spin) and unbounded
    /// durations like `Duration::MAX` (would make the UI look
    /// frozen) — cannot poison the emitter loop.
    pub fn start<F>(
        shared_position: SharedPosition,
        interval: Duration,
        mut notify: F,
    ) -> Self
    where
        F: FnMut(u64) + Send + 'static,
    {
        let clamped = clamp_interval(interval);
        let running = Arc::new(AtomicBool::new(true));
        let running_clone = running.clone();

        let thread = thread::Builder::new()
            .name("ace-position-emitter".into())
            .spawn(move || {
                // Re-check the flag BEFORE the initial emit so that
                // a caller who does `start()` immediately followed
                // by `stop()` — before the thread's first wake —
                // doesn't see one stale tick. Found by codex review
                // on PR #1715.
                if !running_clone.load(Ordering::Relaxed) {
                    return;
                }
                // Emit once immediately so the UI sees a value on
                // the very first frame, not `clamped` ms later.
                notify(shared_position.get());
                while running_clone.load(Ordering::Relaxed) {
                    thread::sleep(clamped);
                    // Re-check after the sleep in case `stop` was
                    // called during the sleep window — otherwise
                    // we'd fire one extra event after shutdown.
                    if !running_clone.load(Ordering::Relaxed) {
                        break;
                    }
                    notify(shared_position.get());
                }
            })
            .expect("spawn position emitter thread");

        Self {
            running,
            thread: Some(thread),
        }
    }

    /// Stop the thread and wait for it to exit. Idempotent.
    pub fn stop(&mut self) {
        self.running.store(false, Ordering::Relaxed);
        if let Some(t) = self.thread.take() {
            let _ = t.join();
        }
    }

    /// Whether the thread is currently spinning. Returns `false`
    /// after `stop` or if the thread exited on its own (which
    /// should not happen in normal flow).
    pub fn is_running(&self) -> bool {
        self.thread.is_some() && self.running.load(Ordering::Relaxed)
    }
}

impl Drop for PositionEmitter {
    fn drop(&mut self) {
        // Ensure the thread is joined even if the caller forgets
        // to call `stop`. Joining inside `Drop` is important
        // because a leaked thread would keep a clone of the
        // `SharedPosition` alive and continue ticking into a
        // callback whose captured state may have been torn down.
        self.stop();
    }
}

#[inline]
fn clamp_interval(d: Duration) -> Duration {
    if d < MIN_INTERVAL {
        MIN_INTERVAL
    } else if d > MAX_INTERVAL {
        MAX_INTERVAL
    } else {
        d
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Mutex;
    use std::time::Instant;

    /// A test sink that records every position the emitter pushed,
    /// so tests can assert on the sequence without waiting for a
    /// real Tauri event round-trip.
    #[derive(Clone, Default)]
    struct Sink(Arc<Mutex<Vec<u64>>>);
    impl Sink {
        fn len(&self) -> usize {
            self.0.lock().unwrap().len()
        }
        fn values(&self) -> Vec<u64> {
            self.0.lock().unwrap().clone()
        }
    }

    fn make_sink() -> (Sink, impl FnMut(u64) + Send + 'static) {
        let sink = Sink::default();
        let sink_clone = sink.clone();
        let cb = move |pos: u64| {
            sink_clone.0.lock().unwrap().push(pos);
        };
        (sink, cb)
    }

    #[test]
    fn start_immediately_emits_first_sample() {
        // The constructor guarantees the first `notify` fires
        // before the first sleep, so UI sees a value on frame 0.
        let (sink, cb) = make_sink();
        let pos = SharedPosition::new();
        pos.set(42);
        let mut emitter = PositionEmitter::start(pos, Duration::from_millis(50), cb);
        // Wait briefly for the thread to schedule its first tick.
        let deadline = Instant::now() + Duration::from_millis(200);
        while sink.len() < 1 && Instant::now() < deadline {
            thread::sleep(Duration::from_millis(2));
        }
        assert!(sink.len() >= 1, "expected at least one tick");
        assert_eq!(sink.values()[0], 42);
        emitter.stop();
    }

    #[test]
    fn emits_approximately_at_configured_rate() {
        // At 20 ms interval over ~200 ms, expect ~10 ticks (first
        // tick is immediate, then ~9 more). Use a wide window to
        // absorb CI jitter.
        let (sink, cb) = make_sink();
        let pos = SharedPosition::new();
        let mut emitter = PositionEmitter::start(pos.clone(), Duration::from_millis(20), cb);
        thread::sleep(Duration::from_millis(220));
        emitter.stop();
        let n = sink.len();
        assert!(
            (5..=20).contains(&n),
            "expected ~10 ticks over 220 ms at 20 ms interval, got {n}"
        );
    }

    #[test]
    fn callback_sees_live_shared_position_updates() {
        // Changes the main thread makes to SharedPosition must be
        // visible on the next emitter tick.
        let (sink, cb) = make_sink();
        let pos = SharedPosition::new();
        let mut emitter = PositionEmitter::start(pos.clone(), Duration::from_millis(20), cb);
        // Let the first tick land.
        thread::sleep(Duration::from_millis(40));
        pos.set(1234);
        thread::sleep(Duration::from_millis(60));
        emitter.stop();

        let values = sink.values();
        assert!(
            values.iter().any(|&v| v == 1234),
            "emitter should have observed the main-thread update; saw {:?}",
            values
        );
    }

    #[test]
    fn stop_is_idempotent_and_joins_thread() {
        let (_, cb) = make_sink();
        let pos = SharedPosition::new();
        let mut emitter = PositionEmitter::start(pos, Duration::from_millis(50), cb);
        assert!(emitter.is_running());
        emitter.stop();
        assert!(!emitter.is_running());
        // Second stop must be a no-op, not a panic.
        emitter.stop();
    }

    #[test]
    fn drop_stops_thread() {
        let (sink, cb) = make_sink();
        let pos = SharedPosition::new();
        {
            let _emitter = PositionEmitter::start(pos.clone(), Duration::from_millis(10), cb);
            thread::sleep(Duration::from_millis(30));
        } // drop here — thread must join
        let after_drop = sink.len();
        thread::sleep(Duration::from_millis(60));
        assert_eq!(
            sink.len(),
            after_drop,
            "no ticks should land after the emitter is dropped"
        );
    }

    #[test]
    fn interval_clamps_to_min() {
        let (sink, cb) = make_sink();
        let pos = SharedPosition::new();
        // Ask for 0 ms → must be clamped to MIN_INTERVAL.
        let mut emitter = PositionEmitter::start(pos.clone(), Duration::ZERO, cb);
        thread::sleep(Duration::from_millis(100));
        emitter.stop();
        let n = sink.len();
        // At MIN_INTERVAL (5 ms) over 100 ms, ~20 ticks expected;
        // at no clamp, we'd see 20_000+ ticks on a modern machine.
        // A 200-tick ceiling catches the "didn't clamp" regression.
        assert!(
            n < 200,
            "emitter did not clamp interval — {} ticks in 100 ms",
            n
        );
    }

    #[test]
    fn interval_clamps_to_max() {
        let (sink, cb) = make_sink();
        let pos = SharedPosition::new();
        // Ask for 10 s → must be clamped to MAX_INTERVAL (1 s).
        // Initial emit fires immediately, so we still see 1 tick.
        let mut emitter =
            PositionEmitter::start(pos.clone(), Duration::from_secs(10), cb);
        thread::sleep(Duration::from_millis(50));
        emitter.stop();
        // Only the immediate initial tick should have fired in
        // this window — subsequent ticks are deferred to the
        // clamped max-interval wait, which is 1 s away.
        assert_eq!(sink.len(), 1);
    }

    #[test]
    fn clamp_interval_rounds_up_and_down() {
        assert_eq!(clamp_interval(Duration::ZERO), MIN_INTERVAL);
        assert_eq!(clamp_interval(Duration::from_millis(2)), MIN_INTERVAL);
        assert_eq!(clamp_interval(Duration::from_millis(10)), Duration::from_millis(10));
        assert_eq!(clamp_interval(Duration::from_secs(5)), MAX_INTERVAL);
        // Right at the boundaries: preserve exactly.
        assert_eq!(clamp_interval(MIN_INTERVAL), MIN_INTERVAL);
        assert_eq!(clamp_interval(MAX_INTERVAL), MAX_INTERVAL);
    }

    #[test]
    fn stop_immediately_after_start_fires_no_ticks() {
        // Codex P2 regression (PR #1715): the constructor spawns a
        // thread that emits immediately before checking the running
        // flag. If a caller does `start(...)` then `stop()` before
        // the thread's first wake, the flag check must suppress the
        // initial emit too — not just subsequent loop iterations.
        let (sink, cb) = make_sink();
        let pos = SharedPosition::new();
        pos.set(99);
        let mut emitter = PositionEmitter::start(pos, Duration::from_millis(50), cb);
        // Stop *immediately*. On a fast machine the thread may not
        // have even been scheduled yet; the flag flip + join must
        // still prevent the stale tick.
        emitter.stop();
        // Give the thread a generous window to (incorrectly) tick
        // if it were going to.
        thread::sleep(Duration::from_millis(50));
        assert_eq!(
            sink.len(),
            0,
            "emitter fired {} stale ticks after an immediate stop",
            sink.len()
        );
    }

    #[test]
    fn defaults_are_sensible() {
        assert!(DEFAULT_INTERVAL >= MIN_INTERVAL);
        assert!(DEFAULT_INTERVAL <= MAX_INTERVAL);
        // 60 fps target → between 14 and 18 ms is defensible.
        assert!(DEFAULT_INTERVAL >= Duration::from_millis(14));
        assert!(DEFAULT_INTERVAL <= Duration::from_millis(20));
    }
}
