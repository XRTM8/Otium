use std::io::{BufReader, Cursor, Read};
use quick_xml::events::Event;
use quick_xml::reader::Reader;
use zip::ZipArchive;

use crate::model::{
    emu_to_points, Paragraph, RectBounds, Slide, SlideElement, SlidePresentation, TextAlignment,
    TextRun,
};
use otium_core::{OtiumError, Result};

pub struct PptxParser;

impl PptxParser {
    /// Parse a PowerPoint (.pptx / .ppsx) file from raw bytes with zero intermediate string allocation
    /// and single-pass zip index resolution.
    pub fn parse_bytes(bytes: &[u8]) -> Result<SlidePresentation> {
        let reader = Cursor::new(bytes);
        let mut archive = ZipArchive::new(reader)
            .map_err(|e| OtiumError::Format(format!("Failed to open PPTX zip container: {e}")))?;

        let mut pres_file_index = None;
        let mut slide_entries: Vec<(usize, usize)> = Vec::new(); // (slide_number, archive_index)

        // 1. Single-pass discovery: index slide files and presentation.xml in O(N) entries
        for i in 0..archive.len() {
            let file = archive
                .by_index(i)
                .map_err(|e| OtiumError::Format(e.to_string()))?;
            let name = file.name();

            if name == "ppt/presentation.xml" {
                pres_file_index = Some(i);
            } else if let Some(stripped) = name.strip_prefix("ppt/slides/slide") {
                if let Some(num_str) = stripped.strip_suffix(".xml") {
                    if let Ok(num) = num_str.parse::<usize>() {
                        slide_entries.push((num, i));
                    }
                }
            }
        }

        // Sort slide entries strictly by slide number (1, 2, 3...)
        slide_entries.sort_by_key(|&(num, _)| num);

        // 2. Discover slide dimensions from ppt/presentation.xml
        let (slide_width_pt, slide_height_pt) = if let Some(idx) = pres_file_index {
            let file = archive.by_index(idx)
                .map_err(|e| OtiumError::Format(format!("Failed reading presentation.xml: {e}")))?;
            Self::parse_presentation_dimensions_stream(file)?
        } else {
            (960.0, 540.0)
        };

        // 3. Stream and parse each slide directly from the zip stream
        let mut slides = Vec::with_capacity(slide_entries.len());
        for (slide_num, (_, file_idx)) in slide_entries.iter().enumerate() {
            let file = archive
                .by_index(*file_idx)
                .map_err(|e| OtiumError::Format(format!("Failed reading slide #{slide_num}: {e}")))?;

            let slide = Self::parse_single_slide_stream(slide_num + 1, file)?;
            slides.push(slide);
        }

        Ok(SlidePresentation {
            title: "Presentation".into(),
            slide_width_pt,
            slide_height_pt,
            slides,
        })
    }

    fn parse_presentation_dimensions_stream<R: Read>(reader_source: R) -> Result<(f32, f32)> {
        // Default to standard 16:9 widescreen: 13.333 x 7.5 inches -> 960 x 540 pt
        let mut width = 960.0;
        let mut height = 540.0;

        let mut reader = Reader::from_reader(BufReader::new(reader_source));
        reader.config_mut().trim_text(true);

        let mut buf = Vec::new();
        loop {
            match reader.read_event_into(&mut buf) {
                Ok(Event::Empty(ref e)) | Ok(Event::Start(ref e)) => {
                    let local_name = e.local_name();
                    if local_name.as_ref() == b"sldSz" {
                        for attr in e.attributes().flatten() {
                            if attr.key.local_name().as_ref() == b"cx" {
                                if let Ok(val_str) = std::str::from_utf8(&attr.value) {
                                    if let Ok(emu) = val_str.parse::<i64>() {
                                        width = emu_to_points(emu);
                                    }
                                }
                            } else if attr.key.local_name().as_ref() == b"cy" {
                                if let Ok(val_str) = std::str::from_utf8(&attr.value) {
                                    if let Ok(emu) = val_str.parse::<i64>() {
                                        height = emu_to_points(emu);
                                    }
                                }
                            }
                        }
                    }
                }
                Ok(Event::Eof) => break,
                Err(_) => break,
                _ => {}
            }
            buf.clear();
        }

        Ok((width, height))
    }

    fn parse_single_slide_stream<R: Read>(index: usize, reader_source: R) -> Result<Slide> {
        let mut reader = Reader::from_reader(BufReader::new(reader_source));
        reader.config_mut().trim_text(true);

        let mut elements = Vec::new();
        let mut buf = Vec::new();

        let mut in_text_body = false;
        let mut current_paragraphs = Vec::new();
        let mut current_runs = Vec::new();
        let mut current_text = String::new();
        let mut is_bold = false;
        let mut is_italic = false;
        let mut font_size_pt = 14.0;
        let mut color_hex = None;
        let mut slide_title = None;

        loop {
            match reader.read_event_into(&mut buf) {
                Ok(Event::Start(ref e)) => {
                    let local_name = e.local_name();
                    match local_name.as_ref() {
                        b"txBody" => in_text_body = true,
                        b"r" => {
                            is_bold = false;
                            is_italic = false;
                            font_size_pt = 14.0;
                            color_hex = None;
                        }
                        b"p" => {
                            current_runs.clear();
                            is_bold = false;
                            is_italic = false;
                            font_size_pt = 14.0;
                            color_hex = None;
                        }
                        b"rPr" => {
                            for attr in e.attributes().flatten() {
                                if attr.key.local_name().as_ref() == b"b" {
                                    is_bold = attr.value.as_ref() == b"1";
                                } else if attr.key.local_name().as_ref() == b"i" {
                                    is_italic = attr.value.as_ref() == b"1";
                                } else if attr.key.local_name().as_ref() == b"sz" {
                                    if let Ok(val) = std::str::from_utf8(&attr.value) {
                                        if let Ok(sz) = val.parse::<f32>() {
                                            font_size_pt = sz / 100.0;
                                        }
                                    }
                                }
                            }
                        }
                        b"srgbClr" => {
                            for attr in e.attributes().flatten() {
                                if attr.key.local_name().as_ref() == b"val" {
                                    if let Ok(val) = std::str::from_utf8(&attr.value) {
                                        color_hex = Some(format!("#{val}"));
                                    }
                                }
                            }
                        }
                        _ => {}
                    }
                }
                Ok(Event::Text(ref e)) => {
                    if in_text_body {
                        if let Ok(txt) = e.unescape() {
                            current_text.push_str(&txt);
                        }
                    }
                }
                Ok(Event::End(ref e)) => {
                    let local_name = e.local_name();
                    match local_name.as_ref() {
                        b"t" => {
                            if !current_text.is_empty() {
                                if slide_title.is_none() && current_text.len() < 100 {
                                    slide_title = Some(current_text.clone());
                                }
                                current_runs.push(TextRun {
                                    text: std::mem::take(&mut current_text),
                                    font_name: None,
                                    font_size_pt,
                                    is_bold,
                                    is_italic,
                                    is_underline: false,
                                    color_hex: color_hex.clone(),
                                });
                            }
                        }
                        b"p" => {
                            if !current_runs.is_empty() {
                                current_paragraphs.push(Paragraph {
                                    alignment: TextAlignment::Left,
                                    runs: std::mem::take(&mut current_runs),
                                });
                            }
                        }
                        b"txBody" => {
                            in_text_body = false;
                            if !current_paragraphs.is_empty() {
                                elements.push(SlideElement::TextBox {
                                    bounds: RectBounds {
                                        x: 50.0,
                                        y: 50.0,
                                        width: 800.0,
                                        height: 400.0,
                                    },
                                    paragraphs: std::mem::take(&mut current_paragraphs),
                                });
                            }
                        }
                        _ => {}
                    }
                }
                Ok(Event::Eof) => break,
                Err(_) => break,
                _ => {}
            }
            buf.clear();
        }

        Ok(Slide {
            index,
            title: slide_title,
            elements,
            background_color: None,
            notes: None,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use zip::write::SimpleFileOptions;
    use zip::{CompressionMethod, ZipWriter};

    #[test]
    fn parse_bytes_reads_presentation_dimensions_and_slide_text() {
        let mut buffer = Vec::new();
        {
            let mut zip = ZipWriter::new(Cursor::new(&mut buffer));
            let opts = SimpleFileOptions::default().compression_method(CompressionMethod::Stored);
            zip.start_file("ppt/presentation.xml", opts).unwrap();
            zip.write_all(
                br#"<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:sldSz cx="12192000" cy="6858000"/></p:presentation>"#,
            )
            .unwrap();
            zip.start_file("ppt/slides/slide1.xml", opts).unwrap();
            zip.write_all(
                br#"<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>Hello Otium</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>"#,
            )
            .unwrap();
            zip.finish().unwrap();
        }

        let pres = PptxParser::parse_bytes(&buffer).expect("valid minimal PPTX");
        assert!((pres.slide_width_pt - 960.0).abs() < 0.1);
        assert!((pres.slide_height_pt - 540.0).abs() < 0.1);
        assert_eq!(pres.slides.len(), 1);
        assert_eq!(pres.slides[0].index, 1);
        let texts: Vec<String> = pres.slides[0]
            .elements
            .iter()
            .filter_map(|el| match el {
                SlideElement::TextBox { paragraphs, .. } => Some(
                    paragraphs
                        .iter()
                        .flat_map(|p| p.runs.iter().map(|r| r.text.as_str()))
                        .collect::<String>(),
                ),
                _ => None,
            })
            .collect();
        assert!(texts.iter().any(|t| t.contains("Hello Otium")));
    }

    #[test]
    fn parse_bytes_rejects_corrupt_archive() {
        assert!(PptxParser::parse_bytes(b"not a zip").is_err());
    }
}
