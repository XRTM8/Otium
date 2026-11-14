pub mod arena;
pub mod canvas;
pub mod decimate;
pub mod mesh;
pub mod stroke;

pub use arena::*;
pub use canvas::*;
pub use decimate::*;
pub use mesh::*;
pub use stroke::*;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_ink_undo_redo_stack() {
        let mut canvas = InkCanvas::new(1000.0, 1000.0);
        assert_eq!(canvas.strokes.len(), 0);

        let stroke1 = Stroke::new("s1".into(), InkTool::Pen, "#000000".into(), 2.0, 1.0);
        canvas.begin_stroke(stroke1);
        assert_eq!(canvas.strokes.len(), 1);

        let stroke2 = Stroke::new("s2".into(), InkTool::Highlighter, "#FDE68A".into(), 12.0, 0.4);
        canvas.begin_stroke(stroke2);
        assert_eq!(canvas.strokes.len(), 2);

        // Undo
        assert!(canvas.undo());
        assert_eq!(canvas.strokes.len(), 1);
        assert_eq!(canvas.strokes[0].id, "s1");

        // Redo
        assert!(canvas.redo());
        assert_eq!(canvas.strokes.len(), 2);
        assert_eq!(canvas.strokes[1].id, "s2");
    }

    #[test]
    fn test_palm_rejection() {
        // Stylus: small radius (8px), high pressure (0.85) -> Not palm
        assert!(!InkCanvas::is_palm_contact(8.0, 0.85));

        // Palm: large touch radius (35px), low diffuse pressure (0.1) -> Is palm
        assert!(InkCanvas::is_palm_contact(35.0, 0.1));
    }

    #[test]
    fn test_erase_and_undo() {
        let mut canvas = InkCanvas::new(500.0, 500.0);
        let mut s1 = Stroke::new("s1".into(), InkTool::Pen, "#000000".into(), 4.0, 1.0);
        s1.add_point(InkPoint::new(10.0, 10.0, 1.0, 100));
        s1.add_point(InkPoint::new(20.0, 20.0, 1.0, 101));
        canvas.begin_stroke(s1);

        assert_eq!(canvas.strokes.len(), 1);
        // Erase at (15, 15) with radius 10
        assert!(canvas.erase_at(15.0, 15.0, 10.0));
        assert_eq!(canvas.strokes.len(), 0);

        // Undo erase restores it
        assert!(canvas.undo());
        assert_eq!(canvas.strokes.len(), 1);
        assert_eq!(canvas.strokes[0].id, "s1");
    }

    #[test]
    fn test_gpu_mesh_tessellation() {
        let mut stroke = Stroke::new("s_gpu".into(), InkTool::Pen, "#10B981".into(), 4.0, 1.0);
        stroke.add_point(InkPoint::new(0.0, 0.0, 1.0, 1));
        stroke.add_point(InkPoint::new(50.0, 50.0, 1.0, 2));
        stroke.add_point(InkPoint::new(100.0, 50.0, 1.0, 3));

        let mesh = InkTessellator::tessellate_stroke(&stroke);
        assert_eq!(mesh.vertices.len(), 6); // 3 points * 2 extruded vertices
        assert_eq!(mesh.triangle_count(), 4); // 2 quads * 2 triangles = 4 triangles
        assert_eq!(mesh.color_rgba, [16, 185, 129, 255]);
    }

    #[test]
    fn test_svg_export() {
        let mut canvas = InkCanvas::new(500.0, 500.0);
        let mut stroke = Stroke::new("test".into(), InkTool::Pen, "#10B981".into(), 3.0, 1.0);
        stroke.add_point(InkPoint::new(0.0, 0.0, 1.0, 1));
        stroke.add_point(InkPoint::new(100.0, 100.0, 1.0, 2));
        canvas.begin_stroke(stroke);

        let svg = canvas.export_svg();
        assert!(svg.contains("<svg"));
        assert!(svg.contains("stroke=\"#10B981\""));
        assert!(svg.contains("</svg>"));
    }

    #[test]
    fn test_canvas_simplify_strokes() {
        let mut canvas = InkCanvas::new(500.0, 500.0);
        let mut stroke = Stroke::new("test".into(), InkTool::Pen, "#10B981".into(), 3.0, 1.0);
        for i in 0..20 {
            stroke.add_point(InkPoint::new(i as f32, (i * 2) as f32, 1.0, i as u64));
        }
        assert_eq!(stroke.points.len(), 20);
        canvas.begin_stroke(stroke);
        canvas.simplify_all_strokes(0.5);
        // Linear path simplified to endpoints
        assert_eq!(canvas.strokes[0].points.len(), 2);
    }
}
