pub mod astris;
pub mod gamehub;
pub mod native_apps;
pub mod steam;

use async_trait::async_trait;
use thiserror::Error;

use crate::models::ImportedGame;

#[derive(Debug, Error)]
pub enum ImportError {
    #[error("{0}")]
    Message(String),
    #[error(transparent)]
    Io(#[from] std::io::Error),
}

#[async_trait]
pub trait GameImporter: Send + Sync {
    async fn detect(&self) -> Result<bool, ImportError>;
    async fn discover_games(&self) -> Result<Vec<ImportedGame>, ImportError>;
}

pub use astris::AstrisImporter;
pub use gamehub::{import_manual_path, GameHubImporter};
pub use native_apps::NativeAppImporter;
pub use steam::SteamImporter;
