use std::env;
use std::fs;
use std::path::Path;

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

#[tauri::command]
fn read_pdf_bytes(path: String) -> Result<Vec<u8>, String> {
  fs::read(&path).map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .invoke_handler(tauri::generate_handler![get_initial_pdf, read_pdf_bytes])
    .setup(|app| {
      #[cfg(desktop)]
      {
        use tauri::Manager;
        if let Some(window) = app.get_webview_window("main") {
          let _ = window;
        }
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while building tauri application");
}
