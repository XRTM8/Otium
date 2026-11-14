use core::slice;

use crate::memory::{clamp_u8, smoothstep01, MAX_PIXELS};

#[derive(Clone, Copy)]
struct ToneFilterSpec {
    grid_divisor: usize,
    step_min: usize,
    step_max: usize,
    bg_floor: f32,
    deyellow_blue: bool,
    chroma_min: f32,
    chroma_max_ratio: f32,
    chroma_boost: f32,
    independent_whiten: bool,
    whiten_start: f32,
    whiten_span: f32,
    ink_cutoff: f32,
    ink_gamma: f32,
    grayscale: bool,
    unsharp_amount: f32,
}

const MAGIC_SPEC: ToneFilterSpec = ToneFilterSpec {
    grid_divisor: 24,
    step_min: 24,
    step_max: 64,
    bg_floor: 38.0,
    deyellow_blue: false,
    chroma_min: 18.0,
    chroma_max_ratio: 0.92,
    chroma_boost: 1.35,
    independent_whiten: false,
    whiten_start: 0.82,
    whiten_span: 0.18,
    ink_cutoff: 0.65,
    ink_gamma: 0.50,
    grayscale: false,
    unsharp_amount: 0.45,
};

const CLEAN_SPEC: ToneFilterSpec = ToneFilterSpec {
    grid_divisor: 32,
    step_min: 16,
    step_max: 48,
    bg_floor: 35.0,
    deyellow_blue: false,
    chroma_min: 18.0,
    chroma_max_ratio: 0.90,
    chroma_boost: 1.40,
    independent_whiten: false,
    whiten_start: 0.78,
    whiten_span: 0.22,
    ink_cutoff: 0.60,
    ink_gamma: 0.65,
    grayscale: false,
    unsharp_amount: 0.55,
};

const VIBRANT_SPEC: ToneFilterSpec = ToneFilterSpec {
    grid_divisor: 32,
    step_min: 16,
    step_max: 48,
    bg_floor: 40.0,
    deyellow_blue: false,
    chroma_min: 15.0,
    chroma_max_ratio: f32::INFINITY,
    chroma_boost: 1.45,
    independent_whiten: true,
    whiten_start: 0.86,
    whiten_span: 0.14,
    ink_cutoff: 0.0,
    ink_gamma: 1.0,
    grayscale: false,
    unsharp_amount: 0.35,
};

const GRAYSCALE_SPEC: ToneFilterSpec = ToneFilterSpec {
    grayscale: true,
    ..MAGIC_SPEC
};

const VINTAGE_SPEC: ToneFilterSpec = ToneFilterSpec {
    grid_divisor: 32,
    step_min: 16,
    step_max: 48,
    bg_floor: 36.0,
    deyellow_blue: true,
    chroma_min: f32::INFINITY,
    chroma_max_ratio: 0.0,
    chroma_boost: 1.0,
    independent_whiten: false,
    whiten_start: 0.82,
    whiten_span: 0.18,
    ink_cutoff: 0.65,
    ink_gamma: 0.55,
    grayscale: false,
    unsharp_amount: 0.40,
};

fn compute_illumination_grid(
    rgba: &[u8],
    width: usize,
    height: usize,
    step: usize,
) -> (Vec<f32>, usize, usize) {
    let grid_w = width.div_ceil(step);
    let grid_h = height.div_ceil(step);
    let mut raw = vec![50.0f32; grid_w * grid_h];

    for gy in 0..grid_h {
        let y0 = gy * step;
        let y1 = (y0 + step).min(height);
        for gx in 0..grid_w {
            let x0 = gx * step;
            let x1 = (x0 + step).min(width);
            let mut max_lum = 0.0f32;

            let mut y = y0;
            while y < y1 {
                let row = y * width;
                let mut x = x0;
                while x < x1 {
                    let idx = (row + x) * 4;
                    let lum = 0.299 * (rgba[idx] as f32)
                        + 0.587 * (rgba[idx + 1] as f32)
                        + 0.114 * (rgba[idx + 2] as f32);
                    if lum > max_lum {
                        max_lum = lum;
                    }
                    x += 2;
                }
                y += 2;
            }
            raw[gy * grid_w + gx] = max_lum.max(50.0);
        }
    }

    let mut pass1 = vec![0.0f32; grid_w * grid_h];
    for gy in 0..grid_h {
        let row = gy * grid_w;
        for gx in 0..grid_w {
            let prev = raw[row + gx.saturating_sub(1)];
            let curr = raw[row + gx];
            let next = raw[row + (gx + 1).min(grid_w - 1)];
            pass1[row + gx] = 0.25 * prev + 0.5 * curr + 0.25 * next;
        }
    }

    let mut pass2 = vec![0.0f32; grid_w * grid_h];
    for gy in 0..grid_h {
        let prev_row = gy.saturating_sub(1) * grid_w;
        let curr_row = gy * grid_w;
        let next_row = (gy + 1).min(grid_h - 1) * grid_w;
        for gx in 0..grid_w {
            pass2[curr_row + gx] = 0.25 * pass1[prev_row + gx]
                + 0.5 * pass1[curr_row + gx]
                + 0.25 * pass1[next_row + gx];
        }
    }

    (pass2, grid_w, grid_h)
}

#[inline(always)]
fn sample_grid(grid: &[f32], grid_w: usize, grid_h: usize, x: usize, y: usize, step: usize) -> f32 {
    let gx_f = (x as f32) / (step as f32);
    let gy_f = (y as f32) / (step as f32);
    let gx0 = (gx_f as usize).min(grid_w - 1);
    let gy0 = (gy_f as usize).min(grid_h - 1);
    let gx1 = (gx0 + 1).min(grid_w - 1);
    let gy1 = (gy0 + 1).min(grid_h - 1);
    let tx = gx_f - (gx0 as f32);
    let ty = gy_f - (gy0 as f32);

    let b00 = grid[gy0 * grid_w + gx0];
    let b10 = grid[gy0 * grid_w + gx1];
    let b01 = grid[gy1 * grid_w + gx0];
    let b11 = grid[gy1 * grid_w + gx1];

    (b00 * (1.0 - tx) + b10 * tx) * (1.0 - ty) + (b01 * (1.0 - tx) + b11 * tx) * ty
}

fn unsharp_mask_rgba(rgba: &mut [u8], width: usize, height: usize, amount: f32) {
    if width < 3 || height < 3 {
        return;
    }
    let copy = rgba.to_vec();
    let row_stride = width * 4;

    for y in 1..(height - 1) {
        let row = y * row_stride;
        let prev_row = row - row_stride;
        let next_row = row + row_stride;
        for x in 1..(width - 1) {
            let idx = row + x * 4;
            let lum = 0.299 * (copy[idx] as f32)
                + 0.587 * (copy[idx + 1] as f32)
                + 0.114 * (copy[idx + 2] as f32);
            if lum > 250.0 {
                continue;
            }
            let left = idx - 4;
            let right = idx + 4;
            let up = prev_row + x * 4;
            let down = next_row + x * 4;

            for c in 0..3 {
                let val = copy[idx + c] as f32;
                let lap = 4.0 * val
                    - (copy[left + c] as f32)
                    - (copy[right + c] as f32)
                    - (copy[up + c] as f32)
                    - (copy[down + c] as f32);
                rgba[idx + c] = clamp_u8(val + lap * amount);
            }
        }
    }
}

fn apply_tone_spec(rgba: &mut [u8], width: usize, height: usize, spec: ToneFilterSpec) {
    let step = (width.min(height) / spec.grid_divisor).clamp(spec.step_min, spec.step_max);
    let (grid, gw, gh) = compute_illumination_grid(rgba, width, height, step);

    for y in 0..height {
        for x in 0..width {
            let bg_lum = sample_grid(&grid, gw, gh, x, y, step);
            let idx = (y * width + x) * 4;
            let r = rgba[idx] as f32;
            let g = rgba[idx + 1] as f32;
            let mut b = rgba[idx + 2] as f32;

            if spec.deyellow_blue {
                let rg_avg = (r + g) * 0.5;
                if rg_avg > b + 20.0 {
                    b = (b + (rg_avg - b) * 0.75).min(255.0);
                }
            }

            let scale = 255.0 / bg_lum.max(spec.bg_floor);
            let mut nr = r * scale;
            let mut ng = g * scale;
            let mut nb = b * scale;

            let lum = 0.299 * nr + 0.587 * ng + 0.114 * nb;
            let chroma = r.max(g).max(b) - r.min(g).min(b);
            let bg_ratio = lum / 255.0;

            let boosted_chroma = chroma > spec.chroma_min && bg_ratio < spec.chroma_max_ratio;
            if boosted_chroma {
                let mean = (nr + ng + nb) / 3.0;
                nr = mean + (nr - mean) * spec.chroma_boost;
                ng = mean + (ng - mean) * spec.chroma_boost;
                nb = mean + (nb - mean) * spec.chroma_boost;
            }

            if !boosted_chroma || spec.independent_whiten {
                if bg_ratio >= spec.whiten_start {
                    let h = smoothstep01((bg_ratio - spec.whiten_start) / spec.whiten_span);
                    nr = nr * (1.0 - h) + 255.0 * h;
                    ng = ng * (1.0 - h) + 255.0 * h;
                    nb = nb * (1.0 - h) + 255.0 * h;
                } else if spec.ink_cutoff > 0.0 && bg_ratio < spec.ink_cutoff {
                    let ink = (bg_ratio / spec.ink_cutoff).max(0.0).powf(spec.ink_gamma);
                    nr *= ink;
                    ng *= ink;
                    nb *= ink;
                }
            }

            if spec.grayscale {
                let gray = clamp_u8(0.299 * nr + 0.587 * ng + 0.114 * nb);
                rgba[idx] = gray;
                rgba[idx + 1] = gray;
                rgba[idx + 2] = gray;
            } else {
                rgba[idx] = clamp_u8(nr);
                rgba[idx + 1] = clamp_u8(ng);
                rgba[idx + 2] = clamp_u8(nb);
            }
        }
    }

    unsharp_mask_rgba(rgba, width, height, spec.unsharp_amount);
}

fn apply_bw_despeckle(rgba: &mut [u8], width: usize, height: usize) {
    let step = (width.min(height) / 32).clamp(16, 48);
    let (grid, gw, gh) = compute_illumination_grid(rgba, width, height, step);
    for y in 0..height {
        for x in 0..width {
            let bg_lum = sample_grid(&grid, gw, gh, x, y, step);
            let idx = (y * width + x) * 4;
            let lum = 0.299 * (rgba[idx] as f32)
                + 0.587 * (rgba[idx + 1] as f32)
                + 0.114 * (rgba[idx + 2] as f32);
            let val = if lum < bg_lum * 0.82 { 0 } else { 255 };
            rgba[idx] = val;
            rgba[idx + 1] = val;
            rgba[idx + 2] = val;
        }
    }
    if width >= 3 && height >= 3 {
        let row_stride = width * 4;
        for y in 1..(height - 1) {
            let row = y * row_stride;
            let prev_row = row - row_stride;
            let next_row = row + row_stride;
            for x in 1..(width - 1) {
                let idx = row + x * 4;
                if rgba[idx] == 0
                    && rgba[prev_row + x * 4] == 255
                    && rgba[next_row + x * 4] == 255
                    && rgba[idx - 4] == 255
                    && rgba[idx + 4] == 255
                {
                    rgba[idx] = 255;
                    rgba[idx + 1] = 255;
                    rgba[idx + 2] = 255;
                }
            }
        }
    }
}

pub fn apply_filter_rgba_slice(rgba: &mut [u8], width: usize, height: usize, filter_id: u32) -> bool {
    if width.min(height) == 0 || rgba.len() < width * height * 4 {
        return false;
    }

    match filter_id {
        1 => {
            apply_tone_spec(rgba, width, height, MAGIC_SPEC);
            true
        }
        2 => {
            apply_tone_spec(rgba, width, height, CLEAN_SPEC);
            true
        }
        3 => {
            apply_tone_spec(rgba, width, height, VIBRANT_SPEC);
            true
        }
        4 => {
            apply_bw_despeckle(rgba, width, height);
            true
        }
        5 => {
            apply_tone_spec(rgba, width, height, GRAYSCALE_SPEC);
            true
        }
        6 => {
            apply_tone_spec(rgba, width, height, VINTAGE_SPEC);
            true
        }
        _ => false,
    }
}

/// Applies scanner enhancement filter `filter_id` in place on an RGBA buffer.
///
/// # Safety
/// `ptr` must point to at least `width * height * 4` valid writable bytes.
#[no_mangle]
pub unsafe extern "C" fn otium_apply_filter_rgba(
    ptr: *mut u8,
    width: u32,
    height: u32,
    filter_id: u32,
) -> i32 {
    if ptr.is_null() || width == 0 || height == 0 {
        return -1;
    }
    let Some(pixels) = (width as usize).checked_mul(height as usize) else {
        return -1;
    };
    if pixels > MAX_PIXELS {
        return -1;
    }
    let rgba = unsafe { slice::from_raw_parts_mut(ptr, pixels * 4) };
    if apply_filter_rgba_slice(rgba, width as usize, height as usize, filter_id) {
        0
    } else {
        -1
    }
}
