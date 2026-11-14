#![no_std]

/// Solve a projective mapping between four corresponding points using partial pivoting.
#[inline]
pub fn homography(
    src: [(f64, f64); 4],
    dst: [(f64, f64); 4],
    pivot_epsilon: f64,
) -> Option<[f64; 9]> {
    let mut a = [[0.0f64; 8]; 8];
    let mut b = [0.0f64; 8];

    for i in 0..4 {
        let (sx, sy) = src[i];
        let (dx, dy) = dst[i];
        let r1 = i * 2;
        a[r1] = [sx, sy, 1.0, 0.0, 0.0, 0.0, -dx * sx, -dx * sy];
        b[r1] = dx;
        let r2 = r1 + 1;
        a[r2] = [0.0, 0.0, 0.0, sx, sy, 1.0, -dy * sx, -dy * sy];
        b[r2] = dy;
    }

    for col in 0..8 {
        let mut pivot = col;
        let mut max_val = a[col][col].abs();
        for (row, a_row) in a.iter().enumerate().skip(col + 1) {
            let v = a_row[col].abs();
            if v > max_val {
                max_val = v;
                pivot = row;
            }
        }
        if max_val < pivot_epsilon {
            return None;
        }
        if pivot != col {
            a.swap(col, pivot);
            b.swap(col, pivot);
        }
        let diag = a[col][col];
        let pivot_row = a[col];
        for row in (col + 1)..8 {
            let factor = a[row][col] / diag;
            if factor != 0.0 {
                for (dst_cell, pivot_cell) in a[row][col..].iter_mut().zip(&pivot_row[col..]) {
                    *dst_cell -= factor * *pivot_cell;
                }
                b[row] -= factor * b[col];
            }
        }
    }

    let mut h = [0.0f64; 8];
    for row in (0..8).rev() {
        let mut sum = b[row];
        for k in (row + 1)..8 {
            sum -= a[row][k] * h[k];
        }
        h[row] = sum / a[row][row];
    }

    Some([h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1.0])
}

/// Byte offsets of the four RGBA pixels surrounding an in-bounds sample.
#[inline]
pub fn rgba_neighbors(x: usize, y: usize, stride: usize) -> [usize; 4] {
    let top_left = y * stride + x * 4;
    let bottom_left = top_left + stride;
    [top_left, top_left + 4, bottom_left, bottom_left + 4]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maps_a_rectangle_to_a_perspective_quad() {
        let rect = [(0.0, 0.0), (10.0, 0.0), (10.0, 8.0), (0.0, 8.0)];
        let quad = [(1.0, 2.0), (7.0, 0.0), (9.0, 8.0), (0.0, 6.0)];
        let m = homography(rect, quad, 1e-10).unwrap();
        for ((x, y), (expected_x, expected_y)) in rect.into_iter().zip(quad) {
            let z = m[6] * x + m[7] * y + m[8];
            assert!(((m[0] * x + m[1] * y + m[2]) / z - expected_x).abs() < 1e-10);
            assert!(((m[3] * x + m[4] * y + m[5]) / z - expected_y).abs() < 1e-10);
        }
        assert!(homography([(0.0, 0.0); 4], quad, 1e-10).is_none());
    }
}
