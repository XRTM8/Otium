use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ColorRgba {
    pub r: u8,
    pub g: u8,
    pub b: u8,
    pub a: f32,
}

impl ColorRgba {
    pub const fn new(r: u8, g: u8, b: u8, a: f32) -> Self {
        Self { r, g, b, a }
    }

    pub fn to_hex(&self) -> String {
        format!("#{:02X}{:02X}{:02X}", self.r, self.g, self.b)
    }

    pub fn to_css_rgba(&self) -> String {
        format!("rgba({}, {}, {}, {})", self.r, self.g, self.b, self.a)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct RectNormalized {
    pub x: f32,
    pub y: f32,
    pub width: f32,
    pub height: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum AnnotationKind {
    Highlight {
        rects: Vec<RectNormalized>,
        color: ColorRgba,
    },
    Underline {
        rects: Vec<RectNormalized>,
        color: ColorRgba,
    },
    StickyNote {
        position: RectNormalized,
        text: String,
        color: ColorRgba,
    },
    Bookmark {
        title: String,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Annotation {
    pub id: Uuid,
    pub document_id: Uuid,
    pub page_number: usize,
    pub kind: AnnotationKind,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}
