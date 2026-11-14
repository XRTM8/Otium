pub mod filters;
pub mod geometry;
pub mod memory;
pub mod vision;

pub use filters::{apply_filter_rgba_slice, otium_apply_filter_rgba};
pub use geometry::{
    dewarp_spine_rgba_slice, otium_dewarp_spine_rgba, otium_simplify_polyline_f32,
    otium_warp_perspective_rgba, simplify_polyline_xy_slice, warp_perspective_rgba_slice,
};
pub use memory::{otium_alloc, otium_dealloc};
pub use vision::otium_motion_and_sharpness_rgba;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn clean_filter_whitens_paper_and_darkens_ink() {
        let w = 8;
        let h = 8;
        let mut rgba = vec![255u8; w * h * 4];
        for px in rgba.as_chunks_mut::<4>().0 {
            px[0] = 190;
            px[1] = 190;
            px[2] = 190;
            px[3] = 255;
        }
        let ink = (3 * w + 3) * 4;
        rgba[ink] = 45;
        rgba[ink + 1] = 45;
        rgba[ink + 2] = 45;

        assert!(apply_filter_rgba_slice(&mut rgba, w, h, 2));
        assert_eq!(rgba[0], 255);
        assert!(rgba[ink] < 110);
    }

    #[test]
    fn tone_filters_magic_vibrant_bw_gray_vintage_succeed() {
        for filter_id in [1u32, 2, 3, 4, 5, 6] {
            let w = 8;
            let h = 8;
            let mut rgba = vec![200u8; w * h * 4];
            let ink = (2 * w + 2) * 4;
            rgba[ink] = 30;
            rgba[ink + 1] = 35;
            rgba[ink + 2] = 40;
            assert!(apply_filter_rgba_slice(&mut rgba, w, h, filter_id));
        }
        let mut small = vec![0u8; 16];
        assert!(!apply_filter_rgba_slice(&mut small, 2, 2, 99));
    }

    #[test]
    fn warp_perspective_preserves_aligned_rectangle() {
        let w = 4usize;
        let h = 4usize;
        let mut src = vec![255u8; w * h * 4];
        src[0] = 12;
        src[1] = 34;
        src[2] = 56;
        let mut dst = vec![0u8; w * h * 4];
        let corners = [0.0, 0.0, 4.0, 0.0, 4.0, 4.0, 0.0, 4.0];
        assert!(warp_perspective_rgba_slice(&src, w, h, &mut dst, w, h, &corners));
        assert_eq!(&dst[0..4], &[12, 34, 56, 255]);
    }

    #[test]
    fn dewarp_zero_curvature_is_identity() {
        let w = 4usize;
        let h = 4usize;
        let mut src = vec![0u8; w * h * 4];
        for i in 0..(w * h) {
            src[i * 4] = (i * 11) as u8;
            src[i * 4 + 1] = (i * 7) as u8;
            src[i * 4 + 2] = (i * 3) as u8;
            src[i * 4 + 3] = 255;
        }
        let mut dst = vec![0u8; w * h * 4];
        assert!(dewarp_spine_rgba_slice(&src, w, h, &mut dst, 0.0, 0.5));
        assert_eq!(src, dst);
    }

    #[test]
    fn warp_perspective_handles_trapezoid_projection() {
        let w = 16usize;
        let h = 16usize;
        let mut src = vec![255u8; w * h * 4];
        for y in 6..10 {
            for x in 6..10 {
                let p = (y * w + x) * 4;
                src[p] = 16;
                src[p + 1] = 24;
                src[p + 2] = 32;
            }
        }
        let mut dst = vec![0u8; 8 * 8 * 4];
        let corners = [3.0, 3.0, 13.0, 2.0, 14.0, 13.0, 2.0, 14.0];
        assert!(warp_perspective_rgba_slice(&src, w, h, &mut dst, 8, 8, &corners));
        assert_eq!(dst[3], 255);
        assert!(dst[0] > 200);
        let mid = (4 * 8 + 4) * 4;
        assert_eq!(dst[mid + 3], 255);
        assert!(dst[mid] < 80);
    }

    #[test]
    fn motion_and_sharpness_computes_stability_and_sharpness() {
        let w = 8u32;
        let h = 8u32;
        let pixels = (w * h) as usize;
        let mut frame = vec![0u8; pixels * 4];
        for y in 0..h {
            for x in 0..w {
                let v = if ((x + y) & 1) == 0 { 240u8 } else { 20u8 };
                let p = ((y * w + x) as usize) * 4;
                frame[p] = v;
                frame[p + 1] = v;
                frame[p + 2] = v;
                frame[p + 3] = 255;
            }
        }
        let mut prev_lum = vec![0u8; pixels];
        let mut metrics = [0.0f32; 2];

        assert_eq!(
            unsafe {
                otium_motion_and_sharpness_rgba(
                    frame.as_ptr(),
                    prev_lum.as_mut_ptr(),
                    0,
                    w,
                    h,
                    metrics.as_mut_ptr(),
                )
            },
            0
        );
        assert_eq!(metrics[0], 0.0);
        assert!(metrics[1] > 1000.0);

        assert_eq!(
            unsafe {
                otium_motion_and_sharpness_rgba(
                    frame.as_ptr(),
                    prev_lum.as_mut_ptr(),
                    1,
                    w,
                    h,
                    metrics.as_mut_ptr(),
                )
            },
            0
        );
        assert!(metrics[0] < 0.01);

        for px in frame.as_chunks_mut::<4>().0 {
            px[0] = 255 - px[0];
            px[1] = 255 - px[1];
            px[2] = 255 - px[2];
        }
        assert_eq!(
            unsafe {
                otium_motion_and_sharpness_rgba(
                    frame.as_ptr(),
                    prev_lum.as_mut_ptr(),
                    1,
                    w,
                    h,
                    metrics.as_mut_ptr(),
                )
            },
            0
        );
        assert!(metrics[0] > 150.0);
    }

    #[test]
    fn simplify_polyline_keeps_endpoints_and_corners() {
        let mut pts = [0.0f32, 0.0, 2.0, 0.0, 5.0, 0.0, 5.0, 3.0, 5.0, 6.0];
        let count = simplify_polyline_xy_slice(&mut pts, 0.25);
        assert_eq!(count, 3);
        assert_eq!(&pts[0..6], &[0.0, 0.0, 5.0, 0.0, 5.0, 6.0]);
    }
}
