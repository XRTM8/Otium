use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SlidePresentation {
    pub title: String,
    pub slide_width_pt: f32,
    pub slide_height_pt: f32,
    pub slides: Vec<Slide>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Slide {
    pub index: usize,
    pub title: Option<String>,
    pub elements: Vec<SlideElement>,
    pub background_color: Option<String>,
    pub notes: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum SlideElement {
    TextBox {
        bounds: RectBounds,
        paragraphs: Vec<Paragraph>,
    },
    Shape {
        bounds: RectBounds,
        shape_type: ShapeType,
        fill_color: Option<String>,
        stroke_color: Option<String>,
        stroke_width: f32,
    },
    Image {
        bounds: RectBounds,
        resource_id: String,
        mime_type: String,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RectBounds {
    pub x: f32,
    pub y: f32,
    pub width: f32,
    pub height: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Paragraph {
    pub alignment: TextAlignment,
    pub runs: Vec<TextRun>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
pub enum TextAlignment {
    #[default]
    Left,
    Center,
    Right,
    Justified,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TextRun {
    pub text: String,
    pub font_name: Option<String>,
    pub font_size_pt: f32,
    pub is_bold: bool,
    pub is_italic: bool,
    pub is_underline: bool,
    pub color_hex: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum ShapeType {
    Rectangle,
    RoundRectangle,
    Ellipse,
    Line,
    Custom,
}

/// Convert PowerPoint English Metric Units (EMUs) to standard typographic points (pt)
/// 1 inch = 914,400 EMUs = 72 points
pub const fn emu_to_points(emu: i64) -> f32 {
    (emu as f32) / 12700.0
}
