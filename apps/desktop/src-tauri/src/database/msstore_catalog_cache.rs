//! Cached Microsoft Store / PC Game Pass catalog per market and owned PC titles
//! in the metadata cache SQLite database. Parameterized SQL only; bounded queries.

use super::MetadataCacheRepository;
use anyhow::{anyhow, Result};
use orbit_msstore::catalog::MsStoreCatalogEntry;
use rusqlite::params;

impl MetadataCacheRepository {
    /// Replaces the market's PC Game Pass catalog in one transaction.
    pub fn replace_msstore_catalog(
        &self,
        market: &str,
        entries: &[MsStoreCatalogEntry],
        fetched_at: &str,
    ) -> Result<()> {
        let mut conn = self.conn.lock().map_err(|_| anyhow!("Catalog is busy"))?;
        let tx = conn.transaction()?;
        tx.execute(
            "DELETE FROM msstore_catalog WHERE market = ?1",
            params![market],
        )?;
        {
            let mut insert = tx.prepare(
                "INSERT OR REPLACE INTO msstore_catalog (market, product_id, position, entry_json)
                 VALUES (?1, ?2, ?3, ?4)",
            )?;
            for (position, entry) in entries.iter().enumerate() {
                insert.execute(params![
                    market,
                    entry.product_id,
                    position as i64,
                    serde_json::to_string(entry)?
                ])?;
            }
        }
        tx.execute(
            "INSERT INTO msstore_catalog_fetches (market, fetched_at) VALUES (?1, ?2)
             ON CONFLICT(market) DO UPDATE SET fetched_at = excluded.fetched_at",
            params![market, fetched_at],
        )?;
        tx.commit()?;
        Ok(())
    }

    pub fn msstore_catalog(&self, market: &str) -> Result<Vec<MsStoreCatalogEntry>> {
        let conn = self.conn.lock().map_err(|_| anyhow!("Catalog is busy"))?;
        let mut statement = conn.prepare(
            "SELECT entry_json FROM msstore_catalog WHERE market = ?1 ORDER BY position LIMIT 5000",
        )?;
        let rows = statement.query_map(params![market], |r| r.get::<_, String>(0))?;
        let mut entries = Vec::new();
        for row in rows {
            if let Ok(entry) = serde_json::from_str(&row?) {
                entries.push(entry);
            }
        }
        Ok(entries)
    }

    pub fn msstore_catalog_entry(
        &self,
        market: &str,
        product_id: &str,
    ) -> Result<Option<MsStoreCatalogEntry>> {
        let conn = self.conn.lock().map_err(|_| anyhow!("Catalog is busy"))?;
        let owned: Option<String> = conn
            .query_row(
                "SELECT entry_json FROM msstore_owned WHERE product_id = ?1",
                params![product_id],
                |r| r.get(0),
            )
            .ok();
        if let Some(entry) = owned.and_then(|j| serde_json::from_str(&j).ok()) {
            return Ok(Some(entry));
        }
        let json: Option<String> = conn
            .query_row(
                "SELECT entry_json FROM msstore_catalog WHERE market = ?1 AND product_id = ?2",
                params![market, product_id],
                |r| r.get(0),
            )
            .ok();
        Ok(json.and_then(|j| serde_json::from_str(&j).ok()))
    }

    pub fn msstore_catalog_fetched_at(&self, market: &str) -> Result<Option<String>> {
        let conn = self.conn.lock().map_err(|_| anyhow!("Catalog is busy"))?;
        Ok(conn
            .query_row(
                "SELECT fetched_at FROM msstore_catalog_fetches WHERE market = ?1",
                params![market],
                |r| r.get(0),
            )
            .ok())
    }

    /// Replaces the user's owned Microsoft Store PC titles snapshot.
    pub fn replace_msstore_owned(
        &self,
        entries: &[MsStoreCatalogEntry],
        updated_at: &str,
    ) -> Result<()> {
        let mut conn = self.conn.lock().map_err(|_| anyhow!("Catalog is busy"))?;
        let tx = conn.transaction()?;
        tx.execute("DELETE FROM msstore_owned", [])?;
        {
            let mut insert = tx.prepare(
                "INSERT OR REPLACE INTO msstore_owned (product_id, entry_json, updated_at)
                 VALUES (?1, ?2, ?3)",
            )?;
            for entry in entries {
                insert.execute(params![
                    entry.product_id,
                    serde_json::to_string(entry)?,
                    updated_at
                ])?;
            }
        }
        tx.commit()?;
        Ok(())
    }

    pub fn msstore_owned(&self) -> Result<Vec<MsStoreCatalogEntry>> {
        let conn = self.conn.lock().map_err(|_| anyhow!("Catalog is busy"))?;
        let mut statement = conn.prepare(
            "SELECT entry_json FROM msstore_owned ORDER BY product_id LIMIT 5000",
        )?;
        let rows = statement.query_map([], |r| r.get::<_, String>(0))?;
        let mut entries = Vec::new();
        for row in rows {
            if let Ok(entry) = serde_json::from_str(&row?) {
                entries.push(entry);
            }
        }
        Ok(entries)
    }

    pub fn clear_msstore_owned(&self) -> Result<()> {
        let conn = self.conn.lock().map_err(|_| anyhow!("Catalog is busy"))?;
        conn.execute("DELETE FROM msstore_owned", [])?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample(id: &str, title: &str, owned: bool) -> MsStoreCatalogEntry {
        MsStoreCatalogEntry {
            product_id: id.into(),
            title: title.into(),
            description: Some("A PC Game Pass title.".into()),
            content_id: Some("11111111-2222-3333-4444-555555555555".into()),
            package_family_name: None,
            xbox_title_id: None,
            install_size_bytes: Some(1_000_000),
            cover_url: None,
            square_url: None,
            hero_url: None,
            logo_url: None,
            owned,
            game_pass_pc: !owned,
        }
    }

    #[test]
    fn caches_msstore_catalog_and_owned_entitlements() {
        let cache = MetadataCacheRepository::open_in_memory().unwrap();
        cache
            .replace_msstore_catalog(
                "en-US",
                &[sample("9P8LR42PTRGJ", "33 Immortals", false)],
                "t1",
            )
            .unwrap();
        cache
            .replace_msstore_owned(&[sample("9NGLST31DG26", "Forza Horizon 5", true)], "t1")
            .unwrap();

        assert_eq!(cache.msstore_catalog("en-US").unwrap().len(), 1);
        assert_eq!(cache.msstore_owned().unwrap().len(), 1);
        assert_eq!(
            cache.msstore_catalog_fetched_at("en-US").unwrap().as_deref(),
            Some("t1")
        );
        assert_eq!(
            cache
                .msstore_catalog_entry("en-US", "9NGLST31DG26")
                .unwrap()
                .unwrap()
                .title,
            "Forza Horizon 5"
        );
        cache.clear_msstore_owned().unwrap();
        assert!(cache.msstore_owned().unwrap().is_empty());
    }
}
