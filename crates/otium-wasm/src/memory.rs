use std::alloc::{alloc, dealloc, Layout};

pub(crate) const ALIGN: usize = 16;
pub(crate) const MAX_PIXELS: usize = 64_000_000;

/// Allocates 16-byte aligned memory in linear WASM space for zero-copy JS interop.
#[no_mangle]
pub extern "C" fn otium_alloc(size: usize) -> *mut u8 {
    if size == 0 || size > MAX_PIXELS * 4 {
        return core::ptr::null_mut();
    }
    let Ok(layout) = Layout::from_size_align(size, ALIGN) else {
        return core::ptr::null_mut();
    };
    unsafe { alloc(layout) }
}

/// Frees memory previously returned by `otium_alloc`.
///
/// # Safety
/// `ptr` must be null or previously returned by `otium_alloc` with the matching `size`.
#[no_mangle]
pub unsafe extern "C" fn otium_dealloc(ptr: *mut u8, size: usize) {
    if ptr.is_null() || size == 0 || size > MAX_PIXELS * 4 {
        return;
    }
    if let Ok(layout) = Layout::from_size_align(size, ALIGN) {
        unsafe { dealloc(ptr, layout) };
    }
}

#[inline(always)]
pub(crate) fn clamp_u8(v: f32) -> u8 {
    if v <= 0.0 {
        0
    } else if v >= 255.0 {
        255
    } else {
        (v + 0.5) as u8
    }
}

#[inline(always)]
pub(crate) fn smoothstep01(t: f32) -> f32 {
    let x = t.clamp(0.0, 1.0);
    x * x * (3.0 - 2.0 * x)
}
