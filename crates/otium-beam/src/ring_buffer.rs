use std::cell::UnsafeCell;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;

/// Cache-line aligned head pointer to ensure producer never invalidates consumer cache
#[repr(align(64))]
struct CachePaddedHead {
    head: AtomicUsize,
}

/// Cache-line aligned tail pointer to ensure consumer never invalidates producer cache
#[repr(align(64))]
struct CachePaddedTail {
    tail: AtomicUsize,
}

/// High-performance Single-Producer Single-Consumer (SPSC) Lock-Free Circular Ring Buffer.
/// Designed for zero-copy 60-120fps video frame transmission, audio streams, and ultra-high frequency ink points.
///
/// Features:
/// - Exact 64-byte hardware cache line alignment for head and tail to eliminate False Sharing.
/// - Power-of-two capacity for single-cycle bitwise modulo operations (`index & mask`).
/// - Zero heap allocations during enqueue/dequeue operations.
/// - 0.00ns lock overhead (pure atomic Acquire/Release semantics).
pub struct SpscRingBuffer<T, const CAPACITY: usize> {
    buffer: Box<[UnsafeCell<Option<T>>]>,
    mask: usize,
    head: CachePaddedHead,
    tail: CachePaddedTail,
}

unsafe impl<T: Send, const CAPACITY: usize> Send for SpscRingBuffer<T, CAPACITY> {}
unsafe impl<T: Send, const CAPACITY: usize> Sync for SpscRingBuffer<T, CAPACITY> {}

impl<T, const CAPACITY: usize> SpscRingBuffer<T, CAPACITY> {
    /// Create a new SPSC ring buffer.
    /// Panics if CAPACITY is not a power of two or is 0.
    pub fn new() -> Self {
        assert!(
            CAPACITY > 0 && (CAPACITY & (CAPACITY - 1)) == 0,
            "SpscRingBuffer capacity must be a power of two"
        );

        let mut storage = Vec::with_capacity(CAPACITY);
        for _ in 0..CAPACITY {
            storage.push(UnsafeCell::new(None));
        }

        Self {
            buffer: storage.into_boxed_slice(),
            mask: CAPACITY - 1,
            head: CachePaddedHead {
                head: AtomicUsize::new(0),
            },
            tail: CachePaddedTail {
                tail: AtomicUsize::new(0),
            },
        }
    }

    /// Attempts to push an item into the buffer.
    /// Returns Err(item) if the ring buffer is full.
    pub fn try_push(&self, item: T) -> Result<(), T> {
        let head = self.head.head.load(Ordering::Relaxed);
        let tail = self.tail.tail.load(Ordering::Acquire);

        // If buffer is full
        if head.wrapping_sub(tail) >= CAPACITY {
            return Err(item);
        }

        let slot_idx = head & self.mask;
        unsafe {
            let slot = &mut *self.buffer[slot_idx].get();
            *slot = Some(item);
        }

        // Publish written item to consumer
        self.head.head.store(head.wrapping_add(1), Ordering::Release);
        Ok(())
    }

    /// Pushes an item into the ring buffer, overwriting the oldest item if full.
    /// Ideal for real-time video frames and live touch inking where newest state is critical.
    pub fn push_overwrite(&self, item: T) -> Option<T> {
        let head = self.head.head.load(Ordering::Relaxed);
        let tail = self.tail.tail.load(Ordering::Acquire);

        let mut displaced = None;
        if head.wrapping_sub(tail) >= CAPACITY {
            // Buffer full: advance tail and take old value
            let old_idx = tail & self.mask;
            unsafe {
                let slot = &mut *self.buffer[old_idx].get();
                displaced = slot.take();
            }
            self.tail.tail.store(tail.wrapping_add(1), Ordering::Release);
        }

        let slot_idx = head & self.mask;
        unsafe {
            let slot = &mut *self.buffer[slot_idx].get();
            *slot = Some(item);
        }

        self.head.head.store(head.wrapping_add(1), Ordering::Release);
        displaced
    }

    /// Attempts to pop an item from the buffer.
    /// Returns None if the buffer is empty.
    pub fn try_pop(&self) -> Option<T> {
        let tail = self.tail.tail.load(Ordering::Relaxed);
        let head = self.head.head.load(Ordering::Acquire);

        // If buffer is empty
        if tail == head {
            return None;
        }

        let slot_idx = tail & self.mask;
        let item = unsafe {
            let slot = &mut *self.buffer[slot_idx].get();
            slot.take()
        };

        // Advance tail to free slot for producer
        self.tail.tail.store(tail.wrapping_add(1), Ordering::Release);
        item
    }

    /// Returns the number of items currently in the buffer
    pub fn len(&self) -> usize {
        let head = self.head.head.load(Ordering::Acquire);
        let tail = self.tail.tail.load(Ordering::Acquire);
        head.wrapping_sub(tail)
    }

    /// Returns true if the buffer has no elements
    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }

    /// Returns the maximum capacity of the ring buffer
    pub const fn capacity(&self) -> usize {
        CAPACITY
    }
}

impl<T, const CAPACITY: usize> Default for SpscRingBuffer<T, CAPACITY> {
    fn default() -> Self {
        Self::new()
    }
}

/// Producer handle for convenient thread-safe split
pub struct SpscProducer<T, const CAPACITY: usize> {
    inner: Arc<SpscRingBuffer<T, CAPACITY>>,
}

/// Consumer handle for convenient thread-safe split
pub struct SpscConsumer<T, const CAPACITY: usize> {
    inner: Arc<SpscRingBuffer<T, CAPACITY>>,
}

impl<T: Send + 'static, const CAPACITY: usize> SpscRingBuffer<T, CAPACITY> {
    /// Creates a shared producer-consumer pair
    pub fn create_channel() -> (SpscProducer<T, CAPACITY>, SpscConsumer<T, CAPACITY>) {
        let buffer = Arc::new(Self::new());
        (
            SpscProducer {
                inner: buffer.clone(),
            },
            SpscConsumer { inner: buffer },
        )
    }
}

impl<T, const CAPACITY: usize> SpscProducer<T, CAPACITY> {
    #[inline(always)]
    pub fn push(&self, item: T) -> Result<(), T> {
        self.inner.try_push(item)
    }

    #[inline(always)]
    pub fn push_overwrite(&self, item: T) -> Option<T> {
        self.inner.push_overwrite(item)
    }
}

impl<T, const CAPACITY: usize> SpscConsumer<T, CAPACITY> {
    #[inline(always)]
    pub fn pop(&self) -> Option<T> {
        self.inner.try_pop()
    }

    #[inline(always)]
    pub fn len(&self) -> usize {
        self.inner.len()
    }

    #[inline(always)]
    pub fn is_empty(&self) -> bool {
        self.inner.is_empty()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_spsc_basic_push_pop() {
        let rb = SpscRingBuffer::<i32, 4>::new();
        assert!(rb.is_empty());

        assert!(rb.try_push(10).is_ok());
        assert!(rb.try_push(20).is_ok());
        assert_eq!(rb.len(), 2);

        assert_eq!(rb.try_pop(), Some(10));
        assert_eq!(rb.try_pop(), Some(20));
        assert_eq!(rb.try_pop(), None);
        assert!(rb.is_empty());
    }

    #[test]
    fn test_spsc_capacity_full() {
        let rb = SpscRingBuffer::<i32, 2>::new();
        assert!(rb.try_push(1).is_ok());
        assert!(rb.try_push(2).is_ok());
        assert_eq!(rb.try_push(3), Err(3));

        assert_eq!(rb.try_pop(), Some(1));
        assert!(rb.try_push(3).is_ok());
        assert_eq!(rb.try_pop(), Some(2));
        assert_eq!(rb.try_pop(), Some(3));
        assert_eq!(rb.try_pop(), None);
    }

    #[test]
    fn test_spsc_push_overwrite() {
        let rb = SpscRingBuffer::<i32, 2>::new();
        assert_eq!(rb.push_overwrite(100), None);
        assert_eq!(rb.push_overwrite(200), None);
        // Overwriting oldest
        assert_eq!(rb.push_overwrite(300), Some(100));

        assert_eq!(rb.try_pop(), Some(200));
        assert_eq!(rb.try_pop(), Some(300));
        assert_eq!(rb.try_pop(), None);
    }

    #[test]
    fn test_cache_alignment_guarantees() {
        assert_eq!(std::mem::align_of::<CachePaddedHead>(), 64);
        assert_eq!(std::mem::align_of::<CachePaddedTail>(), 64);
    }
}
