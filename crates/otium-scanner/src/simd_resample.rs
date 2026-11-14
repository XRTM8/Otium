/// High-speed bilinear image resampler operating directly on flat RGBA byte buffers.
/// Uses precomputed fixed-point horizontal interpolation tables and SIMD-friendly linear memory passes.
pub struct FastResampler;

#[derive(Clone, Copy)]
struct ColWeight {
    x0: usize,
    x1: usize,
    weight: u32,     // 0..256 fixed point
    inv_weight: u32, // 256 - weight
}

impl FastResampler {
    /// Resizes an RGBA8 image buffer from (src_w, src_h) to (dst_w, dst_h) in linear memory
    pub fn resample_rgba(
        src: &[u8],
        src_w: u32,
        src_h: u32,
        dst_w: u32,
        dst_h: u32,
    ) -> Vec<u8> {
        let (src_w, src_h) = (src_w as usize, src_h as usize);
        let (dst_w, dst_h) = (dst_w as usize, dst_h as usize);

        if src_w == 0 || src_h == 0 || dst_w == 0 || dst_h == 0 {
            return Vec::new();
        }

        let mut dst = vec![255u8; dst_w * dst_h * 4];
        let src_stride = src_w * 4;
        let dst_stride = dst_w * 4;

        // 1. Precalculate horizontal column mapping and fixed-point weights (0..256)
        let scale_x = src_w as f32 / dst_w as f32;
        let mut col_weights = Vec::with_capacity(dst_w);

        for dx in 0..dst_w {
            let sx = (dx as f32 + 0.5) * scale_x - 0.5;
            let sx = sx.max(0.0);
            let x0 = sx.floor() as usize;
            let x1 = (x0 + 1).min(src_w - 1);
            let fx = sx - x0 as f32;
            let weight = (fx * 256.0).round() as u32;
            let inv_weight = 256 - weight;

            col_weights.push(ColWeight {
                x0: x0 * 4,
                x1: x1 * 4,
                weight,
                inv_weight,
            });
        }

        // 2. Row-by-row bilinear interpolation pass
        let scale_y = src_h as f32 / dst_h as f32;

        for dy in 0..dst_h {
            let sy = (dy as f32 + 0.5) * scale_y - 0.5;
            let sy = sy.max(0.0);
            let y0 = sy.floor() as usize;
            let y1 = (y0 + 1).min(src_h - 1);
            let fy = sy - y0 as f32;
            let w_y1 = (fy * 256.0).round() as u32;
            let w_y0 = 256 - w_y1;

            let row0_offset = y0 * src_stride;
            let row1_offset = y1 * src_stride;
            let dst_row_offset = dy * dst_stride;

            for (dx, col) in col_weights.iter().enumerate() {
                let dst_pixel_offset = dst_row_offset + dx * 4;

                let idx00 = row0_offset + col.x0;
                let idx10 = row0_offset + col.x1;
                let idx01 = row1_offset + col.x0;
                let idx11 = row1_offset + col.x1;

                // 4-channel RGBA interpolation with fixed-point arithmetic
                for c in 0..4 {
                    let p00 = src[idx00 + c] as u32;
                    let p10 = src[idx10 + c] as u32;
                    let p01 = src[idx01 + c] as u32;
                    let p11 = src[idx11 + c] as u32;

                    let top = p00 * col.inv_weight + p10 * col.weight;
                    let bottom = p01 * col.inv_weight + p11 * col.weight;
                    let val = (top * w_y0 + bottom * w_y1) >> 16;

                    dst[dst_pixel_offset + c] = val.min(255) as u8;
                }
            }
        }

        dst
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_fast_resample() {
        let src = vec![
            255, 0, 0, 255,   0, 255, 0, 255,
            0, 0, 255, 255,   255, 255, 255, 255,
        ]; // 2x2 image
        let dst = FastResampler::resample_rgba(&src, 2, 2, 4, 4);
        assert_eq!(dst.len(), 4 * 4 * 4);
    }
}
