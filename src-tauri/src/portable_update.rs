use sha2::{Digest, Sha256};
use std::{fs::OpenOptions, io::Write, time::Duration};
use tauri::{AppHandle, Manager};
use tauri_plugin_opener::OpenerExt;

const MAX_SIZE: u64 = 192 * 1024 * 1024;

pub(crate) async fn download_portable_update(
    app: AppHandle,
    url: String,
    sha256: String,
) -> Result<(), String> {
    let url = reqwest::Url::parse(&url).map_err(|e| e.to_string())?;
    let name = url
        .path_segments()
        .and_then(|mut segments| segments.next_back())
        .unwrap_or_default()
        .to_owned();
    if url.scheme() != "https"
        || url.host_str() != Some("github.com")
        || !url.path().starts_with("/XRTM8/Otium/releases/download/")
        || !name.starts_with("Otium_")
        || !name.ends_with("_x64-portable.exe")
        || !name.bytes().all(|b| b.is_ascii_alphanumeric() || b"_.-".contains(&b))
        || sha256.len() != 64
        || !sha256.bytes().all(|b| b.is_ascii_hexdigit())
    {
        return Err("The portable release link or checksum is invalid.".into());
    }

    let dir = app.path().download_dir().map_err(|e| e.to_string())?;
    let target = dir.join(&name);
    let partial = dir.join(format!("{name}.download"));
    let mut file = OpenOptions::new().write(true).create_new(true).open(&partial)
        .map_err(|e| format!("Could not start the download in Downloads: {e}"))?;
    let result = async {
        let client = reqwest::Client::builder()
            .https_only(true)
            .timeout(Duration::from_secs(180))
            .redirect(reqwest::redirect::Policy::custom(|attempt| {
                if attempt.previous().len() < 5 && attempt.url().scheme() == "https"
                    && matches!(attempt.url().host_str(), Some("github.com" | "release-assets.githubusercontent.com" | "objects.githubusercontent.com")) {
                    attempt.follow()
                } else {
                    attempt.error("Unexpected download redirect")
                }
            }))
            .build().map_err(|e| e.to_string())?;
        let mut response = client.get(url).send().await.and_then(|r| r.error_for_status()).map_err(|e| e.to_string())?;
        let mut hasher = Sha256::new();
        let mut size = 0;
        while let Some(bytes) = response.chunk().await.map_err(|e| e.to_string())? {
            size += bytes.len() as u64;
            if size > MAX_SIZE {
                return Err("The portable download is too large.".into());
            }
            hasher.update(&bytes);
            file.write_all(&bytes).map_err(|e| e.to_string())?;
        }
        if !format!("{:x}", hasher.finalize()).eq_ignore_ascii_case(&sha256) {
            return Err("The portable download failed its integrity check.".into());
        }
        file.sync_all().map_err(|e| e.to_string())?;
        Ok::<_, String>(())
    }.await;
    drop(file);
    let result = result.and_then(|()| std::fs::rename(&partial, &target).map_err(|e| e.to_string()));
    if result.is_err() {
        let _ = std::fs::remove_file(&partial);
    }
    result?;
    let _ = app.opener().reveal_item_in_dir(target);
    Ok(())
}
