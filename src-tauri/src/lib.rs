use std::env;
use std::fs;
use std::io::{Read, Seek, SeekFrom};
use std::path::Path;

use tauri::ipc::Response;

#[derive(serde::Serialize, Clone)]
struct InitialPdf {
  name: String,
  path: String,
}

#[tauri::command]
fn get_initial_pdf() -> Option<InitialPdf> {
  let args: Vec<String> = env::args().collect();
  if args.len() > 1 {
    let candidate = &args[1];
    if candidate.to_lowercase().ends_with(".pdf") && Path::new(candidate).exists() {
      let name = Path::new(candidate)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("document.pdf")
        .to_string();
      return Some(InitialPdf {
        name,
        path: candidate.to_string(),
      });
    }
  }
  None
}

/// Return raw bytes instead of a JSON number array. Large PDFs would otherwise
/// be serialized into millions of numbers before reaching the WebView.
/// Hardened with extension validation, size bounds, and upfront header verification
/// before buffer allocation to prevent out-of-memory crashes on large files.
#[tauri::command]
fn read_pdf_bytes(path: String) -> Result<Response, String> {
  let p = Path::new(&path);
  if !p.is_file() {
    return Err("Target path is not a file".into());
  }

  let ext_matches = p
    .extension()
    .and_then(|e| e.to_str())
    .map(|e| e.eq_ignore_ascii_case("pdf"))
    .unwrap_or(false);

  if !ext_matches {
    return Err("Only .pdf files can be read".into());
  }

  let metadata = fs::metadata(p).map_err(|e| e.to_string())?;
  let file_size = metadata.len();

  if file_size == 0 {
    return Err("File is empty (0 bytes)".into());
  }

  const MAX_SUPPORTED_SIZE: u64 = 1500 * 1024 * 1024; // 1.5 GB limit
  if file_size > MAX_SUPPORTED_SIZE {
    return Err("File exceeds 1.5 GB maximum supported document size".into());
  }

  let mut file = fs::File::open(p).map_err(|e| e.to_string())?;

  // ISO 32000-1: A valid PDF begins with or contains "%PDF-" in its first 1024 bytes.
  // Validate the magic bytes before allocating memory for the full file body.
  let mut header = [0u8; 1024];
  let n = file.read(&mut header).map_err(|e| e.to_string())?;
  if n < 5 || !header[..n].windows(5).any(|w| w == b"%PDF-") {
    return Err("File is not a valid PDF document (missing %PDF- header)".into());
  }

  // Rewind to beginning and read exact bytes with pre-allocated capacity
  file.seek(SeekFrom::Start(0)).map_err(|e| e.to_string())?;
  let mut bytes = Vec::with_capacity(file_size as usize);
  file.read_to_end(&mut bytes).map_err(|e| e.to_string())?;

  Ok(Response::new(bytes))
}

/// True when Windows has an Otium uninstall entry, which is written by the
/// NSIS installer. A portable executable has no such entry and therefore uses
/// the manual download path instead of the automatic updater.
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
#[cfg(windows)]
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  #[cfg(windows)]
  clear_legacy_service_worker();

  let builder = tauri::Builder::default().plugin(tauri_plugin_opener::init());

  #[cfg(not(mobile))]
  let builder = builder
    .plugin(tauri_plugin_updater::Builder::new().build())
    .plugin(tauri_plugin_process::init());

  builder
    .invoke_handler(tauri::generate_handler![
      get_initial_pdf,
      read_pdf_bytes,
      is_installed_build
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
