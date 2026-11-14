use core::slice;

use crate::memory::MAX_PIXELS;

/// Computes frame-to-frame motion delta and Laplacian sharpness score in `out_ptr`.
///
/// # Safety
/// `rgba_ptr` must hold `width * height * 4` bytes, `prev_lum_ptr` must hold `width * height` bytes, and `out_ptr` must hold 2 `f32` values.
#[no_mangle]
pub unsafe extern "C" fn otium_motion_and_sharpness_rgba(
    rgba_ptr: *const u8,
    prev_lum_ptr: *mut u8,
    has_prev: i32,
    width: u32,
    height: u32,
    out_ptr: *mut f32,
) -> i32 {
    if rgba_ptr.is_null() || prev_lum_ptr.is_null() || out_ptr.is_null() || width < 3 || height < 3
    {
        return -1;
    }
    let Some(pixels) = (width as usize).checked_mul(height as usize) else {
        return -1;
    };
    if pixels > MAX_PIXELS {
        return -1;
    }
    let rgba = unsafe { slice::from_raw_parts(rgba_ptr, pixels * 4) };
    let prev_lum = unsafe { slice::from_raw_parts_mut(prev_lum_ptr, pixels) };
    let out = unsafe { slice::from_raw_parts_mut(out_ptr, 2) };

    let mut diff_sum = 0u64;
    let mut diff_count = 0u64;
    for (i, (px, prev_slot)) in rgba.as_chunks::<4>().0.iter().zip(prev_lum.iter_mut()).enumerate() {
        let lum = ((px[0] as u32) * 77 + (px[1] as u32) * 150 + (px[2] as u32) * 29) >> 8;
        let lum_u8 = lum as u8;
        if has_prev != 0 && (i & 3) == 0 {
            diff_sum += (lum_u8 as i32 - *prev_slot as i32).unsigned_abs() as u64;
            diff_count += 1;
        }
        *prev_slot = lum_u8;
    }

    let w = width as usize;
    let h = height as usize;
    let mut sum = 0.0f64;
    let mut sum_sq = 0.0f64;
    let mut lap_count = 0u64;

    for y in 1..(h - 1) {
        let row = y * w;
        for x in 1..(w - 1) {
            let idx = row + x;
            let lap = 4.0 * (prev_lum[idx] as f64)
                - (prev_lum[idx - 1] as f64)
                - (prev_lum[idx + 1] as f64)
                - (prev_lum[idx - w] as f64)
                - (prev_lum[idx + w] as f64);
            sum += lap;
            sum_sq += lap * lap;
            lap_count += 1;
        }
    }

    let motion = if diff_count > 0 {
        (diff_sum as f64 / diff_count as f64) as f32
    } else {
        0.0
    };
    let sharpness = if lap_count > 0 {
        let n = lap_count as f64;
        let mean = sum / n;
        ((sum_sq / n) - mean * mean).max(0.0) as f32
    } else {
        0.0
    };

    out[0] = motion;
    out[1] = sharpness;
    0
}
