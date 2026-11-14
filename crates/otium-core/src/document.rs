use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::view_mode::{PageRotation, ViewMode, ZoomLevel};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum DocumentType {
    Pdf,
    Pptx,
    Image,
    Video,
    Audio,
    Whiteboard,
    Note,
}

impl DocumentType {
    pub fn from_extension(ext: &str) -> Option<Self> {
        match ext.to_lowercase().as_str() {
            "pdf" => Some(DocumentType::Pdf),
            "pptx" | "ppsx" => Some(DocumentType::Pptx),
            "png" | "jpg" | "jpeg" | "webp" | "svg" | "bmp" => Some(DocumentType::Image),
            "mp4" | "webm" | "mkv" | "mov" => Some(DocumentType::Video),
            "mp3" | "wav" | "ogg" | "m4a" | "flac" => Some(DocumentType::Audio),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DocumentMetadata {
    pub id: Uuid,
    pub title: String,
    pub original_file_name: String,
    pub doc_type: DocumentType,
    pub file_size_bytes: u64,
    pub page_count: usize,
    pub added_at: DateTime<Utc>,
    pub last_opened_at: DateTime<Utc>,
    pub is_favorite: bool,
    pub is_vault_protected: bool,
    pub tags: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReadingProgress {
    pub document_id: Uuid,
    pub current_page: usize,
    pub scroll_offset_ratio: f32,
    pub view_mode: ViewMode,
    pub zoom: ZoomLevel,
    pub rotation: PageRotation,
    pub media_position_seconds: Option<f64>,
    pub updated_at: DateTime<Utc>,
}

impl Default for ReadingProgress {
    fn default() -> Self {
        Self {
            document_id: Uuid::nil(),
            current_page: 1,
            scroll_offset_ratio: 0.0,
            view_mode: ViewMode::default(),
            zoom: ZoomLevel::default(),
            rotation: PageRotation::default(),
            media_position_seconds: None,
            updated_at: Utc::now(),
        }
    }
}
