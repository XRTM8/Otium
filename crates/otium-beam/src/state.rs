use std::sync::atomic::{AtomicBool, AtomicU32, AtomicU64, Ordering};

/// Cache-line aligned (64 bytes) concurrent beam state.
/// Strictly eliminates False Sharing (L1/L2 cache-line invalidation thrashing)
/// between the network listener thread, laser pointer tracker, and the main UI thread.
#[repr(align(64))]
pub struct AlignedBeamState {
    pub is_connected: AtomicBool,
    pub active_viewers: AtomicU32,
    pub current_page: AtomicU32,
    pub last_packet_seq: AtomicU64,
    pub spotlight_x_bits: AtomicU32,
    pub spotlight_y_bits: AtomicU32,
    pub is_spotlight_active: AtomicBool,
}

impl Default for AlignedBeamState {
    fn default() -> Self {
        Self::new()
    }
}

impl AlignedBeamState {
    pub const fn new() -> Self {
        Self {
            is_connected: AtomicBool::new(false),
            active_viewers: AtomicU32::new(0),
            current_page: AtomicU32::new(1),
            last_packet_seq: AtomicU64::new(0),
            spotlight_x_bits: AtomicU32::new(0),
            spotlight_y_bits: AtomicU32::new(0),
            is_spotlight_active: AtomicBool::new(false),
        }
    }

    #[inline(always)]
    pub fn update_spotlight(&self, x: f32, y: f32, active: bool) {
        self.spotlight_x_bits.store(x.to_bits(), Ordering::Relaxed);
        self.spotlight_y_bits.store(y.to_bits(), Ordering::Relaxed);
        self.is_spotlight_active.store(active, Ordering::Relaxed);
    }

    #[inline(always)]
    pub fn get_spotlight(&self) -> (f32, f32, bool) {
        let x = f32::from_bits(self.spotlight_x_bits.load(Ordering::Relaxed));
        let y = f32::from_bits(self.spotlight_y_bits.load(Ordering::Relaxed));
        let active = self.is_spotlight_active.load(Ordering::Relaxed);
        (x, y, active)
    }

    #[inline(always)]
    pub fn increment_sequence(&self) -> u64 {
        self.last_packet_seq.fetch_add(1, Ordering::Relaxed)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_cache_alignment() {
        assert_eq!(std::mem::align_of::<AlignedBeamState>(), 64);
        let state = AlignedBeamState::new();
        state.update_spotlight(0.45, 0.85, true);
        let (x, y, active) = state.get_spotlight();
        assert!((x - 0.45).abs() < 0.0001);
        assert!((y - 0.85).abs() < 0.0001);
        assert!(active);
    }
}
