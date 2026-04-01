//! Stereo Imager — mid/side width control and stereo field manipulation.
//!
//! Uses mid/side encoding to adjust the stereo width:
//! - `width = 0.0`: mono (side channel muted)
//! - `width = 1.0`: original stereo image (no change)
//! - `width = 2.0`: exaggerated stereo (side boosted 2×)
//!
//! Mid/Side encoding:
//!   mid  = (L + R) / 2
//!   side = (L - R) / 2
//!
//! Reconstruction:
//!   L = mid + side * width
//!   R = mid - side * width

/// Stereo imager processor.
///
/// Operates on interleaved stereo buffers [L, R, L, R, ...].
/// Stateless — no internal buffers to reset.
pub struct StereoImager {
    width: f32,
}

impl StereoImager {
    /// Create a new stereo imager.
    ///
    /// - `width`: 0.0 (mono) to 2.0 (extra wide), 1.0 = unchanged
    pub fn new(width: f32) -> Self {
        Self {
            width: width.clamp(0.0, 2.0),
        }
    }

    /// Set stereo width (0.0–2.0).
    pub fn set_width(&mut self, width: f32) {
        self.width = width.clamp(0.0, 2.0);
    }

    /// Get current width.
    pub fn width(&self) -> f32 {
        self.width
    }

    /// Process a single stereo sample pair.
    #[inline]
    pub fn process_sample(&self, left: f32, right: f32) -> (f32, f32) {
        let mid = (left + right) * 0.5;
        let side = (left - right) * 0.5;
        let out_l = mid + side * self.width;
        let out_r = mid - side * self.width;
        (out_l, out_r)
    }

    /// Process an interleaved stereo buffer in-place [L, R, L, R, ...].
    pub fn process_interleaved(&self, buffer: &mut [f32]) {
        let len = buffer.len();
        let mut i = 0;
        while i + 1 < len {
            let (l, r) = self.process_sample(buffer[i], buffer[i + 1]);
            buffer[i] = l;
            buffer[i + 1] = r;
            i += 2;
        }
    }

    /// Process separate left and right buffers in-place.
    pub fn process_split(&self, left: &mut [f32], right: &mut [f32]) {
        for (l, r) in left.iter_mut().zip(right.iter_mut()) {
            let (out_l, out_r) = self.process_sample(*l, *r);
            *l = out_l;
            *r = out_r;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_creation() {
        let si = StereoImager::new(1.0);
        assert_eq!(si.width(), 1.0);
    }

    #[test]
    fn test_unity_width_passthrough() {
        let si = StereoImager::new(1.0);
        let (l, r) = si.process_sample(0.8, 0.3);
        assert!((l - 0.8).abs() < 1e-6, "Left: {l}");
        assert!((r - 0.3).abs() < 1e-6, "Right: {r}");
    }

    #[test]
    fn test_mono_collapse() {
        let si = StereoImager::new(0.0);
        let (l, r) = si.process_sample(1.0, 0.0);
        // mid = 0.5, side = 0.5, width=0 → L=R=mid=0.5
        assert!((l - 0.5).abs() < 1e-6, "Mono L: {l}");
        assert!((r - 0.5).abs() < 1e-6, "Mono R: {r}");
    }

    #[test]
    fn test_mono_symmetric() {
        let si = StereoImager::new(0.0);
        let (l, r) = si.process_sample(0.7, 0.3);
        // Both should be the average
        assert!((l - r).abs() < 1e-6, "Mono should be equal: L={l}, R={r}");
        assert!((l - 0.5).abs() < 1e-6, "Average: {l}");
    }

    #[test]
    fn test_wide_stereo() {
        let si = StereoImager::new(2.0);
        let (l, r) = si.process_sample(0.8, 0.2);
        // mid = 0.5, side = 0.3
        // L = 0.5 + 0.3 * 2 = 1.1
        // R = 0.5 - 0.3 * 2 = -0.1
        assert!((l - 1.1).abs() < 1e-6, "Wide L: {l}");
        assert!((r - -0.1).abs() < 1e-6, "Wide R: {r}");
    }

    #[test]
    fn test_already_mono_signal() {
        // If L == R, any width should keep L == R
        let si = StereoImager::new(2.0);
        let (l, r) = si.process_sample(0.5, 0.5);
        assert!((l - 0.5).abs() < 1e-6, "Mono signal L: {l}");
        assert!((r - 0.5).abs() < 1e-6, "Mono signal R: {r}");
    }

    #[test]
    fn test_interleaved_buffer() {
        let si = StereoImager::new(0.0);
        let mut buf = [1.0_f32, 0.0, 0.6, 0.4];
        si.process_interleaved(&mut buf);
        // Pair 1: mono → (0.5, 0.5)
        assert!((buf[0] - 0.5).abs() < 1e-6);
        assert!((buf[1] - 0.5).abs() < 1e-6);
        // Pair 2: mono → (0.5, 0.5)
        assert!((buf[2] - 0.5).abs() < 1e-6);
        assert!((buf[3] - 0.5).abs() < 1e-6);
    }

    #[test]
    fn test_split_buffers() {
        let si = StereoImager::new(0.0);
        let mut left = [1.0_f32, 0.6];
        let mut right = [0.0_f32, 0.4];
        si.process_split(&mut left, &mut right);
        assert!((left[0] - 0.5).abs() < 1e-6);
        assert!((right[0] - 0.5).abs() < 1e-6);
    }

    #[test]
    fn test_width_clamping() {
        let mut si = StereoImager::new(5.0);
        assert_eq!(si.width(), 2.0);
        si.set_width(-1.0);
        assert_eq!(si.width(), 0.0);
    }

    #[test]
    fn test_silence_passthrough() {
        let si = StereoImager::new(1.5);
        let (l, r) = si.process_sample(0.0, 0.0);
        assert!(l.abs() < 1e-10);
        assert!(r.abs() < 1e-10);
    }

    #[test]
    fn test_set_width() {
        let mut si = StereoImager::new(1.0);
        si.set_width(0.5);
        assert_eq!(si.width(), 0.5);
        // Width 0.5 should narrow the image
        let (l, r) = si.process_sample(1.0, 0.0);
        // mid=0.5, side=0.5, L=0.5+0.25=0.75, R=0.5-0.25=0.25
        assert!((l - 0.75).abs() < 1e-6, "Narrow L: {l}");
        assert!((r - 0.25).abs() < 1e-6, "Narrow R: {r}");
    }
}
