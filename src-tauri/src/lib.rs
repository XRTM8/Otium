#![cfg_attr(test, allow(dead_code, unused_imports))]

use std::env;
use std::fs;
use std::path::Path;

use tauri::ipc::{InvokeBody, Request, Response};
use tauri::State;

mod vault_ink_pdf;
mod beam_lan;
#[cfg(windows)]
mod portable_update;

#[tauri::command]
async fn download_portable_update(app: tauri::AppHandle, url: String, sha256: String) -> Result<(), String> {
  #[cfg(windows)]
  return portable_update::download_portable_update(app, url, sha256).await;
  #[cfg(not(windows))]
  {
    let _ = (app, url, sha256);
    Err("Portable updates are available on Windows.".into())
  }
}

#[global_allocator]
static GLOBAL: mimalloc::MiMalloc = mimalloc::MiMalloc;

const MAX_SUPPORTED_PDF_SIZE: u64 = 1500 * 1024 * 1024; // 1.5 GB
const MAX_SUPPORTED_MEDIA_SIZE: u64 = 150 * 1024 * 1024; // 150 MB

const ALLOWED_MEDIA_EXTENSIONS: &[&str] = &[
  "pdf", "pptx", "ppsx", "png", "jpg", "jpeg", "webp", "gif", "avif",
  "mp4", "m4v", "webm", "mov", "mkv", "ogv", "mp3", "wav", "m4a", "ogg",
  "opus", "flac", "txt", "md",
];

#[cfg_attr(test, allow(dead_code))]
#[derive(serde::Serialize, Clone)]
struct InitialPdf {
  name: String,
  path: String,
}

#[derive(serde::Serialize)]
struct RustEngineStatus {
  version: String,
  is_active: bool,
  modules: Vec<&'static str>,
}

#[tauri::command]
fn get_rust_engine_status() -> RustEngineStatus {
  RustEngineStatus {
    version: env!("CARGO_PKG_VERSION").into(),
    is_active: true,
    modules: vec![
      "otium-core (Bilingual Typography, Normalization & Trigram Search)",
      "otium-slides (Native PPTX Parser)",
      "otium-scanner (Document Filter & ID Card Stitcher)",
      "otium-beam (Pairing PIN & Vector QR SVG)",
      "otium-pdf (Zero-Copy PDF Metadata Inspector)",
      "otium-ink (RDP Stroke Decimator & SVG Exporter)",
      "otium-vault (Argon2id + ChaCha20-Poly1305 Vault Crypto)",
    ],
  }
}

#[cfg_attr(test, allow(dead_code))]
fn extract_raw_body(request: Request<'_>) -> Result<Vec<u8>, String> {
  let InvokeBody::Raw(bytes) = request.body() else {
    return Err("Expected raw binary IPC payload".into());
  };
  Ok(bytes.clone())
}

#[cfg_attr(test, allow(dead_code))]
#[tauri::command]
async fn rust_parse_pptx(request: Request<'_>) -> Result<otium_slides::SlidePresentation, String> {
  let bytes = extract_raw_body(request)?;
  tauri::async_runtime::spawn_blocking(move || {
    otium_slides::PptxParser::parse_bytes(&bytes).map_err(|e| e.to_string())
  })
  .await
  .map_err(|e| e.to_string())?
}

#[tauri::command]
fn rust_generate_beam_qr(payload: String) -> Result<String, String> {
  otium_beam::BeamPairing::generate_qr_svg(&payload).map_err(|e| e.to_string())
}

#[cfg_attr(test, allow(dead_code))]
#[tauri::command]
async fn rust_clean_document_image(request: Request<'_>) -> Result<Response, String> {
  let contrast_boost = request
    .headers()
    .get("x-contrast-boost")
    .and_then(|v| v.to_str().ok())
    .and_then(|s| s.parse::<f32>().ok())
    .unwrap_or(1.2);
  let bytes = extract_raw_body(request)?;

  let png_bytes = tauri::async_runtime::spawn_blocking(move || -> Result<Vec<u8>, String> {
    let img = image::load_from_memory(&bytes).map_err(|e| e.to_string())?;
    let rgba = img.to_rgba8();
    let clean_gray = otium_scanner::DocumentScanner::clean_document_filter(&rgba, contrast_boost);
    let mut out = std::io::Cursor::new(Vec::new());
    clean_gray.write_to(&mut out, image::ImageFormat::Png).map_err(|e| e.to_string())?;
    Ok(out.into_inner())
  })
  .await
  .map_err(|e| e.to_string())??;

  Ok(Response::new(png_bytes))
}

#[cfg_attr(test, allow(dead_code))]
#[tauri::command]
async fn rust_stitch_id_cards(request: Request<'_>) -> Result<Response, String> {
  let front_len = request
    .headers()
    .get("x-front-length")
    .and_then(|v| v.to_str().ok())
    .and_then(|s| s.parse::<usize>().ok())
    .ok_or_else(|| "Missing x-front-length header".to_string())?;
  let bytes = extract_raw_body(request)?;
  if front_len > bytes.len() {
    return Err("Invalid front card payload length".into());
  }
  let (front_slice, back_slice) = bytes.split_at(front_len);
  let front_bytes = front_slice.to_vec();
  let back_bytes = back_slice.to_vec();

  let png_bytes = tauri::async_runtime::spawn_blocking(move || -> Result<Vec<u8>, String> {
    let front = image::load_from_memory(&front_bytes).map_err(|e| e.to_string())?.to_rgba8();
    let back = image::load_from_memory(&back_bytes).map_err(|e| e.to_string())?.to_rgba8();
    let a4 = otium_scanner::DocumentScanner::stitch_id_card_a4(&front, &back);
    let mut out = std::io::Cursor::new(Vec::new());
    a4.write_to(&mut out, image::ImageFormat::Png).map_err(|e| e.to_string())?;
    Ok(out.into_inner())
  })
  .await
  .map_err(|e| e.to_string())??;

  Ok(Response::new(png_bytes))
}

#[cfg_attr(test, allow(dead_code))]
#[tauri::command]
fn rust_search_document_pages_arabic(
  doc_key: String,
  pages: Option<Vec<String>>,
  query: String,
  cache: State<'_, otium_core::PageSearchCache>,
) -> Result<Vec<usize>, String> {
  cache.search_or_build(doc_key, pages, &query)
}

#[cfg_attr(test, allow(dead_code))]
#[tauri::command]
fn get_initial_pdf() -> Option<InitialPdf> {
  for candidate in env::args().skip(1) {
    if candidate.starts_with('-') {
      continue;
    }
    let path = Path::new(&candidate);
    let is_pdf = path
      .extension()
      .and_then(|e| e.to_str())
      .map(|e| e.eq_ignore_ascii_case("pdf"))
      .unwrap_or(false);
    if is_pdf && path.is_file() {
      let name = path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("document.pdf")
        .to_string();
      return Some(InitialPdf {
        name,
        path: candidate,
      });
    }
  }
  None
}

/// Validates symlink safety, canonical path, extension and `%PDF-` header before returning bytes.
#[cfg_attr(test, allow(dead_code))]
#[tauri::command]
async fn read_pdf_bytes(path: String) -> Result<Response, String> {
  let bytes = tauri::async_runtime::spawn_blocking(move || -> Result<Vec<u8>, String> {
    let resolved = otium_core::validate_local_file(&path, &["pdf"], MAX_SUPPORTED_PDF_SIZE, true)?;
    fs::read(resolved).map_err(|e| e.to_string())
  })
  .await
  .map_err(|e| e.to_string())??;

  Ok(Response::new(bytes))
}

/// Reads supported non-PDF workspace files (PPTX, images, audio/video, text) dropped onto Tauri.
#[cfg_attr(test, allow(dead_code))]
#[tauri::command]
async fn read_media_file_bytes(path: String) -> Result<Response, String> {
  let bytes = tauri::async_runtime::spawn_blocking(move || -> Result<Vec<u8>, String> {
    let resolved = otium_core::validate_local_file(&path, ALLOWED_MEDIA_EXTENSIONS, MAX_SUPPORTED_MEDIA_SIZE, false)?;
    fs::read(resolved).map_err(|e| e.to_string())
  })
  .await
  .map_err(|e| e.to_string())??;

  Ok(Response::new(bytes))
}

/// True when Windows has an Otium uninstall entry, which is written by the
/// NSIS installer. A portable executable has no such entry and therefore uses
/// the manual download path instead of the automatic updater.
#[cfg_attr(test, allow(dead_code))]
#[tauri::command]
fn is_installed_build() -> bool {
  #[cfg(windows)]
  {
    use winreg::enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE};
    use winreg::RegKey;

    const KEY: &str = "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Otium";

    for hive in [HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE] {
      if RegKey::predef(hive).open_subkey(KEY).is_ok() {
        return true;
      }
    }

    false
  }

  #[cfg(not(windows))]
  {
    false
  }
}

/// Otium 1.0 registered a cache-first service worker. WebView profiles persist
/// across installer and APK updates, so an old worker would keep serving the
/// old `index.html` forever and the new frontend would never start. Clear the
/// worker and its cache storage before the webview is created. Site data such
/// as localStorage, IndexedDB and PDF progress lives in sibling directories
/// and is intentionally left untouched.
#[cfg(all(windows, not(test)))]
fn clear_legacy_service_worker() {
  let Some(local_app_data) = env::var_os("LOCALAPPDATA") else {
    return;
  };
  let default_dir = Path::new(&local_app_data)
    .join("com.otium.reader")
    .join("EBWebView")
    .join("Default");

  for name in ["Service Worker", "CacheStorage"] {
    let _ = fs::remove_dir_all(default_dir.join(name));
  }
}

#[cfg(not(test))]
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  #[cfg(windows)]
  clear_legacy_service_worker();

  let builder = tauri::Builder::default()
    .manage(otium_core::PageSearchCache::default())
    .manage(beam_lan::LanBeam::default())
    .plugin(tauri_plugin_opener::init());

  #[cfg(not(mobile))]
  let builder = builder
    .plugin(tauri_plugin_updater::Builder::new().build())
    .plugin(tauri_plugin_process::init());

  builder
    .invoke_handler(tauri::generate_handler![
      get_initial_pdf,
      read_pdf_bytes,
      read_media_file_bytes,
      is_installed_build,
      download_portable_update,
      get_rust_engine_status,
      rust_parse_pptx,
      rust_generate_beam_qr,
      beam_lan::beam_lan_listen,
      beam_lan::beam_lan_connect,
      beam_lan::beam_lan_send,
      beam_lan::beam_lan_stop,
      rust_clean_document_image,
      rust_stitch_id_cards,
      rust_search_document_pages_arabic,
      vault_ink_pdf::rust_inspect_pdf_bytes,
      vault_ink_pdf::rust_simplify_ink_points,
      vault_ink_pdf::rust_export_ink_svg,
      vault_ink_pdf::rust_vault_seal_bytes,
      vault_ink_pdf::rust_vault_unseal_bytes
    ])
    .setup(|_app| {
      #[cfg(not(mobile))]
      {
        use tauri::Manager;
        if let Some(window) = _app.get_webview_window("main") {
          // Show the window only after the webview is ready to avoid black screen on Windows
          window.show().unwrap_or_default();
        }
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while building tauri application");
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn rust_engine_status_lists_active_modules() {
    let status = get_rust_engine_status();
    assert!(status.is_active);
    assert_eq!(status.version, env!("CARGO_PKG_VERSION"));
    assert_eq!(status.modules.len(), 7);
  }

  #[test]
  fn beam_qr_command_generates_valid_svg_output() {
    let svg = rust_generate_beam_qr("https://xrtm8.github.io/Otium/?room=OTM-TEST".into())
      .expect("qr svg generation");
    assert!(svg.contains("<svg"));
    assert!(svg.contains("</svg>"));
  }

  #[test]
  fn tauri_fs_guard_blocks_invalid_files_and_accepts_pdf_magic() {
    let dir = std::env::temp_dir().join(format!("otium-tauri-test-{}", std::process::id()));
    let _ = fs::remove_dir_all(&dir);
    fs::create_dir_all(&dir).expect("temp dir");

    let good_pdf = dir.join("valid.pdf");
    fs::write(&good_pdf, b"%PDF-1.6\n1 0 obj\n<<>>\nendobj\n").expect("write pdf");
    let verified = otium_core::validate_local_file(
      good_pdf.to_str().expect("utf8 path"),
      &["pdf"],
      MAX_SUPPORTED_PDF_SIZE,
      true,
    );
    assert!(verified.is_ok());

    let disallowed = dir.join("script.ps1");
    fs::write(&disallowed, b"Write-Host 1").expect("write ps1");
    let rejected = otium_core::validate_local_file(
      disallowed.to_str().expect("utf8 path"),
      ALLOWED_MEDIA_EXTENSIONS,
      MAX_SUPPORTED_MEDIA_SIZE,
      false,
    );
    assert!(rejected.is_err());

    let _ = fs::remove_dir_all(&dir);
  }

  #[test]
  fn page_search_cache_normalizes_arabic_queries() {
    let cache = otium_core::PageSearchCache::default();
    let hits = cache
      .search_or_build(
        "doc-tauri-test".into(),
        Some(vec![
          "مقدمة في الرياضيات".into(),
          "الشبكات والإدارة الحديثة".into(),
        ]),
        "الادارة",
      )
      .expect("search should succeed");
    assert_eq!(hits, vec![2]);
  }
}
