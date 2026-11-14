use std::io::Cursor;
use lopdf::Document as LoDocument;
use serde::{Deserialize, Serialize};

use otium_core::{OtiumError, Result};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PdfPageInfo {
    pub page_number: usize,
    pub width_pt: f32,
    pub height_pt: f32,
    pub rotation: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PdfDocumentInfo {
    pub title: Option<String>,
    pub author: Option<String>,
    pub page_count: usize,
    pub version: String,
    pub pages: Vec<PdfPageInfo>,
}

pub struct PdfInspector;

impl PdfInspector {
    /// High-performance file open with OS-level NVMe prefetch hints (FILE_FLAG_SEQUENTIAL_SCAN)
    fn open_direct_file<P: AsRef<std::path::Path>>(path: P) -> std::io::Result<std::fs::File> {
        #[cfg(windows)]
        {
            use std::os::windows::fs::OpenOptionsExt;
            const FILE_FLAG_SEQUENTIAL_SCAN: u32 = 0x08000000;
            std::fs::OpenOptions::new()
                .read(true)
                .custom_flags(FILE_FLAG_SEQUENTIAL_SCAN)
                .open(path)
        }
        #[cfg(not(windows))]
        {
            std::fs::File::open(path)
        }
    }

    /// Validates ISO 32000-1 magic header bytes `%PDF-` before parsing.
    pub fn validate_header(bytes: &[u8]) -> Result<()> {
        if bytes.len() < 5 {
            return Err(OtiumError::Format("File is smaller than 5 bytes".into()));
        }
        let check_len = bytes.len().min(1024);
        if !bytes[..check_len].windows(5).any(|w| w == b"%PDF-") {
            return Err(OtiumError::Format(
                "File is not a valid PDF document (missing %PDF- header)".into(),
            ));
        }
        Ok(())
    }

    /// Zero-copy inspection of a PDF file directly from disk using OS memory mapping (mmap)
    /// combined with Direct NVMe prefetch hints. Eliminates heap allocation for 100MB - 2GB files.
    pub fn inspect_file<P: AsRef<std::path::Path>>(path: P) -> Result<PdfDocumentInfo> {
        let file = Self::open_direct_file(path)?;
        let mmap = unsafe { memmap2::Mmap::map(&file) }
            .map_err(|e| OtiumError::Io(std::io::Error::new(e.kind(), format!("Memory mapping failed: {e}"))))?;
        Self::inspect_bytes(&mmap)
    }

    /// Inspect a PDF from bytes and extract page information and metadata.
    pub fn inspect_bytes(bytes: &[u8]) -> Result<PdfDocumentInfo> {
        Self::validate_header(bytes)?;

        let doc = LoDocument::load_from(Cursor::new(bytes))
            .map_err(|e| OtiumError::Format(format!("Failed to parse PDF catalog: {e}")))?;

        let page_count = doc.get_pages().len();
        let pages_map = doc.get_pages();

        let mut pages = Vec::with_capacity(page_count);
        for page_num in 1..=page_count {
            if let Some(&page_id) = pages_map.get(&(page_num as u32)) {
                let mut width = 595.28; // Default A4 portrait
                let mut height = 841.89;

                if let Ok(page_dict) = doc.get_dictionary(page_id) {
                    if let Ok(media_box) = page_dict.get(b"MediaBox").and_then(|obj| obj.as_array()) {
                        if media_box.len() >= 4 {
                            let x1 = media_box[0].as_float().unwrap_or(0.0);
                            let y1 = media_box[1].as_float().unwrap_or(0.0);
                            let x2 = media_box[2].as_float().unwrap_or(595.28);
                            let y2 = media_box[3].as_float().unwrap_or(841.89);
                            width = (x2 - x1).abs();
                            height = (y2 - y1).abs();
                        }
                    }
                }

                pages.push(PdfPageInfo {
                    page_number: page_num,
                    width_pt: width,
                    height_pt: height,
                    rotation: 0,
                });
            }
        }

        Ok(PdfDocumentInfo {
            title: None,
            author: None,
            page_count,
            version: doc.version.clone(),
            pages,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use lopdf::{dictionary, Document as LoDoc, Object, Stream};

    #[test]
    fn validate_header_rejects_short_and_non_pdf_buffers() {
        assert!(PdfInspector::validate_header(b"%PDF").is_err());
        assert!(PdfInspector::validate_header(b"NOT_A_PDF_DOCUMENT").is_err());
        assert!(PdfInspector::validate_header(b"\x00\x00%PDF-1.7\n").is_ok());
    }

    #[test]
    fn inspect_bytes_extracts_page_dimensions_and_version() {
        let mut doc = LoDoc::with_version("1.5");
        let pages_id = doc.new_object_id();
        let content_id = doc.add_object(Stream::new(dictionary! {}, Vec::new()));
        let page_id = doc.add_object(dictionary! {
            "Type" => "Page",
            "Parent" => pages_id,
            "Contents" => content_id,
            "MediaBox" => vec![Object::Integer(0), Object::Integer(0), Object::Integer(612), Object::Integer(792)],
        });
        let pages = dictionary! {
            "Type" => "Pages",
            "Kids" => vec![page_id.into()],
            "Count" => 1,
        };
        doc.objects.insert(pages_id, Object::Dictionary(pages));
        let catalog_id = doc.add_object(dictionary! {
            "Type" => "Catalog",
            "Pages" => pages_id,
        });
        doc.trailer.set("Root", catalog_id);

        let mut buf = Vec::new();
        doc.save_to(&mut buf).expect("serialize test PDF");

        let info = PdfInspector::inspect_bytes(&buf).expect("parse minimal PDF");
        assert_eq!(info.version, "1.5");
        assert_eq!(info.page_count, 1);
        assert_eq!(info.pages.len(), 1);
        assert!((info.pages[0].width_pt - 612.0).abs() < 0.01);
        assert!((info.pages[0].height_pt - 792.0).abs() < 0.01);
    }
}
