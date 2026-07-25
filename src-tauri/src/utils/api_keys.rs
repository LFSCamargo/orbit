use std::env;

use crate::database::GameRepository;

const TGDB_ENV: &str = "THE_GAMES_DB_API_KEY";
const SGDB_ENV: &str = "STEAMGRIDDB_API_KEY";

pub fn init_env() {
    if dotenvy::dotenv().is_err() {
        let _ = dotenvy::from_filename(".env");
        let _ = dotenvy::from_filename("../.env");
    }
}

pub fn thegamesdb_api_key(repo: &GameRepository) -> Option<String> {
    resolve_key(repo, TGDB_ENV, "theGamesDbApiKey")
}

pub fn steamgriddb_api_key(repo: &GameRepository) -> Option<String> {
    resolve_key(repo, SGDB_ENV, "steamGridDbApiKey")
}

fn resolve_key(repo: &GameRepository, env_name: &str, setting_key: &str) -> Option<String> {
    if let Ok(value) = env::var(env_name) {
        let trimmed = value.trim();
        if !trimmed.is_empty() {
            return Some(trimmed.to_string());
        }
    }

    repo.get_setting(setting_key)
        .ok()
        .flatten()
        .and_then(|value| value.as_str().map(str::to_string))
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}
