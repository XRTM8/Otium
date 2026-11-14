use bytemuck::{Pod, Zeroable};
use serde::{Deserialize, Serialize};

use crate::stroke::Stroke;

/// Hardware-accelerated GPU Vertex representation (24 bytes packed, repr(C) for direct VRAM upload)
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize, Pod, Zeroable)]
#[repr(C)]
pub struct InkVertex {
    /// 2D screen coordinate [x, y] in points/pixels
    pub position: [f32; 2],
    /// Extrusion normal vector [nx, ny] for GPU shader anti-aliasing
    pub normal: [f32; 2],
    /// Variable stroke width adjusted by pen pressure
    pub width: f32,
    /// Alpha channel opacity (0.0 to 1.0)
    pub opacity: f32,
}

impl InkVertex {
    pub const fn new(x: f32, y: f32, nx: f32, ny: f32, width: f32, opacity: f32) -> Self {
        Self {
            position: [x, y],
            normal: [nx, ny],
            width,
            opacity,
        }
    }
}

/// GPU Triangle Mesh containing flat vertex and index buffers
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct InkMesh {
    pub vertices: Vec<InkVertex>,
    pub indices: Vec<u32>,
    pub color_rgba: [u8; 4],
}

impl InkMesh {
    pub fn new(color_rgba: [u8; 4]) -> Self {
        Self {
            vertices: Vec::new(),
            indices: Vec::new(),
            color_rgba,
        }
    }

    /// Total number of triangles in the generated mesh
    #[inline]
    pub fn triangle_count(&self) -> usize {
        self.indices.len() / 3
    }

    /// Size of the raw vertex buffer in bytes
    #[inline]
    pub fn vertex_buffer_size_bytes(&self) -> usize {
        self.vertices.len() * std::mem::size_of::<InkVertex>()
    }

    /// Zero-copy cast of vertex data into raw byte slice for GPU upload (0.00ns overhead)
    #[inline]
    pub fn as_bytes(&self) -> &[u8] {
        bytemuck::cast_slice(&self.vertices)
    }

    /// Zero-copy cast of index buffer data into raw byte slice for GPU upload
    #[inline]
    pub fn indices_as_bytes(&self) -> &[u8] {
        bytemuck::cast_slice(&self.indices)
    }
}

pub struct InkTessellator;

impl InkTessellator {
    /// Parse hex color string "#RRGGBB" into raw RGBA bytes
    pub fn parse_hex_color(hex: &str, opacity: f32) -> [u8; 4] {
        let hex = hex.trim_start_matches('#');
        let (r, g, b) = if hex.len() >= 6 {
            let r = u8::from_str_radix(&hex[0..2], 16).unwrap_or(0);
            let g = u8::from_str_radix(&hex[2..4], 16).unwrap_or(0);
            let b = u8::from_str_radix(&hex[4..6], 16).unwrap_or(0);
            (r, g, b)
        } else {
            (16, 185, 129) // Default Emerald accent
        };
        let a = (opacity.clamp(0.0, 1.0) * 255.0) as u8;
        [r, g, b, a]
    }

    /// High-speed CPU tessellation: turns stroke spline into indexed triangle strips
    /// for instant sub-millisecond drawing on GPU (DirectX 12 / Vulkan / Metal).
    pub fn tessellate_stroke(stroke: &Stroke) -> InkMesh {
        let color = Self::parse_hex_color(&stroke.color_hex, stroke.opacity);
        let mut mesh = InkMesh::new(color);

        let n = stroke.points.len();
        if n == 0 {
            return mesh;
        }

        // 1. Single-point dot: tessellate as an 8-sided round disc
        if n == 1 {
            let p = &stroke.points[0];
            let radius = stroke.base_width * p.pressure.max(0.3) / 2.0;
            let center_idx = 0u32;
            mesh.vertices.push(InkVertex::new(p.x, p.y, 0.0, 0.0, radius, stroke.opacity));

            const SEGMENTS: usize = 8;
            for i in 0..SEGMENTS {
                let theta = (i as f32) * (std::f32::consts::PI * 2.0 / SEGMENTS as f32);
                let (sin_t, cos_t) = theta.sin_cos();
                mesh.vertices.push(InkVertex::new(
                    p.x + cos_t * radius,
                    p.y + sin_t * radius,
                    cos_t,
                    sin_t,
                    radius,
                    stroke.opacity,
                ));
            }

            for i in 1..=SEGMENTS {
                let next = if i == SEGMENTS { 1 } else { i + 1 };
                mesh.indices.extend_from_slice(&[center_idx, i as u32, next as u32]);
            }

            return mesh;
        }

        // 2. Multi-point stroke: compute normals along path tangents and extrude left/right vertices
        mesh.vertices.reserve(n * 2);
        mesh.indices.reserve((n - 1) * 6);

        let mut normals = Vec::with_capacity(n);

        for i in 0..n {
            let p0 = if i == 0 { &stroke.points[0] } else { &stroke.points[i - 1] };
            let p1 = if i + 1 >= n { &stroke.points[n - 1] } else { &stroke.points[i + 1] };

            let dx = p1.x - p0.x;
            let dy = p1.y - p0.y;
            let len = (dx * dx + dy * dy).sqrt();

            let (nx, ny) = if len > 0.0001 {
                (-dy / len, dx / len)
            } else {
                (0.0, 1.0)
            };

            normals.push((nx, ny));
        }

        for (i, (p, &(nx, ny))) in stroke.points.iter().zip(normals.iter()).enumerate() {
            let width = stroke.base_width * p.pressure.clamp(0.2, 1.5);
            let half_w = width / 2.0;

            // Left vertex (+normal)
            mesh.vertices.push(InkVertex::new(
                p.x + nx * half_w,
                p.y + ny * half_w,
                nx,
                ny,
                width,
                stroke.opacity,
            ));

            // Right vertex (-normal)
            mesh.vertices.push(InkVertex::new(
                p.x - nx * half_w,
                p.y - ny * half_w,
                -nx,
                -ny,
                width,
                stroke.opacity,
            ));

            // Connect quad with 2 triangles
            if i > 0 {
                let prev_left = ((i - 1) * 2) as u32;
                let prev_right = prev_left + 1;
                let curr_left = (i * 2) as u32;
                let curr_right = curr_left + 1;

                // Triangle 1
                mesh.indices.push(prev_left);
                mesh.indices.push(prev_right);
                mesh.indices.push(curr_left);

                // Triangle 2
                mesh.indices.push(prev_right);
                mesh.indices.push(curr_right);
                mesh.indices.push(curr_left);
            }
        }

        mesh
    }
}
