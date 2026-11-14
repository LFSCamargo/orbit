use anyhow::{anyhow, Result};
use std::collections::HashMap;
use crate::services::library::EntryState;
use super::GameRepository;

impl GameRepository {
    pub fn library_states(&self) -> Result<HashMap<String, EntryState>> {
        let conn = self.conn.lock().map_err(|_| anyhow!("Library is busy"))?;
        let mut statement = conn.prepare("SELECT entry_id, state_json FROM library_entry_state LIMIT 10000")?;
        let rows = statement.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))?;
        let mut result = HashMap::new();
        for row in rows { let (id, value) = row?; result.insert(id, serde_json::from_str(&value)?); }
        Ok(result)
    }
    pub fn save_library_state(&self, id: &str, state: &EntryState) -> Result<()> {
        let conn = self.conn.lock().map_err(|_| anyhow!("Library is busy"))?;
        conn.execute("INSERT INTO library_entry_state(entry_id, state_json) VALUES (?1, ?2) ON CONFLICT(entry_id) DO UPDATE SET state_json = excluded.state_json", rusqlite::params![id, serde_json::to_string(state)?])?;
        Ok(())
    }
}
