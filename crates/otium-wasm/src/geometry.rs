use core::slice;

use crate::memory::{clamp_u8, MAX_PIXELS};

fn compute_inverse_homography(dst_w: f64, dst_h: f64, corners: &[f32; 8]) -> Option<[f64; 9]> {
    let src = [
        (0.0f64, 0.0f64),
        (dst_w, 0.0f64),
        (dst_w, dst_h),
        (0.0f64, dst_h),
    ];
    let dst = [
        (corners[0] as f64, corners[1] as f64),
        (corners[2] as f64, corners[3] as f64),
        (corners[4] as f64, corners[5] as f64),
        (corners[6] as f64, corners[7] as f64),
    ];

    otium_scan_math::homography(src, dst, 1e-10)
}

pub fn warp_perspective_rgba_slice(
    src: &[u8],
    src_w: usize,
    src_h: usize,
    dst: &mut [u8],
    dst_w: usize,
    dst_h: usize,
    corners: &[f32; 8],
) -> bool {
    if src_w < 2 || src_h < 2 || dst_w == 0 || dst_h == 0 {
        return false;
    }
    if src.len() < src_w * src_h * 4 || dst.len() < dst_w * dst_h * 4 {
        return false;
    }
    let Some(m) = compute_inverse_homography(dst_w as f64, dst_h as f64, corners) else {
        return false;
    };

    let src_stride = src_w * 4;
    let max_x = (src_w - 1) as f32;
    let max_y = (src_h - 1) as f32;

    for y in 0..dst_h {
        let yf = y as f64;
        let row_offset = y * dst_w * 4;
        for x in 0..dst_w {
            let xf = x as f64;
            let z = m[6] * xf + m[7] * yf + m[8];
            let safe_z = if z.abs() < 1e-8 { 1e-8 } else { z };
            let inv_z = 1.0 / safe_z;
            let sx = ((m[0] * xf + m[1] * yf + m[2]) * inv_z) as f32;
            let sy = ((m[3] * xf + m[4] * yf + m[5]) * inv_z) as f32;
            let out_idx = row_offset + x * 4;

            if sx >= 0.0 && sx <= max_x && sy >= 0.0 && sy <= max_y {
                let x0 = (sx as usize).min(src_w - 2);
                let y0 = (sy as usize).min(src_h - 2);
                let fx = (sx - (x0 as f32)).clamp(0.0, 1.0);
                let fy = (sy - (y0 as f32)).clamp(0.0, 1.0);
                let inv_fx = 1.0 - fx;
                let inv_fy = 1.0 - fy;

                let [idx00, idx10, idx01, idx11] =
                    otium_scan_math::rgba_neighbors(x0, y0, src_stride);

                let w00 = inv_fx * inv_fy;
                let w10 = fx * inv_fy;
                let w01 = inv_fx * fy;
                let w11 = fx * fy;

                for c in 0..3 {
                    let v = (src[idx00 + c] as f32) * w00
                        + (src[idx10 + c] as f32) * w10
                        + (src[idx01 + c] as f32) * w01
                        + (src[idx11 + c] as f32) * w11;
                    dst[out_idx + c] = clamp_u8(v);
                }
                dst[out_idx + 3] = 255;
            } else {
                dst[out_idx] = 255;
                dst[out_idx + 1] = 255;
                dst[out_idx + 2] = 255;
                dst[out_idx + 3] = 255;
            }
        }
    }
    true
}

/// Performs perspective warp from `src_ptr` onto `dst_ptr` using 4 quad corner coordinates.
///
/// # Safety
/// `src_ptr`, `dst_ptr`, and `corners_ptr` must be valid for `src_w * src_h * 4`, `dst_w * dst_h * 4`, and `8` elements respectively.
#[no_mangle]
pub unsafe extern "C" fn otium_warp_perspective_rgba(
    src_ptr: *const u8,
    src_w: u32,
    src_h: u32,
    dst_ptr: *mut u8,
    dst_w: u32,
    dst_h: u32,
    corners_ptr: *const f32,
) -> i32 {
    if src_ptr.is_null() || dst_ptr.is_null() || corners_ptr.is_null() {
        return -1;
    }
    let Some(src_pixels) = (src_w as usize).checked_mul(src_h as usize) else {
        return -1;
    };
    let Some(dst_pixels) = (dst_w as usize).checked_mul(dst_h as usize) else {
        return -1;
    };
    if src_pixels > MAX_PIXELS || dst_pixels > MAX_PIXELS {
        return -1;
    }
    let src = unsafe { slice::from_raw_parts(src_ptr, src_pixels * 4) };
    let dst = unsafe { slice::from_raw_parts_mut(dst_ptr, dst_pixels * 4) };
    let corners_slice = unsafe { slice::from_raw_parts(corners_ptr, 8) };
    let mut corners = [0.0f32; 8];
    corners.copy_from_slice(corners_slice);

    if warp_perspective_rgba_slice(
        src,
        src_w as usize,
        src_h as usize,
        dst,
        dst_w as usize,
        dst_h as usize,
        &corners,
    ) {
        0
    } else {
        -1
    }
}

pub fn dewarp_spine_rgba_slice(
    src: &[u8],
    width: usize,
    height: usize,
    dst: &mut [u8],
    curvature: f32,
    spine_pos: f32,
) -> bool {
    if width == 0 || height < 2 || src.len() < width * height * 4 || dst.len() < width * height * 4 {
        return false;
    }
    let h_f = height as f32;
    let w_f = width as f32;
    let max_lift = h_f * 0.1 * curvature.clamp(0.0, 1.0);
    let sigma = 0.35f32;
    let two_sigma2 = 2.0 * sigma * sigma;
    let stride = width * 4;
    let max_y = (height - 1) as f32;

    let mut inv_scales = vec![1.0f32; width];
    let mut dy_offsets = vec![0.0f32; width];
    for x in 0..width {
        let norm_x = (x as f32) / w_f;
        let dist = norm_x - spine_pos;
        let deflection = (-(dist * dist) / two_sigma2).exp() * max_lift;
        let d_height = h_f + deflection;
        dy_offsets[x] = -deflection * 0.5;
        inv_scales[x] = h_f / d_height.max(1.0);
    }

    for y in 0..height {
        let row = y * stride;
        let yf = y as f32;
        for x in 0..width {
            let out_idx = row + x * 4;
            let sy = (yf - dy_offsets[x]) * inv_scales[x];
            if sy >= 0.0 && sy <= max_y {
                let y0 = (sy as usize).min(height - 2);
                let fy = (sy - (y0 as f32)).clamp(0.0, 1.0);
                let inv_fy = 1.0 - fy;
                let idx0 = y0 * stride + x * 4;
                let idx1 = idx0 + stride;
                for c in 0..3 {
                    let v = (src[idx0 + c] as f32) * inv_fy + (src[idx1 + c] as f32) * fy;
                    dst[out_idx + c] = clamp_u8(v);
                }
                dst[out_idx + 3] = 255;
            } else {
                dst[out_idx] = 255;
                dst[out_idx + 1] = 255;
                dst[out_idx + 2] = 255;
                dst[out_idx + 3] = 255;
            }
        }
    }
    true
}

/// Flattens curved book spine distortion vertically along `spine_pos`.
///
/// # Safety
/// `src_ptr` and `dst_ptr` must be valid for `width * height * 4` bytes.
#[no_mangle]
pub unsafe extern "C" fn otium_dewarp_spine_rgba(
    src_ptr: *const u8,
    width: u32,
    height: u32,
    dst_ptr: *mut u8,
    curvature: f32,
    spine_pos: f32,
) -> i32 {
    if src_ptr.is_null() || dst_ptr.is_null() || width == 0 || height < 2 {
        return -1;
    }
    let Some(pixels) = (width as usize).checked_mul(height as usize) else {
        return -1;
    };
    if pixels > MAX_PIXELS {
        return -1;
    }
    let src = unsafe { slice::from_raw_parts(src_ptr, pixels * 4) };
    let dst = unsafe { slice::from_raw_parts_mut(dst_ptr, pixels * 4) };
    if dewarp_spine_rgba_slice(src, width as usize, height as usize, dst, curvature, spine_pos) {
        0
    } else {
        -1
    }
}

/// Simplifies a flat `[x0, y0, x1, y1, ...]` polyline with iterative Ramer-Douglas-Peucker
/// and writes retained `[x, y]` pairs back in place, returning the retained point count.
pub fn simplify_polyline_xy_slice(coords: &mut [f32], epsilon: f32) -> usize {
    let point_count = coords.len() / 2;
    if point_count <= 2 || epsilon <= 0.0 {
        return point_count;
    }

    let eps_sq = epsilon * epsilon;
    let mut keep = vec![false; point_count];
    keep[0] = true;
    keep[point_count - 1] = true;

    let mut stack = vec![(0usize, point_count - 1)];
    while let Some((start, end)) = stack.pop() {
        if end <= start + 1 {
            continue;
        }
        let ax = coords[start * 2];
        let ay = coords[start * 2 + 1];
        let bx = coords[end * 2];
        let by = coords[end * 2 + 1];
        let dx = bx - ax;
        let dy = by - ay;
        let len_sq = dx * dx + dy * dy;

        let mut max_dist_sq = 0.0f32;
        let mut max_idx = start;
        for i in (start + 1)..end {
            let px = coords[i * 2];
            let py = coords[i * 2 + 1];
            let dist_sq = if len_sq < 1e-6 {
                let rx = px - ax;
                let ry = py - ay;
                rx * rx + ry * ry
            } else {
                let cross = dx * (ay - py) - (ax - px) * dy;
                (cross * cross) / len_sq
            };
            if dist_sq > max_dist_sq {
                max_dist_sq = dist_sq;
                max_idx = i;
            }
        }

        if max_dist_sq > eps_sq {
            keep[max_idx] = true;
            stack.push((start, max_idx));
            stack.push((max_idx, end));
        }
    }

    let mut out_idx = 0usize;
    for (idx, &retained) in keep.iter().enumerate() {
        if retained {
            coords[out_idx * 2] = coords[idx * 2];
            coords[out_idx * 2 + 1] = coords[idx * 2 + 1];
            out_idx += 1;
        }
    }
    out_idx
}

/// Simplifies `[x, y]` coordinate pairs in place via RDP and returns the retained point count or `-1` on invalid args.
///
/// # Safety
/// `coords_ptr` must be valid for `point_count * 2` contiguous `f32` elements.
#[no_mangle]
pub unsafe extern "C" fn otium_simplify_polyline_f32(
    coords_ptr: *mut f32,
    point_count: u32,
    epsilon: f32,
) -> i32 {
    if coords_ptr.is_null() || point_count > 500_000 {
        return -1;
    }
    let Some(f32_len) = (point_count as usize).checked_mul(2) else {
        return -1;
    };
    let coords = unsafe { slice::from_raw_parts_mut(coords_ptr, f32_len) };
    simplify_polyline_xy_slice(coords, epsilon) as i32
}
