//! Aux send/return routing for the processing graph.
//!
//! Each track can send a configurable amount of its post-fader signal
//! to up to [`MAX_AUX_BUSES`] return buses. Return buses accumulate
//! contributions from all sending tracks, apply their own volume, and
//! are mixed into the master output alongside regular tracks.
//!
//! # Topology
//!
//! Post-fader sends: the send taps AFTER volume/pan (matching
//! Ableton and Logic default). Pre-fader sends can be added later as
//! a per-send flag without changing the data structures.
//!
//! # Memory
//!
//! All buffers are pre-allocated at engine start. At 8 buses × 1024
//! frames × 2 channels × 4 bytes ≈ 64 KiB. Trivial.

/// Maximum number of aux send/return buses.
pub const MAX_AUX_BUSES: usize = 8;

/// Per-track send levels to each aux bus. Index by bus_index.
/// 0.0 = no send, 1.0 = unity send.
#[derive(Debug, Clone, Copy)]
pub struct TrackSends {
    pub levels: [f32; MAX_AUX_BUSES],
}

impl Default for TrackSends {
    fn default() -> Self {
        Self {
            levels: [0.0; MAX_AUX_BUSES],
        }
    }
}

/// A single aux return bus.
pub struct AuxBus {
    pub enabled: bool,
    pub volume: f32,
    /// Pre-allocated stereo accumulation buffers. Zeroed at the start
    /// of each audio callback, then tracks add their contributions.
    pub buf_l: Vec<f32>,
    pub buf_r: Vec<f32>,
}

impl AuxBus {
    fn new(max_frames: usize) -> Self {
        Self {
            enabled: false,
            volume: 1.0,
            buf_l: vec![0.0; max_frames],
            buf_r: vec![0.0; max_frames],
        }
    }

    /// Zero the accumulation buffers for a new callback.
    pub fn clear(&mut self, frames: usize) {
        let n = frames.min(self.buf_l.len());
        self.buf_l[..n].fill(0.0);
        self.buf_r[..n].fill(0.0);
    }
}

/// All aux buses for the engine. Pre-allocated at start.
pub struct RoutingState {
    pub buses: Vec<AuxBus>,
    /// Per-track send levels. Indexed by [slot][bus].
    pub track_sends: Vec<TrackSends>,
}

impl RoutingState {
    /// Create routing state for `num_tracks` tracks and `MAX_AUX_BUSES`
    /// buses with buffer capacity `max_frames`.
    pub fn new(num_tracks: usize, max_frames: usize) -> Self {
        Self {
            buses: (0..MAX_AUX_BUSES).map(|_| AuxBus::new(max_frames)).collect(),
            track_sends: vec![TrackSends::default(); num_tracks],
        }
    }

    /// Zero all bus accumulation buffers. Call at the start of each
    /// audio callback before per-track processing.
    pub fn clear_buses(&mut self, frames: usize) {
        for bus in &mut self.buses {
            bus.clear(frames);
        }
    }

    /// Add a track's post-fader contribution to all active sends.
    /// `track_l` / `track_r` are the track's panned output for this
    /// buffer. `slot` indexes into `track_sends`.
    pub fn send_from_track(
        &mut self,
        slot: usize,
        track_l: &[f32],
        track_r: &[f32],
        frames: usize,
    ) {
        let sends = match self.track_sends.get(slot) {
            Some(s) => s,
            None => return,
        };
        for (bus_idx, &level) in sends.levels.iter().enumerate() {
            if level <= 0.0 {
                continue;
            }
            let bus = &mut self.buses[bus_idx];
            if !bus.enabled {
                continue;
            }
            let n = frames.min(bus.buf_l.len());
            for i in 0..n {
                bus.buf_l[i] += track_l[i] * level;
                bus.buf_r[i] += track_r[i] * level;
            }
        }
    }

    /// Mix all enabled aux buses into the master L/R accumulators.
    /// Called after all tracks have been processed.
    pub fn mix_into_master(
        &self,
        master_l: &mut [f32],
        master_r: &mut [f32],
        frames: usize,
    ) {
        for bus in &self.buses {
            if !bus.enabled || bus.volume <= 0.0 {
                continue;
            }
            let n = frames.min(bus.buf_l.len()).min(master_l.len());
            for i in 0..n {
                master_l[i] += bus.buf_l[i] * bus.volume;
                master_r[i] += bus.buf_r[i] * bus.volume;
            }
        }
    }

    /// Set the send level for a specific track → bus pair.
    pub fn set_send_level(&mut self, slot: usize, bus_index: usize, level: f32) {
        if let Some(sends) = self.track_sends.get_mut(slot) {
            if bus_index < MAX_AUX_BUSES {
                sends.levels[bus_index] = level.max(0.0);
            }
        }
    }

    /// Send a track's post-fader contribution to aux buses, computing
    /// the panned output on-the-fly from the mono scratch buffer +
    /// volume + pan gains. Avoids allocating a separate per-track L/R
    /// buffer.
    pub fn send_from_track_computed(
        &mut self,
        slot: usize,
        scratch: &[f32],
        vol: f32,
        pan_l: f32,
        pan_r: f32,
        frames: usize,
    ) {
        let sends = match self.track_sends.get(slot) {
            Some(s) => *s, // Copy — levels is [f32; 8]
            None => return,
        };
        for (bus_idx, level) in sends.levels.iter().enumerate() {
            if *level <= 0.0 {
                continue;
            }
            let bus = &mut self.buses[bus_idx];
            if !bus.enabled {
                continue;
            }
            let n = frames.min(bus.buf_l.len()).min(scratch.len());
            let lv = *level;
            for i in 0..n {
                let s = scratch[i] * vol;
                bus.buf_l[i] += s * pan_l * lv;
                bus.buf_r[i] += s * pan_r * lv;
            }
        }
    }

    /// Reset sends for a track slot (called when the track is removed).
    pub fn reset_track_sends(&mut self, slot: usize) {
        if let Some(sends) = self.track_sends.get_mut(slot) {
            *sends = TrackSends::default();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn zero_send_contributes_nothing() {
        let mut routing = RoutingState::new(4, 256);
        routing.buses[0].enabled = true;
        routing.clear_buses(256);

        let track_l = vec![1.0_f32; 256];
        let track_r = vec![1.0_f32; 256];
        // Send level is 0 by default.
        routing.send_from_track(0, &track_l, &track_r, 256);

        assert!(routing.buses[0].buf_l.iter().all(|&s| s == 0.0));
    }

    #[test]
    fn unity_send_forwards_full_signal() {
        let mut routing = RoutingState::new(4, 256);
        routing.buses[0].enabled = true;
        routing.set_send_level(0, 0, 1.0);
        routing.clear_buses(256);

        let track_l = vec![0.5_f32; 256];
        let track_r = vec![0.3_f32; 256];
        routing.send_from_track(0, &track_l, &track_r, 256);

        assert!((routing.buses[0].buf_l[0] - 0.5).abs() < 1e-5);
        assert!((routing.buses[0].buf_r[0] - 0.3).abs() < 1e-5);
    }

    #[test]
    fn half_send_scales_signal() {
        let mut routing = RoutingState::new(4, 256);
        routing.buses[0].enabled = true;
        routing.set_send_level(0, 0, 0.5);
        routing.clear_buses(256);

        let track_l = vec![1.0_f32; 256];
        let track_r = vec![1.0_f32; 256];
        routing.send_from_track(0, &track_l, &track_r, 256);

        assert!((routing.buses[0].buf_l[0] - 0.5).abs() < 1e-5);
    }

    #[test]
    fn multiple_tracks_sum_into_same_bus() {
        let mut routing = RoutingState::new(4, 256);
        routing.buses[0].enabled = true;
        routing.set_send_level(0, 0, 1.0);
        routing.set_send_level(1, 0, 1.0);
        routing.clear_buses(256);

        let t0 = vec![0.3_f32; 256];
        let t1 = vec![0.4_f32; 256];
        routing.send_from_track(0, &t0, &t0, 256);
        routing.send_from_track(1, &t1, &t1, 256);

        assert!((routing.buses[0].buf_l[0] - 0.7).abs() < 1e-5);
    }

    #[test]
    fn aux_bus_volume_applied_on_mix_to_master() {
        let mut routing = RoutingState::new(4, 256);
        routing.buses[0].enabled = true;
        routing.buses[0].volume = 0.5;
        routing.set_send_level(0, 0, 1.0);
        routing.clear_buses(256);

        let track = vec![1.0_f32; 256];
        routing.send_from_track(0, &track, &track, 256);

        let mut master_l = vec![0.0_f32; 256];
        let mut master_r = vec![0.0_f32; 256];
        routing.mix_into_master(&mut master_l, &mut master_r, 256);

        assert!((master_l[0] - 0.5).abs() < 1e-5);
    }

    #[test]
    fn disabled_bus_contributes_nothing() {
        let mut routing = RoutingState::new(4, 256);
        // Bus 0 disabled (default).
        routing.set_send_level(0, 0, 1.0);
        routing.clear_buses(256);

        let track = vec![1.0_f32; 256];
        routing.send_from_track(0, &track, &track, 256);

        let mut master_l = vec![0.0_f32; 256];
        let mut master_r = vec![0.0_f32; 256];
        routing.mix_into_master(&mut master_l, &mut master_r, 256);

        assert!(master_l[0] == 0.0, "disabled bus must not contribute");
    }

    #[test]
    fn reset_track_sends_clears_all_levels() {
        let mut routing = RoutingState::new(4, 256);
        routing.set_send_level(2, 0, 0.8);
        routing.set_send_level(2, 3, 0.5);
        routing.reset_track_sends(2);

        let sends = &routing.track_sends[2];
        assert!(sends.levels.iter().all(|&l| l == 0.0));
    }

    #[test]
    fn out_of_range_bus_index_is_ignored() {
        let mut routing = RoutingState::new(4, 256);
        routing.set_send_level(0, MAX_AUX_BUSES + 5, 1.0);
        // Should not panic, and default sends should be 0.
        assert!(routing.track_sends[0].levels.iter().all(|&l| l == 0.0));
    }
}
