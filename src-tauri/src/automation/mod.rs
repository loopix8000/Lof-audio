pub mod dispatch;
mod http;
mod research;
pub mod stdio;
#[cfg(test)]
mod tests;
pub mod tools;

use serde_json::{json, Value};
use std::{future::Future, path::PathBuf, pin::Pin, sync::Arc};
use tauri::{Emitter, Manager, State};

pub use http::ApiServer;
pub type Handler = Arc<
    dyn Fn(String, Value) -> Pin<Box<dyn Future<Output = Result<Value, String>> + Send>>
        + Send
        + Sync,
>;

pub fn handler(app: tauri::AppHandle) -> Handler {
    Arc::new(move |name, args| {
        let app = app.clone();
        Box::pin(async move {
            let state = app.state::<crate::AppState>();
            let result = dispatch::call(&state, &name, &args).await?;
            if name.starts_with("playback_") && name != "playback_status" {
                let _ = app.emit("automation-playback", json!({"action":name,"playback":result,"workspaceState":state.db.get_workspace_state()?}));
            } else if ["track_update", "track_favorite", "metadata_research_apply"]
                .contains(&name.as_str())
            {
                let _ = app.emit("library-changed", vec![args["trackId"].as_i64().unwrap()]);
            } else if tools::definitions()
                .as_array()
                .unwrap()
                .iter()
                .any(|tool| tool["name"] == name && tool["annotations"]["readOnlyHint"] == false)
                && !name.starts_with("skill_")
            {
                let _ = app.emit("automation-library-changed", ());
            }
            Ok(result)
        })
    })
}

#[tauri::command]
pub fn get_automation_info(server: State<'_, ApiServer>) -> Result<Value, String> {
    let executable = std::env::current_exe().map_err(|e| e.to_string())?;
    Ok(
        json!({"url":format!("http://127.0.0.1:{}/rpc",server.port),"mcpUrl":format!("http://127.0.0.1:{}/mcp",server.port),
        "headers":{"Authorization":format!("Bearer {}",server.token)},"runtimePath":server.runtime_path,
        "toolCount":tools::definitions().as_array().unwrap().len(),
        "mcpConfig":{"mcpServers":{"lof-audio":{"command":executable,"args":["--mcp","--runtime",server.runtime_path]}}}}),
    )
}

#[tauri::command]
pub fn get_audio_skill_status(skills_directory: Option<String>) -> Result<Value, String> {
    crate::skills::status(skills_directory.as_deref())
}

#[tauri::command]
pub fn install_audio_skill(
    skills_directory: String,
    expected_revision: String,
    expected_installed_revision: Option<String>,
) -> Result<Value, String> {
    crate::skills::install(
        &skills_directory,
        &expected_revision,
        expected_installed_revision.as_deref(),
    )
}

pub fn cli() -> bool {
    let args: Vec<_> = std::env::args().collect();
    if args.iter().any(|arg| arg == "--export-tools") {
        print!(
            "{}",
            serde_json::to_string_pretty(tools::definitions()).unwrap()
        );
        return true;
    }
    if !args.iter().any(|arg| arg == "--mcp") {
        return false;
    }
    let runtime = args
        .iter()
        .position(|arg| arg == "--runtime")
        .and_then(|pos| args.get(pos + 1))
        .map(PathBuf::from)
        .or_else(|| std::env::var_os("LOF_AUDIO_RUNTIME").map(PathBuf::from));
    if let Some(runtime) = runtime {
        if let Err(error) = stdio::run(&runtime) {
            eprintln!("Lof Audio MCP: {error}");
            std::process::exit(1);
        }
    } else {
        eprintln!("Lof Audio 설정에서 복사한 --runtime 경로가 필요합니다.");
        std::process::exit(2);
    }
    true
}

pub fn error(value: &str) -> Value {
    let (code, message) = value
        .split_once(": ")
        .filter(|(code, _)| code.chars().all(|c| c.is_ascii_uppercase() || c == '_'))
        .unwrap_or(("ERROR", value));
    json!({"code":code,"error":message})
}
