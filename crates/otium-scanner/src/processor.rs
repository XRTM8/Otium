use image::{DynamicImage, GrayImage, ImageBuffer, Rgba, RgbaImage};

use crate::geometry::{HomographyMatrix, Point2D, QuadCorners};
use otium_core::{OtiumError, Result};

pub struct DocumentScanner;

impl DocumentScanner {
    /// Warp a quadrilateral document region into a rectified rectangular image using
    /// bilinear interpolation with optimized contiguous row buffer layout.
    pub fn warp_perspective(
        image: &DynamicImage,
        corners: &QuadCorners,
        target_dimensions: Option<(u32, u32)>,
    ) -> Result<RgbaImage> {
        let (dst_w, dst_h) = target_dimensions
            .unwrap_or_else(|| corners.estimate_target_dimensions());

        if dst_w == 0 || dst_h == 0 {
            return Err(OtiumError::ImageProcessing("Invalid zero dimensions".into()));
        }

        let homography = HomographyMatrix::from_rect_to_quad(corners, dst_w as f32, dst_h as f32)
            .ok_or_else(|| OtiumError::ImageProcessing("Singular quad corners matrix".into()))?;

        let src_rgba = image.to_rgba8();
        let (src_w, src_h) = src_rgba.dimensions();
        let src_stride = (src_w * 4) as usize;
        let src_raw = src_rgba.as_raw();

        let max_x_bound = (src_w - 1) as f32;
        let max_y_bound = (src_h - 1) as f32;

        let total_pixels = (dst_w as usize) * (dst_h as usize);
        let mut out_buffer: Vec<u8> = vec![255u8; total_pixels * 4];

        for y in 0..dst_h {
            let row_offset = (y as usize) * (dst_w as usize) * 4;

            for x in 0..dst_w {
                let pixel_offset = row_offset + (x as usize) * 4;
                let src_pt = homography.transform_point(Point2D::new(x as f32, y as f32));
                let sx = src_pt.x;
                let sy = src_pt.y;

                if sx >= 0.0 && sx < max_x_bound && sy >= 0.0 && sy < max_y_bound {
                    let x0 = sx as usize;
                    let y0 = sy as usize;

                    let fx = sx - (x0 as f32);
                    let fy = sy - (y0 as f32);
                    let inv_fx = 1.0 - fx;
                    let inv_fy = 1.0 - fy;

                    let [idx00, idx10, idx01, idx11] =
                        otium_scan_math::rgba_neighbors(x0, y0, src_stride);

                    for c in 0..4 {
                        let p00 = src_raw[idx00 + c] as f32;
                        let p10 = src_raw[idx10 + c] as f32;
                        let p01 = src_raw[idx01 + c] as f32;
                        let p11 = src_raw[idx11 + c] as f32;

                        let top = inv_fx * p00 + fx * p10;
                        let bottom = inv_fx * p01 + fx * p11;
                        let val = inv_fy * top + fy * bottom;

                        out_buffer[pixel_offset + c] = val.clamp(0.0, 255.0) as u8;
                    }
                } else {
                    // Border / out of bounds pixels set to white
                    out_buffer[pixel_offset] = 255;
                    out_buffer[pixel_offset + 1] = 255;
                    out_buffer[pixel_offset + 2] = 255;
                    out_buffer[pixel_offset + 3] = 255;
                }
            }
        }

        RgbaImage::from_raw(dst_w, dst_h, out_buffer)
            .ok_or_else(|| OtiumError::ImageProcessing("Failed to construct image buffer".into()))
    }

    /// High-performance document clean filter:
    /// Fast integer-based luminance calculations and Otsu adaptive thresholding
    /// to eliminate shadows and whiten paper while preserving crisp text.
    pub fn clean_document_filter(image: &RgbaImage, contrast_boost: f32) -> GrayImage {
        let (width, height) = image.dimensions();
        let total_pixels = (width as usize) * (height as usize);
        if total_pixels == 0 {
            return GrayImage::new(0, 0);
        }

        let raw = image.as_raw();
        let mut histogram = [0u32; 256];
        let mut luma_buffer = Vec::with_capacity(total_pixels);

        // 1. Fast Integer Luminance pass + histogram collection
        for i in (0..raw.len()).step_by(4) {
            let r = raw[i] as u32;
            let g = raw[i + 1] as u32;
            let b = raw[i + 2] as u32;
            // ITU-R BT.601 integer approximation: (r*77 + g*150 + b*29) >> 8
            let luma = ((r * 77 + g * 150 + b * 29) >> 8) as u8;
            histogram[luma as usize] += 1;
            luma_buffer.push(luma);
        }

        // 2. Otsu threshold calculation
        let mut sum = 0f64;
        for (i, &count) in histogram.iter().enumerate() {
            sum += (i as f64) * (count as f64);
        }

        let total = total_pixels as f64;
        let mut sum_b = 0f64;
        let mut w_b = 0f64;
        let mut max_variance = 0f64;
        let mut optimal_threshold = 128u8;

        for (i, &count) in histogram.iter().enumerate() {
            w_b += count as f64;
            if w_b == 0.0 {
                continue;
            }
            let w_f = total - w_b;
            if w_f == 0.0 {
                break;
            }

            sum_b += (i as f64) * (count as f64);
            let m_b = sum_b / w_b;
            let m_f = (sum - sum_b) / w_f;

            let between_variance = w_b * w_f * (m_b - m_f) * (m_b - m_f);
            if between_variance > max_variance {
                max_variance = between_variance;
                optimal_threshold = i as u8;
            }
        }

        // Clamp threshold to reasonable text document bounds
        let threshold = (optimal_threshold as f32).clamp(70.0, 185.0);

        // 3. Contrast stretch and binarization
        let mut out_gray = Vec::with_capacity(total_pixels);
        for luma in luma_buffer {
            let luma_f = luma as f32;
            let pixel_val = if luma_f < threshold {
                let ratio = (luma_f / threshold).powf(contrast_boost);
                (ratio * 110.0).clamp(0.0, 255.0) as u8
            } else {
                255u8
            };
            out_gray.push(pixel_val);
        }

        GrayImage::from_raw(width, height, out_gray)
            .unwrap_or_else(|| GrayImage::new(width, height))
    }

    /// Combine front and back sides of an ID card onto a clean standard A4 page layout (2480 x 3508 at 300 DPI)
    /// Accelerated with linear fixed-point SIMD-friendly resampling.
    pub fn stitch_id_card_a4(front: &RgbaImage, back: &RgbaImage) -> RgbaImage {
        const A4_WIDTH: u32 = 2480;
        const A4_HEIGHT: u32 = 3508;

        let mut a4_canvas: RgbaImage = ImageBuffer::from_pixel(A4_WIDTH, A4_HEIGHT, Rgba([255, 255, 255, 255]));

        // Standard ID card size at 300 DPI: ~1010 x 640 px (85.6mm x 53.98mm)
        let target_card_w = 1010;
        let target_card_h = 640;

        let (fw, fh) = front.dimensions();
        let front_raw = crate::simd_resample::FastResampler::resample_rgba(
            front.as_raw(), fw, fh, target_card_w, target_card_h,
        );
        let resized_front = RgbaImage::from_raw(target_card_w, target_card_h, front_raw)
            .unwrap_or_else(|| front.clone());

        let (bw, bh) = back.dimensions();
        let back_raw = crate::simd_resample::FastResampler::resample_rgba(
            back.as_raw(), bw, bh, target_card_w, target_card_h,
        );
        let resized_back = RgbaImage::from_raw(target_card_w, target_card_h, back_raw)
            .unwrap_or_else(|| back.clone());

        // Center front card on upper half of page
        let pos_x = (A4_WIDTH - target_card_w) / 2;
        let pos_front_y = (A4_HEIGHT / 3) - (target_card_h / 2);
        image::imageops::overlay(&mut a4_canvas, &resized_front, pos_x as i64, pos_front_y as i64);

        // Center back card on lower half of page
        let pos_back_y = (2 * A4_HEIGHT / 3) - (target_card_h / 2);
        image::imageops::overlay(&mut a4_canvas, &resized_back, pos_x as i64, pos_back_y as i64);

        a4_canvas
    }
}
