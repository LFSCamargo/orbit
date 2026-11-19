//! Lightweight native Steam client used by containers. Catalog and downloads
//! stay on official APIs / SteamCMD; games authenticate through Valve's client
//! inside the container.
pub mod agent;
pub mod agent_host;
pub mod client_provision;
pub mod cloud;
pub mod downloads;
pub mod installed;
pub mod login;
pub mod session;
