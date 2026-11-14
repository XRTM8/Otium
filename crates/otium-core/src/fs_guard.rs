use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};

/// Validates a user-provided local file path against symlink traversal,
/// allowed extensions, non-empty/maximum file bounds, and optional `%PDF-` magic header.
pub fn validate_local_file(
    raw_path: &str,
    allowed_exts: &[&str],
    max_size: u64,
    require_pdf_magic: bool,
) -> std::result::Result<PathBuf, String> {
    let candidate = Path::new(raw_path);
    let link_meta = fs::symlink_metadata(candidate).map_err(|e| e.to_string())?;
    if link_meta.file_type().is_symlink() {
        return Err("Refusing to follow symbolic link path".into());
    }

    let canonical = fs::canonicalize(candidate).map_err(|e| e.to_string())?;
    if !canonical.is_file() {
        return Err("Target path is not a file".into());
    }

    let ext = canonical
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_ascii_lowercase())
        .unwrap_or_default();

    if !allowed_exts.contains(&ext.as_str()) {
        return Err("Unsupported file type".into());
    }

    let metadata = fs::metadata(&canonical).map_err(|e| e.to_string())?;
    let file_size = metadata.len();
    if file_size == 0 {
        return Err("File is empty (0 bytes)".into());
    }
    if file_size > max_size {
        return Err("File exceeds maximum supported size".into());
    }

    if require_pdf_magic {
        let mut file = fs::File::open(&canonical).map_err(|e| e.to_string())?;
        let mut header = [0u8; 1024];
        let n = file.read(&mut header).map_err(|e| e.to_string())?;
        if n < 5 || !header[..n].windows(5).any(|w| w == b"%PDF-") {
            return Err("File is not a valid PDF document (missing %PDF- header)".into());
        }
    }

    Ok(canonical)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validate_local_file_enforces_extension_size_and_pdf_magic() {
        let dir = std::env::temp_dir().join(format!("otium-fs-guard-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).expect("create tempdir");

        let valid_pdf = dir.join("lesson.pdf");
        fs::write(&valid_pdf, b"%PDF-1.7\n1 0 obj\n<<>>\nendobj\n").expect("write valid pdf");
        let resolved = validate_local_file(
            valid_pdf.to_str().expect("utf8 path"),
            &["pdf"],
            1024 * 1024,
            true,
        );
        assert!(resolved.is_ok());

        let fake_pdf = dir.join("not_really.pdf");
        fs::write(&fake_pdf, b"<html>not a pdf</html>").expect("write fake pdf");
        assert!(validate_local_file(
            fake_pdf.to_str().expect("utf8 path"),
            &["pdf"],
            1024 * 1024,
            true,
        )
        .is_err());

        let empty_pdf = dir.join("empty.pdf");
        fs::write(&empty_pdf, b"").expect("write empty");
        assert!(validate_local_file(
            empty_pdf.to_str().expect("utf8 path"),
            &["pdf"],
            1024 * 1024,
            true,
        )
        .is_err());

        let blocked_ext = dir.join("payload.exe");
        fs::write(&blocked_ext, b"MZ\x90\x00").expect("write blocked ext");
        assert!(validate_local_file(
            blocked_ext.to_str().expect("utf8 path"),
            &["pdf", "png"],
            1024 * 1024,
            false,
        )
        .is_err());

        let _ = fs::remove_dir_all(&dir);
    }
}
