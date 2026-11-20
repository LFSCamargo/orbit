//! Cloud launches reuse `play_sessions` and `games.last_played_at`: first and
//! last launch and launch count come from the same history as other games.
use super::GameRepository;
use crate::models::GameProvider;
use anyhow::{anyhow, Result};
use rusqlite::params;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CloudLaunchStats {
    pub first_launched_at: String,
    pub last_launched_at: String,
    pub launch_count: i64,
}

impl GameRepository {
    /// Records a dispatched cloud launch. Playtime is unknown for streamed
    /// games, so the session is closed immediately with no duration.
    pub fn record_cloud_launch(
        &self,
        game_id: &str,
        provider: &GameProvider,
        at: &str,
    ) -> Result<()> {
        let mut conn = self.conn.lock().map_err(|_| anyhow!("Library is busy"))?;
        let tx = conn.transaction()?;
        tx.execute(
            "INSERT INTO play_sessions (id, game_id, provider, started_at, ended_at)
             VALUES (?1, ?2, ?3, ?4, ?4)",
            params![
                uuid::Uuid::new_v4().to_string(),
                game_id,
                provider.as_str(),
                at
            ],
        )?;
        tx.execute(
            "UPDATE games SET last_played_at = ?1 WHERE id = ?2",
            params![at, game_id],
        )?;
        tx.commit()?;
        Ok(())
    }

    pub fn cloud_launch_stats(&self, game_id: &str) -> Result<Option<CloudLaunchStats>> {
        let conn = self.conn.lock().map_err(|_| anyhow!("Library is busy"))?;
        let row: (Option<String>, Option<String>, i64) = conn.query_row(
            "SELECT MIN(started_at), MAX(started_at), COUNT(*) FROM play_sessions WHERE game_id = ?1",
            params![game_id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        )?;
        Ok(match row {
            (Some(first), Some(last), count) if count > 0 => Some(CloudLaunchStats {
                first_launched_at: first,
                last_launched_at: last,
                launch_count: count,
            }),
            _ => None,
        })
    }
}
