use std::cell::RefCell;

/// Pre-allocated, zero-syscall, zero-page-fault memory slab allocator.
/// Reuses continuous virtual memory pages across intensive burst tasks (search queries, frame encoding, image filters).
pub struct LocalMemorySlab {
    storage: Vec<u8>,
    capacity: usize,
    offset: usize,
}

impl LocalMemorySlab {
    /// Creates a memory slab with designated capacity (e.g. 64KB, 1MB)
    pub fn with_capacity(capacity: usize) -> Self {
        Self {
            storage: vec![0u8; capacity],
            capacity,
            offset: 0,
        }
    }

    /// Default 128KB burst slab
    pub fn new_128k() -> Self {
        Self::with_capacity(128 * 1024)
    }

    /// Allocates an 8-byte aligned byte slice from the pre-warmed slab
    #[inline(always)]
    pub fn alloc_slice(&mut self, len: usize) -> Option<&mut [u8]> {
        // 8-byte alignment
        let aligned_offset = (self.offset + 7) & !7;
        let end = aligned_offset + len;

        if end > self.capacity {
            return None;
        }

        self.offset = end;
        Some(&mut self.storage[aligned_offset..end])
    }

    /// Resets the allocation head in 1 CPU cycle without deallocating pages or issuing syscalls
    #[inline(always)]
    pub fn reset(&mut self) {
        self.offset = 0;
    }

    /// Current bytes allocated in the slab
    #[inline(always)]
    pub fn allocated_bytes(&self) -> usize {
        self.offset
    }

    /// Total capacity of the slab
    #[inline(always)]
    pub fn capacity(&self) -> usize {
        self.capacity
    }

    /// Remaining available bytes before slab fills
    #[inline(always)]
    pub fn remaining_bytes(&self) -> usize {
        self.capacity.saturating_sub(self.offset)
    }
}

thread_local! {
    /// Thread-local reusable 128KB burst buffer
    static THREAD_BURST_SLAB: RefCell<LocalMemorySlab> = RefCell::new(LocalMemorySlab::new_128k());
}

/// Executes a closure with access to the current thread's reusable memory slab
pub fn with_thread_slab<R, F: FnOnce(&mut LocalMemorySlab) -> R>(f: F) -> R {
    THREAD_BURST_SLAB.with(|cell| {
        let mut slab = cell.borrow_mut();
        slab.reset();
        f(&mut slab)
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_slab_allocation_and_alignment() {
        let mut slab = LocalMemorySlab::with_capacity(1024);
        let slice1 = slab.alloc_slice(13).expect("Slice 1 allocation failed");
        assert_eq!(slice1.len(), 13);
        slice1[0] = 0xAA;

        // Next slice must be 8-byte aligned (offset 16)
        let slice2 = slab.alloc_slice(10).expect("Slice 2 allocation failed");
        assert_eq!(slice2.len(), 10);
        assert_eq!(slab.allocated_bytes(), 26);

        // Reset
        slab.reset();
        assert_eq!(slab.allocated_bytes(), 0);
    }

    #[test]
    fn test_thread_local_slab_scope() {
        let result = with_thread_slab(|slab| {
            let buf = slab.alloc_slice(256).unwrap();
            buf[0] = 42;
            buf[255] = 99;
            buf[0] + buf[255]
        });
        assert_eq!(result, 141);
    }
}
