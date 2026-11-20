//! Cached Xbox Cloud Gaming catalog per market, in the metadata cache file.
//! Cached entries are browse-only and never library games.
use super::MetadataCacheRepository;
use crate::services::xcloud_catalog::XcloudCatalogEntry;
use anyhow::{anyhow, Result};
use rusqlite::params;

impl MetadataCacheRepository {
    /// Replaces the market's catalog in one transaction.
    pub fn replace_xcloud_catalog(
        &self,
        market: &str,
        entries: &[XcloudCatalogEntry],
        fetched_at: &str,
    ) -> Result<()> {
        let mut conn = self.conn.lock().map_err(|_| anyhow!("Catalog is busy"))?;
        let tx = conn.transaction()?;
        tx.execute(
            "DELETE FROM xcloud_catalog WHERE market = ?1",
            params![market],
        )?;
        {
            let mut insert = tx.prepare(
                "INSERT OR REPLACE INTO xcloud_catalog (market, product_id, position, entry_json)
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
            "INSERT INTO xcloud_catalog_fetches (market, fetched_at) VALUES (?1, ?2)
             ON CONFLICT(market) DO UPDATE SET fetched_at = excluded.fetched_at",
            params![market, fetched_at],
        )?;
        tx.commit()?;
        Ok(())
    }

    pub fn xcloud_catalog(&self, market: &str) -> Result<Vec<XcloudCatalogEntry>> {
        let conn = self.conn.lock().map_err(|_| anyhow!("Catalog is busy"))?;
        let mut statement = conn.prepare(
            "SELECT entry_json FROM xcloud_catalog WHERE market = ?1 ORDER BY position LIMIT 5000",
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

    pub fn xcloud_catalog_entry(
        &self,
        market: &str,
        product_id: &str,
    ) -> Result<Option<XcloudCatalogEntry>> {
        let conn = self.conn.lock().map_err(|_| anyhow!("Catalog is busy"))?;
        let json: Option<String> = conn
            .query_row(
                "SELECT entry_json FROM xcloud_catalog WHERE market = ?1 AND product_id = ?2",
                params![market, product_id],
                |r| r.get(0),
            )
            .ok();
        Ok(json.and_then(|j| serde_json::from_str(&j).ok()))
    }

    pub fn xcloud_catalog_fetched_at(&self, market: &str) -> Result<Option<String>> {
        let conn = self.conn.lock().map_err(|_| anyhow!("Catalog is busy"))?;
        Ok(conn
            .query_row(
                "SELECT fetched_at FROM xcloud_catalog_fetches WHERE market = ?1",
                params![market],
                |r| r.get(0),
            )
            .ok())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn entry(id: &str, title: &str) -> XcloudCatalogEntry {
        XcloudCatalogEntry {
            product_id: id.into(),
            title: title.into(),
            xbox_title_id: None,
            cover_url: None,
            square_url: None,
            hero_url: None,
            logo_url: None,
            launch_url: format!("https://www.xbox.com/en-US/play/launch/x/{id}"),
        }
    }

    #[test]
    fn replaces_catalog_per_market_in_order() {
        let cache = MetadataCacheRepository::open_in_memory().unwrap();
        cache
            .replace_xcloud_catalog(
                "US",
                &[entry("B00000000000", "B"), entry("A00000000000", "A")],
                "t1",
            )
            .unwrap();
        cache
            .replace_xcloud_catalog("BR", &[entry("C00000000000", "C")], "t1")
            .unwrap();
        cache
            .replace_xcloud_catalog("US", &[entry("A00000000000", "A2")], "t2")
            .unwrap();
        let us = cache.xcloud_catalog("US").unwrap();
        assert_eq!(us.len(), 1);
        assert_eq!(us[0].title, "A2");
        assert_eq!(cache.xcloud_catalog("BR").unwrap().len(), 1);
        assert_eq!(
            cache.xcloud_catalog_fetched_at("US").unwrap().as_deref(),
            Some("t2")
        );
        assert!(cache
            .xcloud_catalog_entry("US", "B00000000000")
            .unwrap()
            .is_none());
        assert!(cache
            .xcloud_catalog_entry("US", "A00000000000")
            .unwrap()
            .is_some());
    }
}
