use serde_json::Value;
use tauri::Manager;
use tauri_plugin_updater::UpdaterExt;

/// Fixed GitHub release tags whose `latest.json` describes the newest build per channel.
pub const UPDATE_CHANNELS: [&str; 2] = ["stable", "beta"];
const RELEASES_BASE: &str = "https://github.com/loopix8000/Lof-audio/releases/download";

/// Release builds get the public key from the generated updater config; dev builds have none.
pub fn updater_configured(app: &tauri::AppHandle) -> bool {
    app.config()
        .plugins
        .0
        .get("updater")
        .and_then(|u| u.get("pubkey"))
        .and_then(|k| k.as_str())
        .is_some_and(|k| !k.trim().is_empty())
}

/// Checks the channel manifest and returns metadata for the JS `Update` class, or `None` when up to date.
#[tauri::command]
pub async fn update_check(webview: tauri::Webview, channel: String) -> Result<Option<Value>, String> {
    if !UPDATE_CHANNELS.contains(&channel.as_str()) {
        return Err("업데이트 채널을 확인해 주세요.".into());
    }
    if !updater_configured(webview.app_handle()) {
        return Err("개발 빌드에서는 업데이트를 확인할 수 없습니다.".into());
    }
    let endpoint = format!("{RELEASES_BASE}/{channel}/latest.json");
    let stable_only = channel == "stable";
    let updater = webview
        .updater_builder()
        .endpoints(vec![tauri::Url::parse(&endpoint).map_err(|e| e.to_string())?])
        .map_err(|e| e.to_string())?
        .timeout(std::time::Duration::from_secs(15))
        // The stable channel never offers prereleases, even if a manifest points at one
        .version_comparator(move |current, release| {
            release.version > current && (!stable_only || release.version.pre.is_empty())
        })
        .build()
        .map_err(|e| e.to_string())?;

    let update = match updater.check().await {
        Ok(update) => update,
        Err(tauri_plugin_updater::Error::ReleaseNotFound) => {
            // Only a missing channel (404) means "no update"; surface real server errors
            let status = reqwest::Client::builder()
                .timeout(std::time::Duration::from_secs(15))
                .build()
                .map_err(|e| e.to_string())?
                .get(&endpoint)
                .send()
                .await
                .map_err(|e| e.to_string())?
                .status();
            if matches!(status.as_u16(), 404 | 204) {
                return Ok(None);
            }
            return Err(format!("업데이트 정보를 확인하지 못했습니다. 응답 코드 {}", status));
        }
        Err(e) => return Err(e.to_string()),
    };

    Ok(update.map(|update| {
        let mut metadata = serde_json::json!({
            "currentVersion": update.current_version,
            "version": update.version,
            "date": update.raw_json["pub_date"],
            "body": update.body,
            "rawJson": update.raw_json,
        });
        metadata["rid"] = serde_json::json!(webview.resources_table().add(update));
        metadata
    }))
}
