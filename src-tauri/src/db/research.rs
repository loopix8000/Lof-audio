use super::Database;
use rusqlite::params;
use serde_json::{json, Value};

impl Database {
    pub(crate) fn begin_metadata_research(
        &self,
        proposal: &Value,
        selected_fields: &[String],
        plan_hash: &str,
    ) -> Result<i64, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.execute(
            "INSERT INTO metadata_research_log (workspace_id,track_id,status,proposal_json,selected_fields_json,plan_hash,revision_before) VALUES (?1,?2,'pending',?3,?4,?5,?6)",
            params![proposal["workspaceId"].as_i64(), proposal["trackId"].as_i64(), proposal.to_string(), serde_json::to_string(selected_fields).map_err(|e| e.to_string())?, plan_hash, proposal["expectedRevision"].as_str()],
        ).map_err(|e| e.to_string())?;
        Ok(conn.last_insert_rowid())
    }

    pub(crate) fn finish_metadata_research(
        &self,
        id: i64,
        status: &str,
        revision_after: Option<&str>,
        error: Option<&str>,
    ) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let changed = conn
            .execute(
                "UPDATE metadata_research_log SET status=?2,revision_after=?3,error=?4 WHERE id=?1",
                params![id, status, revision_after, error],
            )
            .map_err(|e| e.to_string())?;
        if changed != 1 {
            return Err("조사 기록을 찾을 수 없습니다.".into());
        }
        Ok(())
    }

    pub(crate) fn metadata_research_history(
        &self,
        workspace_id: i64,
        track_id: i64,
        limit: usize,
    ) -> Result<Vec<Value>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let mut statement = conn.prepare("SELECT id,created_at,status,proposal_json,selected_fields_json,plan_hash,revision_before,revision_after,error FROM metadata_research_log WHERE workspace_id=?1 AND track_id=?2 ORDER BY id DESC LIMIT ?3").map_err(|e| e.to_string())?;
        let rows = statement
            .query_map(params![workspace_id, track_id, limit as i64], |row| {
                Ok((
                    row.get::<_, i64>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, String>(4)?,
                    row.get::<_, String>(5)?,
                    row.get::<_, String>(6)?,
                    row.get::<_, Option<String>>(7)?,
                    row.get::<_, Option<String>>(8)?,
                ))
            })
            .map_err(|e| e.to_string())?;
        rows.map(|row| {
            let (id,at,status,proposal,selected,hash,before,after,error) = row.map_err(|e| e.to_string())?;
            Ok(json!({"id":id,"createdAt":at,"status":status,"proposal":serde_json::from_str::<Value>(&proposal).map_err(|e| e.to_string())?,"selectedFields":serde_json::from_str::<Value>(&selected).map_err(|e| e.to_string())?,"planHash":hash,"revisionBefore":before,"revisionAfter":after,"error":error,"sourceVerification":"agent_reported"}))
        }).collect()
    }
}
