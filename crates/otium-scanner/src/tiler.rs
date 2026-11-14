/// 2D tile coordinate in spatial partition grid
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct TileCoord {
    pub col: u32,
    pub row: u32,
}

/// Pixel bounding box of a tile in source image space
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct TileBounds {
    pub x: u32,
    pub y: u32,
    pub width: u32,
    pub height: u32,
}

/// Spatial 256x256 Tile Partitioning & Viewport Frustum Culling Engine.
/// Enables fluid 120 FPS panning and zooming across 4K/8K scans and infinite canvases
/// by processing and buffering only visible sub-tiles within the active viewport.
pub struct SpatialTileGrid {
    pub image_width: u32,
    pub image_height: u32,
    pub tile_size: u32,
    pub num_cols: u32,
    pub num_rows: u32,
}

impl SpatialTileGrid {
    /// Creates a tile grid with standard 256x256 tiles
    pub fn new_256(image_width: u32, image_height: u32) -> Self {
        Self::new(image_width, image_height, 256)
    }

    /// Creates a tile grid with custom tile dimensions
    pub fn new(image_width: u32, image_height: u32, tile_size: u32) -> Self {
        assert!(tile_size > 0, "Tile size must be greater than zero");
        let num_cols = image_width.div_ceil(tile_size);
        let num_rows = image_height.div_ceil(tile_size);

        Self {
            image_width,
            image_height,
            tile_size,
            num_cols,
            num_rows,
        }
    }

    /// Calculates pixel bounding box for a given tile coordinate
    pub fn tile_bounds(&self, coord: TileCoord) -> Option<TileBounds> {
        if coord.col >= self.num_cols || coord.row >= self.num_rows {
            return None;
        }

        let x = coord.col * self.tile_size;
        let y = coord.row * self.tile_size;
        let width = self.tile_size.min(self.image_width.saturating_sub(x));
        let height = self.tile_size.min(self.image_height.saturating_sub(y));

        Some(TileBounds {
            x,
            y,
            width,
            height,
        })
    }

    /// Viewport Frustum Culling: returns only the tiles visible within the screen viewport (vx, vy, vw, vh)
    pub fn visible_tiles(&self, vx: f32, vy: f32, vw: f32, vh: f32) -> Vec<TileCoord> {
        if vw <= 0.0 || vh <= 0.0 || self.image_width == 0 || self.image_height == 0 {
            return Vec::new();
        }

        let min_x = vx.max(0.0) as u32;
        let min_y = vy.max(0.0) as u32;
        let max_x = ((vx + vw).ceil() as u32).min(self.image_width);
        let max_y = ((vy + vh).ceil() as u32).min(self.image_height);

        if min_x >= max_x || min_y >= max_y {
            return Vec::new();
        }

        let start_col = min_x / self.tile_size;
        let end_col = (max_x.saturating_sub(1)) / self.tile_size;
        let start_row = min_y / self.tile_size;
        let end_row = (max_y.saturating_sub(1)) / self.tile_size;

        let total_visible = ((end_col - start_col + 1) * (end_row - start_row + 1)) as usize;
        let mut visible = Vec::with_capacity(total_visible);

        for row in start_row..=end_row {
            for col in start_col..=end_col {
                visible.push(TileCoord { col, row });
            }
        }

        visible
    }

    /// Extracts tile RGBA pixel bytes into a linear output buffer
    pub fn extract_tile_rgba(
        &self,
        src: &[u8],
        coord: TileCoord,
    ) -> Option<Vec<u8>> {
        let bounds = self.tile_bounds(coord)?;
        let src_stride = (self.image_width as usize) * 4;
        let mut dst = vec![0u8; (bounds.width as usize) * (bounds.height as usize) * 4];
        let dst_stride = (bounds.width as usize) * 4;

        for dy in 0..bounds.height as usize {
            let sy = (bounds.y as usize) + dy;
            let src_start = sy * src_stride + (bounds.x as usize) * 4;
            let src_end = src_start + dst_stride;

            if src_end <= src.len() {
                let dst_start = dy * dst_stride;
                let dst_end = dst_start + dst_stride;
                dst[dst_start..dst_end].copy_from_slice(&src[src_start..src_end]);
            }
        }

        Some(dst)
    }

    /// Total tile count
    pub fn total_tiles(&self) -> usize {
        (self.num_cols * self.num_rows) as usize
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_grid_dimensions() {
        // A4 300 DPI: 2480 x 3508
        let grid = SpatialTileGrid::new_256(2480, 3508);
        assert_eq!(grid.tile_size, 256);
        assert_eq!(grid.num_cols, 10); // 2480 / 256 = 9.68 -> 10 cols
        assert_eq!(grid.num_rows, 14); // 3508 / 256 = 13.7 -> 14 rows

        // Last tile bounds
        let last = grid.tile_bounds(TileCoord { col: 9, row: 13 }).unwrap();
        assert_eq!(last.x, 9 * 256); // 2304
        assert_eq!(last.width, 2480 - 2304); // 176
        assert_eq!(last.height, 3508 - (13 * 256)); // 180
    }

    #[test]
    fn test_frustum_culling() {
        let grid = SpatialTileGrid::new_256(1024, 1024);
        // Viewport looking at top-left 300x300 area
        let visible = grid.visible_tiles(0.0, 0.0, 300.0, 300.0);
        // Intersects cols 0..1 and rows 0..1 -> 4 tiles
        assert_eq!(visible.len(), 4);
        assert!(visible.contains(&TileCoord { col: 0, row: 0 }));
        assert!(visible.contains(&TileCoord { col: 1, row: 0 }));
        assert!(visible.contains(&TileCoord { col: 0, row: 1 }));
        assert!(visible.contains(&TileCoord { col: 1, row: 1 }));
    }
}
