use super::ApiServer;
use serde_json::{json, Value};
use std::{fs, io::Write, path::Path, sync::Mutex};
use tauri::{Manager, State};
use toml_edit::{value, Array, DocumentMut, Item, Table};

static CONFIG_LOCK: Mutex<()> = Mutex::new(());

pub(super) fn configure(
    app: tauri::AppHandle,
    server: State<'_, ApiServer>,
) -> Result<Value, String> {
    let home = match std::env::var_os("CODEX_HOME").filter(|v| !v.is_empty()) {
        Some(path) => path.into(),
        None => app
            .path()
            .home_dir()
            .map_err(|e| e.to_string())?
            .join(".codex"),
    };
    if !home.is_absolute() {
        return Err("Codex 설정 폴더는 절대 경로여야 합니다.".into());
    }
    let executable = std::env::current_exe().map_err(|e| e.to_string())?;
    install(&home.join("config.toml"), &executable, &server.runtime_path)
}

fn updated_config(source: &str, executable: &Path, runtime: &Path) -> Result<String, String> {
    let mut document = source.parse::<DocumentMut>().map_err(|_| {
        "Codex 설정을 해석하지 못했습니다. 기존 설정 파일을 확인하세요.".to_string()
    })?;
    let servers = document
        .entry("mcp_servers")
        .or_insert(Item::Table(Table::new()))
        .as_table_like_mut()
        .ok_or("Codex의 mcp_servers 설정은 테이블이어야 합니다.")?;
    let server = servers
        .entry("lof-audio")
        .or_insert(Item::Table(Table::new()))
        .as_table_like_mut()
        .ok_or("Codex의 lof-audio 설정은 테이블이어야 합니다.")?;
    // 다른 서버와 사용자별 도구 권한은 보존하고 기존 HTTP 연결 정보만 교체한다.
    for key in [
        "url",
        "bearer_token_env_var",
        "http_headers",
        "env_http_headers",
        "http_headers_helper",
        "auth",
        "oauth",
    ] {
        server.remove(key);
    }
    server.insert(
        "command",
        value(
            executable
                .to_str()
                .ok_or("실행 파일 경로가 올바르지 않습니다.")?,
        ),
    );
    let mut args = Array::new();
    args.push("--mcp");
    args.push("--runtime");
    args.push(
        runtime
            .to_str()
            .ok_or("연결 파일 경로가 올바르지 않습니다.")?,
    );
    server.insert("args", value(args));
    server.insert("enabled", value(true));
    server.insert("environment_id", value("local"));
    Ok(document.to_string())
}

fn install(config: &Path, executable: &Path, runtime: &Path) -> Result<Value, String> {
    let _guard = CONFIG_LOCK
        .lock()
        .map_err(|_| "Codex 설정 작업을 시작하지 못했습니다.")?;
    let original = match fs::read_to_string(config) {
        Ok(content) => Some(content),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => None,
        Err(error) => return Err(format!("Codex 설정을 읽지 못했습니다: {error}")),
    };
    let updated = updated_config(original.as_deref().unwrap_or(""), executable, runtime)?;
    if original.as_ref() == Some(&updated) {
        return Ok(json!({"changed":false,"configPath":config,"backupPath":null}));
    }
    let directory = config
        .parent()
        .ok_or("Codex 설정의 상위 폴더가 없습니다.")?;
    fs::create_dir_all(directory).map_err(|e| e.to_string())?;
    let mut output = tempfile::NamedTempFile::new_in(directory).map_err(|e| e.to_string())?;
    let permissions = fs::metadata(config).ok().map(|meta| meta.permissions());
    if let Some(permissions) = &permissions {
        output
            .as_file()
            .set_permissions(permissions.clone())
            .map_err(|e| e.to_string())?;
    }
    output
        .write_all(updated.as_bytes())
        .map_err(|e| e.to_string())?;
    output.as_file().sync_all().map_err(|e| e.to_string())?;
    if fs::read_to_string(config).ok() != original {
        return Err("Codex 설정이 다른 곳에서 변경되었습니다. 다시 시도하세요.".into());
    }
    let backup = if let Some(original) = &original {
        let mut backup = tempfile::Builder::new()
            .prefix("config.toml.lof-audio-backup-")
            .tempfile_in(directory)
            .map_err(|e| e.to_string())?;
        if let Some(permissions) = permissions {
            backup
                .as_file()
                .set_permissions(permissions)
                .map_err(|e| e.to_string())?;
        }
        backup
            .write_all(original.as_bytes())
            .map_err(|e| e.to_string())?;
        backup.as_file().sync_all().map_err(|e| e.to_string())?;
        Some(backup.keep().map_err(|e| e.to_string())?.1)
    } else {
        None
    };
    output
        .persist(config)
        .map_err(|e| format!("Codex 설정 저장 실패: {e}"))?;
    Ok(json!({"changed":true,"configPath":config,"backupPath":backup}))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn registration_replaces_stale_http_and_preserves_other_settings_with_backup() {
        let directory = tempfile::tempdir().unwrap();
        let config = directory.path().join("config.toml");
        let original = "# 사용자 설정\nmodel = 'example'\n[mcp_servers.other]\ncommand = 'other'\n[mcp_servers.lof-audio]\nurl = 'http://127.0.0.1:11932/mcp'\nbearer_token_env_var = 'OLD_TOKEN'\nenabled = false\n[mcp_servers.lof-audio.http_headers]\nAuthorization = '오래된 인증 정보'\n[mcp_servers.lof-audio.tools.track_update]\napproval_mode = 'prompt'\n";
        fs::write(&config, original).unwrap();
        let executable = directory.path().join("Lof Audio.exe");
        let runtime = directory.path().join("runtime.json");
        let result = install(&config, &executable, &runtime).unwrap();
        assert_eq!(
            fs::read_to_string(result["backupPath"].as_str().unwrap()).unwrap(),
            original
        );
        let updated = fs::read_to_string(&config).unwrap();
        assert!(updated.starts_with("# 사용자 설정\n"));
        let parsed = updated.parse::<DocumentMut>().unwrap();
        assert_eq!(parsed["model"].as_str(), Some("example"));
        assert_eq!(
            parsed["mcp_servers"]["other"]["command"].as_str(),
            Some("other")
        );
        let server = parsed["mcp_servers"]["lof-audio"].as_table().unwrap();
        assert!(!server.contains_key("url"));
        assert!(!server.contains_key("http_headers"));
        assert!(!server.contains_key("bearer_token_env_var"));
        assert_eq!(server["command"].as_str(), executable.to_str());
        assert_eq!(
            server["args"].as_array().unwrap().get(2).unwrap().as_str(),
            runtime.to_str()
        );
        assert_eq!(
            server["tools"]["track_update"]["approval_mode"].as_str(),
            Some("prompt")
        );
        assert_eq!(
            install(&config, &executable, &runtime).unwrap()["changed"],
            false
        );
    }

    #[test]
    fn registration_creates_config_and_leaves_invalid_config_untouched() {
        let directory = tempfile::tempdir().unwrap();
        let config = directory.path().join(".codex/config.toml");
        let executable = directory.path().join("Lof Audio.exe");
        let runtime = directory.path().join("runtime.json");
        assert_eq!(
            install(&config, &executable, &runtime).unwrap()["changed"],
            true
        );
        let invalid = "[mcp_servers\n";
        fs::write(&config, invalid).unwrap();
        assert!(install(&config, &executable, &runtime).is_err());
        assert_eq!(fs::read_to_string(config).unwrap(), invalid);
    }
}
