pub mod geometry;
pub mod processor;
pub mod simd_resample;
pub mod tiler;

pub use geometry::*;
pub use processor::*;
pub use simd_resample::*;
pub use tiler::*;

#[cfg(test)]
mod tests {
    use super::*;
    use image::{ImageBuffer, Rgba};

    #[test]
    fn test_quad_dimensions_estimation() {
        let quad = QuadCorners::new(
            Point2D::new(0.0, 0.0),
            Point2D::new(800.0, 0.0),
            Point2D::new(800.0, 600.0),
            Point2D::new(0.0, 600.0),
        );
        let (w, h) = quad.estimate_target_dimensions();
        assert_eq!(w, 800);
        assert_eq!(h, 600);
    }

    #[test]
    fn test_clean_document_filter() {
        let mut img = ImageBuffer::new(100, 100);
        for pixel in img.pixels_mut() {
            *pixel = Rgba([200, 200, 200, 255]); // Light gray
        }
        let clean = DocumentScanner::clean_document_filter(&img, 1.2);
        assert_eq!(clean.dimensions(), (100, 100));
    }

    #[test]
    fn test_id_card_stitching() {
        let front = ImageBuffer::from_pixel(200, 120, Rgba([10, 20, 30, 255]));
        let back = ImageBuffer::from_pixel(200, 120, Rgba([40, 50, 60, 255]));
        let a4 = DocumentScanner::stitch_id_card_a4(&front, &back);
        assert_eq!(a4.dimensions(), (2480, 3508));
    }
}
