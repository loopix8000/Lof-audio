use crate::{models::WorkspaceState, AppState};
use tauri::State;

#[tauri::command]
pub async fn create_workspace(
    name: String,
    state: State<'_, AppState>,
) -> Result<WorkspaceState, String> {
    state.db.create_workspace(&name)
}

#[tauri::command]
pub async fn rename_workspace(
    workspace_id: i64,
    name: String,
    state: State<'_, AppState>,
) -> Result<WorkspaceState, String> {
    state.db.rename_workspace(workspace_id, &name)
}

#[tauri::command]
pub async fn select_workspace(
    workspace_id: i64,
    state: State<'_, AppState>,
) -> Result<WorkspaceState, String> {
    state.db.select_workspace(workspace_id)
}

#[tauri::command]
pub async fn delete_workspace(
    workspace_id: i64,
    state: State<'_, AppState>,
) -> Result<WorkspaceState, String> {
    let _guard = state.metadata_lock.lock().map_err(|e| e.to_string())?;
    state.db.delete_workspace(workspace_id)
}
