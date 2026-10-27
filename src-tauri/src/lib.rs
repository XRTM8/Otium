use std::env;
use std::fs;
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
/// Hardened with extension validation and %PDF- magic byte verification to
/// prevent reading non-PDF files from disk.
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

  let bytes = fs::read(p).map_err(|error| error.to_string())?;

  // ISO 32000-1: A valid PDF file begins with or contains "%PDF-" in its header
  let header_limit = 1024.min(bytes.len());
  if bytes.len() < 5 || !bytes[..header_limit].windows(5).any(|w| w == b"%PDF-") {
    return Err("File is not a valid PDF document".into());
  }

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
