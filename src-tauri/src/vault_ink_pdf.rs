use tauri::ipc::{InvokeBody, Request, Response};

#[cfg_attr(test, allow(dead_code))]
fn extract_raw_bytes(request: Request<'_>) -> Result<Vec<u8>, String> {
  let InvokeBody::Raw(bytes) = request.body() else {
    return Err("Expected raw binary IPC payload".into());
  };
  Ok(bytes.clone())
}

#[cfg_attr(test, allow(dead_code))]
#[tauri::command]
pub(crate) async fn rust_inspect_pdf_bytes(
  request: Request<'_>,
) -> Result<otium_pdf::PdfDocumentInfo, String> {
  let bytes = extract_raw_bytes(request)?;
  tauri::async_runtime::spawn_blocking(move || {
    otium_pdf::PdfInspector::inspect_bytes(&bytes).map_err(|e| e.to_string())
  })
  .await
  .map_err(|e| e.to_string())?
}

#[tauri::command]
pub(crate) fn rust_simplify_ink_points(
  points: Vec<otium_ink::InkPoint>,
  tolerance: f32,
) -> Vec<otium_ink::InkPoint> {
  otium_ink::PointDecimator::simplify(&points, tolerance.max(0.05))
}

#[tauri::command]
pub(crate) fn rust_export_ink_svg(
  width: f32,
  height: f32,
  strokes: Vec<otium_ink::Stroke>,
) -> String {
  let mut canvas = otium_ink::InkCanvas::new(width.max(1.0), height.max(1.0));
  for stroke in strokes {
    canvas.strokes.push(stroke);
  }
  canvas.export_svg()
}

#[cfg_attr(test, allow(dead_code))]
#[tauri::command]
pub(crate) async fn rust_vault_seal_bytes(request: Request<'_>) -> Result<Response, String> {
  let passphrase = request
    .headers()
    .get("x-vault-passphrase")
    .and_then(|v| v.to_str().ok())
    .map(str::to_owned)
    .ok_or_else(|| "Missing x-vault-passphrase header".to_string())?;
  if passphrase.trim().is_empty() {
    return Err("Passphrase cannot be empty".into());
  }
  let bytes = extract_raw_bytes(request)?;
  let sealed = tauri::async_runtime::spawn_blocking(move || {
    otium_vault::VaultCrypto::seal_bytes(&passphrase, &bytes).map_err(|e| e.to_string())
  })
  .await
  .map_err(|e| e.to_string())??;
  Ok(Response::new(sealed))
}

#[cfg_attr(test, allow(dead_code))]
#[tauri::command]
pub(crate) async fn rust_vault_unseal_bytes(request: Request<'_>) -> Result<Response, String> {
  let passphrase = request
    .headers()
    .get("x-vault-passphrase")
    .and_then(|v| v.to_str().ok())
    .map(str::to_owned)
    .ok_or_else(|| "Missing x-vault-passphrase header".to_string())?;
  let bytes = extract_raw_bytes(request)?;
  let opened = tauri::async_runtime::spawn_blocking(move || {
    otium_vault::VaultCrypto::unseal_bytes(&passphrase, &bytes).map_err(|e| e.to_string())
  })
  .await
  .map_err(|e| e.to_string())??;
  Ok(Response::new(opened))
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn simplify_ink_and_svg_export_use_otium_ink() {
    let pts = vec![
      otium_ink::InkPoint::new(0.0, 0.0, 1.0, 0),
      otium_ink::InkPoint::new(5.0, 5.0, 1.0, 10),
      otium_ink::InkPoint::new(10.0, 10.0, 1.0, 20),
    ];
    let decimated = rust_simplify_ink_points(pts, 0.5);
    assert_eq!(decimated.len(), 2);

    let mut stroke = otium_ink::Stroke::new(
      "s1".into(),
      otium_ink::InkTool::Pen,
      "#10B981".into(),
      3.0,
      1.0,
    );
    stroke.points = decimated;
    let svg = rust_export_ink_svg(400.0, 300.0, vec![stroke]);
    assert!(svg.contains("<svg"));
    assert!(svg.contains("stroke=\"#10B981\""));
  }

  #[test]
  fn vault_seal_unseal_roundtrip_and_pdf_validation() {
    let sealed = otium_vault::VaultCrypto::seal_bytes("otium-key", b"private-notes").expect("seal");
    let opened = otium_vault::VaultCrypto::unseal_bytes("otium-key", &sealed).expect("unseal");
    assert_eq!(opened, b"private-notes");
    assert!(otium_pdf::PdfInspector::validate_header(b"%PDF-1.7\n").is_ok());
    assert!(otium_pdf::PdfInspector::validate_header(b"bad").is_err());
  }
}
