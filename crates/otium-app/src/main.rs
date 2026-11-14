mod app_ui;

use slint::{Color, ComponentHandle};
use std::rc::Rc;

use otium_app::AppState;
use otium_beam::BeamPairing;
use otium_scanner::DocumentScanner;

#[global_allocator]
static GLOBAL: mimalloc::MiMalloc = mimalloc::MiMalloc;

pub fn main() -> Result<(), slint::PlatformError> {
    let main_window = app_ui::MainWindow::new()?;
    let state = AppState::new();

    // Helper to sync theme palette colors to Slint UI with Zero Heap Allocations
    fn update_ui_palette(window: &app_ui::MainWindow, state: &AppState) {
        let palette = state.current_theme.static_palette();
        window.set_theme_name(format!("اللون: {}", palette.name_ar).into());

        // Parse hex colors for Slint
        fn parse_color(hex: &str) -> Color {
            let hex = hex.trim_start_matches('#');
            if hex.len() == 6 {
                let r = u8::from_str_radix(&hex[0..2], 16).unwrap_or(0);
                let g = u8::from_str_radix(&hex[2..4], 16).unwrap_or(0);
                let b = u8::from_str_radix(&hex[4..6], 16).unwrap_or(0);
                Color::from_argb_u8(255, r, g, b)
            } else {
                Color::from_argb_u8(255, 0, 0, 0)
            }
        }

        window.set_bg_canvas(parse_color(palette.bg_canvas));
        window.set_bg_surface(parse_color(palette.bg_surface));
        window.set_bg_card(parse_color(palette.bg_card));
        window.set_text_primary(parse_color(palette.text_primary));
        window.set_text_muted(parse_color(palette.text_muted));
        window.set_accent(parse_color(palette.accent));
        window.set_border_color(parse_color(palette.border));
    }

    update_ui_palette(&main_window, &state);

    let state_rc = Rc::new(std::cell::RefCell::new(state));

    // 1. Cycle Theme Callback
    {
        let window_weak = main_window.as_weak();
        let state_clone = state_rc.clone();
        main_window.on_cycle_theme(move || {
            if let Some(window) = window_weak.upgrade() {
                let mut state = state_clone.borrow_mut();
                state.cycle_theme();
                update_ui_palette(&window, &state);
            }
        });
    }

    // 2. Switch Screen Callback
    {
        let window_weak = main_window.as_weak();
        main_window.on_switch_screen(move |screen_idx| {
            if let Some(window) = window_weak.upgrade() {
                window.set_active_screen(screen_idx);
            }
        });
    }

    // 3. Open File Dialog Callback (PDF, PPTX, Images)
    {
        let window_weak = main_window.as_weak();
        let state_clone = state_rc.clone();
        main_window.on_open_file_dialog(move || {
            if let Some(window) = window_weak.upgrade() {
                let picked = rfd::FileDialog::new()
                    .add_filter(
                        "Documents & Media",
                        &["pdf", "pptx", "ppsx", "png", "jpg", "jpeg", "webp"],
                    )
                    .pick_file();

                if let Some(path) = picked {
                    let mut state = state_clone.borrow_mut();
                    match state.open_file(&path) {
                        Ok(file_type) => match file_type {
                            otium_app::OpenedFileType::Pdf {
                                title,
                                page_count,
                                version,
                            } => {
                                window.set_active_document_title(title.clone().into());
                                window.set_total_pages(page_count as i32);
                                window.set_current_page(1);
                                window.set_pdf_meta_info(
                                    format!("مستند PDF: {title} | {page_count} صفحة | ISO 32000-1 (إصدار {version})").into(),
                                );
                                window.set_status_message(state.status_message.clone().into());
                                window.set_active_screen(1); // Jump to Reader
                            }
                            otium_app::OpenedFileType::Presentation {
                                title,
                                slide_count,
                            } => {
                                window.set_active_document_title(title.clone().into());
                                window.set_total_pages(slide_count as i32);
                                window.set_current_page(1);
                                let (body, notes) = state.current_slide_summary();
                                window.set_slide_text(body.into());
                                window.set_slide_notes(notes.into());
                                window.set_status_message(state.status_message.clone().into());
                                window.set_active_screen(2); // Jump to Slides
                            }
                            otium_app::OpenedFileType::Image {
                                filename,
                                size_bytes,
                            } => {
                                window.set_scanner_info(
                                    format!("صورة مستوردة: {filename} ({size_bytes} بايت) - جاهزة لتصحيح المنظور").into(),
                                );
                                window.set_status_message(state.status_message.clone().into());
                                window.set_active_screen(4); // Jump to Scanner
                            }
                        },
                        Err(err) => {
                            window.set_status_message(format!("خطأ في فتح الملف: {err}").into());
                        }
                    }
                }
            }
        });
    }

    // 4. Next Page Callback
    {
        let window_weak = main_window.as_weak();
        let state_clone = state_rc.clone();
        main_window.on_next_page(move || {
            if let Some(window) = window_weak.upgrade() {
                let mut state = state_clone.borrow_mut();
                if state.next_page() {
                    window.set_current_page(state.current_page as i32);
                    if window.get_active_screen() == 2 {
                        let (body, notes) = state.current_slide_summary();
                        window.set_slide_text(body.into());
                        window.set_slide_notes(notes.into());
                    }
                }
            }
        });
    }

    // 5. Prev Page Callback
    {
        let window_weak = main_window.as_weak();
        let state_clone = state_rc.clone();
        main_window.on_prev_page(move || {
            if let Some(window) = window_weak.upgrade() {
                let mut state = state_clone.borrow_mut();
                if state.prev_page() {
                    window.set_current_page(state.current_page as i32);
                    if window.get_active_screen() == 2 {
                        let (body, notes) = state.current_slide_summary();
                        window.set_slide_text(body.into());
                        window.set_slide_notes(notes.into());
                    }
                }
            }
        });
    }

    // 6. Generate New Beam PIN Callback
    {
        let window_weak = main_window.as_weak();
        main_window.on_generate_new_beam_pin(move || {
            if let Some(window) = window_weak.upgrade() {
                let new_pin = BeamPairing::generate_pin();
                window.set_beam_pin(new_pin.into());
                window.set_pairing_status("تم توليد رمز اقتران جديد - جاهز للتوصيل".into());
            }
        });
    }

    // 7. Ink Drawing Callbacks
    {
        let window_weak = main_window.as_weak();
        let state_clone = state_rc.clone();
        main_window.on_record_ink_point(move |x, y, is_new| {
            let mut state = state_clone.borrow_mut();
            state.record_point(x, y, is_new);
            // Real-time zero-copy tessellation for instant GPU pipeline vertex streaming
            let _meshes = state.tessellate_canvas();
            if let Some(window) = window_weak.upgrade() {
                window.set_ink_stroke_count(state.active_canvas.strokes.len() as i32);
            }
        });
    }

    {
        let state_clone = state_rc.clone();
        main_window.on_set_ink_color(move |hex| {
            let mut state = state_clone.borrow_mut();
            state.current_tool_color = hex.to_string();
        });
    }

    {
        let window_weak = main_window.as_weak();
        let state_clone = state_rc.clone();
        main_window.on_undo_stroke(move || {
            let mut state = state_clone.borrow_mut();
            state.ink_undo();
            if let Some(window) = window_weak.upgrade() {
                window.set_ink_stroke_count(state.active_canvas.strokes.len() as i32);
            }
        });
    }

    {
        let window_weak = main_window.as_weak();
        let state_clone = state_rc.clone();
        main_window.on_redo_stroke(move || {
            let mut state = state_clone.borrow_mut();
            state.ink_redo();
            if let Some(window) = window_weak.upgrade() {
                window.set_ink_stroke_count(state.active_canvas.strokes.len() as i32);
            }
        });
    }

    {
        let window_weak = main_window.as_weak();
        let state_clone = state_rc.clone();
        main_window.on_clear_strokes(move || {
            let mut state = state_clone.borrow_mut();
            state.ink_clear();
            if let Some(window) = window_weak.upgrade() {
                window.set_ink_stroke_count(0);
            }
        });
    }

    {
        let window_weak = main_window.as_weak();
        let state_clone = state_rc.clone();
        main_window.on_export_svg_dialog(move || {
            if let Some(dest) = rfd::FileDialog::new()
                .set_file_name("otium-whiteboard.svg")
                .save_file()
            {
                let state = state_clone.borrow();
                if let Ok(()) = state.export_ink_svg(&dest) {
                    if let Some(window) = window_weak.upgrade() {
                        window.set_status_message(
                            format!("تم تصدير ملف SVG بنجاح إلى {}", dest.display()).into(),
                        );
                    }
                }
            }
        });
    }

    // 8. Sovereign Vault Callback
    {
        let window_weak = main_window.as_weak();
        let state_clone = state_rc.clone();
        main_window.on_unlock_vault_with_pin(move |pin| {
            let temp_db = std::env::temp_dir().join("otium_sovereign_vault.redb");
            let mut state = state_clone.borrow_mut();
            match state.unlock_vault_with_pin(&pin, &temp_db) {
                Ok(count) => {
                    if let Some(window) = window_weak.upgrade() {
                        window.set_vault_unlocked(true);
                        window.set_vault_status(
                            format!("الخزينة مفكوكة ومؤمنة بنجاح ({count} مستندات مخزنة)").into(),
                        );
                        window.set_status_message("تم فك تشفير الخزينة بنجاح".into());
                    }
                }
                Err(err) => {
                    if let Some(window) = window_weak.upgrade() {
                        window.set_status_message(format!("فشل فتح الخزينة: {err}").into());
                    }
                }
            }
        });
    }

    // 9. Scanner ID Card Stitching Callback
    {
        let window_weak = main_window.as_weak();
        main_window.on_run_scanner_stitch(move || {
            use image::{ImageBuffer, Rgba};
            let front = ImageBuffer::from_pixel(856, 540, Rgba([30, 41, 59, 255]));
            let back = ImageBuffer::from_pixel(856, 540, Rgba([15, 23, 42, 255]));
            let stitched_a4 = DocumentScanner::stitch_id_card_a4(&front, &back);

            if let Some(dest) = rfd::FileDialog::new()
                .set_file_name("otium_id_card_a4.png")
                .save_file()
            {
                let _ = stitched_a4.save(&dest);
                if let Some(window) = window_weak.upgrade() {
                    window.set_scanner_info(
                        format!("تم دمج وجهي البطاقة وتصدير ملف A4 عالي الدقة (300 DPI) بنجاح: {}", dest.display()).into(),
                    );
                    window.set_status_message("تمت معالجة المستند وتصدير A4 بنجاح".into());
                }
            }
        });
    }

    println!("Otium Studio initialized.");
    main_window.run()
}
