//! Placeholder for the real-time audio processing thread.
//!
//! Will eventually run a dedicated thread that pulls audio from plugin
//! instances, mixes, and streams the result back to the browser over
//! WebSocket binary frames.

use tracing::info;

/// Placeholder audio thread handle.
pub struct AudioThread;

impl AudioThread {
    pub fn new() -> Self {
        info!("AudioThread initialized (stub)");
        Self
    }
}
