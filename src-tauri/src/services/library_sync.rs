use anyhow::Result;

use crate::database::GameRepository;
use crate::models::ImportedGame;

/// Persists importer results without letting importers write to the DB directly.
pub struct LibrarySyncService;

impl LibrarySyncService {
    pub fn upsert_imported(repo: &GameRepository, imported: &[ImportedGame]) -> Result<usize> {
        repo.upsert_imported(imported)
    }
}
