//! Pre-allocated meter ring buffers for lock-free audio → main thread
//! meter data transfer.
//!
//! One ring buffer per track slot (MAX_TRACKS) plus one for the master
//! bus. Each buffer holds a small number of [`MeterReading`] snapshots
//! — the main thread only cares about the latest, so older readings
//! are simply overwritten.
//!
//! # Memory cost
//!
//! 257 ring buffers × 8 slots × sizeof(MeterReading) ≈ 257 × 96 B
//! ≈ 24 KiB total. Trivial.

use ringbuf::{
    traits::{Consumer, Producer, Split},
    HeapCons, HeapProd, HeapRb,
};

use super::graph::MAX_TRACKS;
use super::meter::{Meter, MeterReading};

/// Capacity of each per-track / master ring buffer.
/// The audio callback pushes once per buffer (~187 Hz at 256/48k).
/// The UI polls at ~60 Hz. 8 slots gives comfortable headroom —
/// the consumer just reads the latest and skips older entries.
const RING_CAPACITY: usize = 8;

/// Audio-thread half: owns the meters + ring buffer producers.
/// Moved into the CPAL callback closure at engine start.
pub struct MeterProducers {
    pub track_meters: Vec<Meter>,
    pub track_producers: Vec<HeapProd<MeterReading>>,
    pub master_meter: Meter,
    pub master_producer: HeapProd<MeterReading>,
}

/// Main-thread half: owns the ring buffer consumers.
/// Held by `RunningEngine` so Tauri commands can poll meters.
pub struct MeterConsumers {
    pub track_consumers: Vec<HeapCons<MeterReading>>,
    pub master_consumer: HeapCons<MeterReading>,
}

impl MeterConsumers {
    /// Read the latest meter reading for a track slot. Returns the
    /// most recent entry in the ring buffer, discarding older ones.
    /// Returns `MeterReading::default()` (silence) if the buffer is
    /// empty or the slot is out of range.
    pub fn read_track(&mut self, slot: usize) -> MeterReading {
        self.track_consumers
            .get_mut(slot)
            .map(drain_latest)
            .unwrap_or_default()
    }

    /// Read the latest master meter reading.
    pub fn read_master(&mut self) -> MeterReading {
        drain_latest(&mut self.master_consumer)
    }
}

/// Drain the ring buffer and return the last (most recent) entry.
/// If the buffer is empty, returns `MeterReading::default()`.
fn drain_latest(consumer: &mut HeapCons<MeterReading>) -> MeterReading {
    let mut latest = MeterReading::default();
    while let Some(reading) = consumer.try_pop() {
        latest = reading;
    }
    latest
}

/// Create a matched pair of (producers, consumers) pre-allocated for
/// all track slots + master. Called once at engine start on the main
/// thread.
pub fn create_meter_pair(sample_rate: f32) -> (MeterProducers, MeterConsumers) {
    let mut track_meters = Vec::with_capacity(MAX_TRACKS);
    let mut track_producers = Vec::with_capacity(MAX_TRACKS);
    let mut track_consumers = Vec::with_capacity(MAX_TRACKS);

    for _ in 0..MAX_TRACKS {
        let rb = HeapRb::<MeterReading>::new(RING_CAPACITY);
        let (prod, cons) = rb.split();
        track_meters.push(Meter::new(sample_rate));
        track_producers.push(prod);
        track_consumers.push(cons);
    }

    let master_rb = HeapRb::<MeterReading>::new(RING_CAPACITY);
    let (master_prod, master_cons) = master_rb.split();

    (
        MeterProducers {
            track_meters,
            track_producers,
            master_meter: Meter::new(sample_rate),
            master_producer: master_prod,
        },
        MeterConsumers {
            track_consumers,
            master_consumer: master_cons,
        },
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn create_meter_pair_allocates_correct_counts() {
        let (prods, cons) = create_meter_pair(48_000.0);
        assert_eq!(prods.track_meters.len(), MAX_TRACKS);
        assert_eq!(prods.track_producers.len(), MAX_TRACKS);
        assert_eq!(cons.track_consumers.len(), MAX_TRACKS);
    }

    #[test]
    fn ring_buffer_round_trip() {
        let (mut prods, mut cons) = create_meter_pair(48_000.0);
        let reading = MeterReading {
            rms: 0.5,
            peak: 0.8,
            clipped: false,
        };
        // Push to track 0 producer
        prods.track_producers[0].try_push(reading).ok();
        // Read from track 0 consumer
        let got = cons.read_track(0);
        assert_eq!(got.rms, 0.5);
        assert_eq!(got.peak, 0.8);
    }

    #[test]
    fn drain_latest_returns_most_recent() {
        let (mut prods, mut cons) = create_meter_pair(48_000.0);
        for i in 0..5 {
            prods.master_producer
                .try_push(MeterReading {
                    rms: i as f32 * 0.1,
                    peak: 0.0,
                    clipped: false,
                })
                .ok();
        }
        let got = cons.read_master();
        assert_eq!(got.rms, 0.4); // last pushed
    }

    #[test]
    fn empty_buffer_returns_silence() {
        let (_prods, mut cons) = create_meter_pair(48_000.0);
        let got = cons.read_track(0);
        assert_eq!(got, MeterReading::default());
        let got_master = cons.read_master();
        assert_eq!(got_master, MeterReading::default());
    }

    #[test]
    fn out_of_range_slot_returns_silence() {
        let (_prods, mut cons) = create_meter_pair(48_000.0);
        let got = cons.read_track(MAX_TRACKS + 10);
        assert_eq!(got, MeterReading::default());
    }
}
