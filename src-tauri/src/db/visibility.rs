use super::Database;
use crate::models::{HiddenItem, HiddenKind, HideTarget};
use crate::visibility::{folder_key, Visibility};
use rusqlite::params;

impl Database {
    pub fn get_hidden_items(&self) -> Result<Vec<HiddenItem>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let mut stmt = conn
            .prepare("SELECT id, kind, value, label FROM hidden_items ORDER BY id DESC")
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |row| {
                Ok((
                    row.get::<_, i64>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                ))
            })
            .map_err(|e| e.to_string())?;
        rows.map(|row| {
            let (id, kind, value, label) = row.map_err(|e| e.to_string())?;
            let kind = serde_json::from_value(serde_json::Value::String(kind))
                .map_err(|e| e.to_string())?;
            Ok(HiddenItem {
                id,
                kind,
                value,
                label,
            })
        })
        .collect()
    }

    pub fn visibility(&self) -> Result<Visibility, String> {
        Ok(Visibility::new(&self.get_hidden_items()?))
    }

    pub fn hide_items(&self, targets: Vec<HideTarget>) -> Result<(), String> {
        if targets.is_empty() || targets.len() > 10000 {
            return Err("숨길 항목을 선택하세요.".into());
        }
        let mut conn = self.conn.lock().map_err(|e| e.to_string())?;
        let tx = conn.transaction().map_err(|e| e.to_string())?;
        for target in targets {
            if target.value.is_empty() || target.value.len() > 32768 || target.label.len() > 32768 {
                return Err("숨길 항목이 올바르지 않습니다.".into());
            }
            let value = match target.kind {
                HiddenKind::Track | HiddenKind::Folder => folder_key(&target.value),
                _ => target.value,
            };
            let kind = serde_json::to_value(&target.kind).map_err(|e| e.to_string())?;
            tx.execute("INSERT INTO hidden_items (kind, value, label) VALUES (?1, ?2, ?3) ON CONFLICT(kind, value) DO UPDATE SET label = excluded.label",
                params![kind.as_str().unwrap(), value, target.label]).map_err(|e| e.to_string())?;
        }
        tx.execute("INSERT INTO settings (key, value) VALUES ('workspaceRevision', '1') ON CONFLICT(key) DO UPDATE SET value = CAST(CAST(value AS INTEGER) + 1 AS TEXT)", []).map_err(|e| e.to_string())?;
        tx.commit().map_err(|e| e.to_string())
    }

    pub fn unhide_item(&self, id: i64) -> Result<(), String> {
        let mut conn = self.conn.lock().map_err(|e| e.to_string())?;
        let tx = conn.transaction().map_err(|e| e.to_string())?;
        tx.execute("DELETE FROM hidden_items WHERE id = ?1", [id])
            .map_err(|e| e.to_string())?;
        tx.execute("INSERT INTO settings (key, value) VALUES ('workspaceRevision', '1') ON CONFLICT(key) DO UPDATE SET value = CAST(CAST(value AS INTEGER) + 1 AS TEXT)", []).map_err(|e| e.to_string())?;
        tx.commit().map_err(|e| e.to_string())
    }
}
