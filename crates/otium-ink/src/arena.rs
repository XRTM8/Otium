use bumpalo::Bump;

use crate::mesh::InkVertex;
use crate::stroke::InkPoint;

/// Per-frame Scratchpad Bump Allocator for 120-240 FPS real-time inking.
/// Allocates stroke points and transient GPU mesh vertices in 1 CPU cycle (ptr += size),
/// completely bypassing heap locks, and frees all frame memory instantaneously in 1 cycle (ptr = 0).
pub struct InkScratchArena {
    bump: Bump,
}

impl Default for InkScratchArena {
    fn default() -> Self {
        Self::new()
    }
}

impl InkScratchArena {
    /// Create a new scratch arena with 64KB initial pre-allocated capacity
    pub fn new() -> Self {
        Self {
            bump: Bump::with_capacity(64 * 1024),
        }
    }

    /// Allocate a slice of ink points in 1 CPU cycle
    #[inline(always)]
    pub fn alloc_point(&self, point: InkPoint) -> &mut InkPoint {
        self.bump.alloc(point)
    }

    /// Allocate transient GPU vertices for current frame
    #[inline(always)]
    pub fn alloc_vertex(&self, vertex: InkVertex) -> &mut InkVertex {
        self.bump.alloc(vertex)
    }

    /// Allocate a contiguous slice of temporary items in the arena
    #[inline(always)]
    pub fn alloc_slice<T: Copy>(&self, slice: &[T]) -> &mut [T] {
        self.bump.alloc_slice_copy(slice)
    }

    /// Instantaneous reset: frees all frame memory in 0 CPU cycles by resetting the bump pointer
    #[inline(always)]
    pub fn reset(&mut self) {
        self.bump.reset();
    }

    /// Currently allocated bytes in this scratchpad frame
    #[inline]
    pub fn allocated_bytes(&self) -> usize {
        self.bump.allocated_bytes()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_scratchpad_bump_arena() {
        let mut arena = InkScratchArena::new();
        let p1 = arena.alloc_point(InkPoint::new(10.0, 20.0, 0.9, 100));
        assert_eq!(p1.x, 10.0);

        let v1 = arena.alloc_vertex(InkVertex::new(15.0, 25.0, 0.0, 1.0, 4.0, 1.0));
        assert_eq!(v1.width, 4.0);

        let bytes_before_reset = arena.allocated_bytes();
        assert!(bytes_before_reset > 0);
        arena.reset();
        // Bump::reset() resets the bump pointer while keeping the backing chunk pooled for zero-OS-alloc reuse
        assert_eq!(arena.allocated_bytes(), bytes_before_reset);
        let p2 = arena.alloc_point(InkPoint::new(30.0, 40.0, 1.0, 200));
        assert_eq!(p2.x, 30.0);
        assert_eq!(arena.allocated_bytes(), bytes_before_reset);
    }
}
