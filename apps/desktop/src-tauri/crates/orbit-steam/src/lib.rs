//! Lightweight Steam client types for Orbit. The crate talks in saved identity,
//! product info, depot plans, and cloud listings — never passwords.
pub mod agent;
pub mod appinfo;
pub mod cloud;
pub mod connect_cache;
pub mod depot;
pub mod owned;
pub mod product;
pub mod session;
pub mod token;

pub use agent::{select_presence, AgentReply, AgentRequest, SteamPresence};
pub use cloud::{CloudFile, CloudListing};
pub use connect_cache::{
    config_vdf, connect_cache_key, crc32, local_vdf, loginusers_vdf, saved_token_hex, unhex,
};
pub use depot::DepotPlan;
pub use owned::{from_catalog, OwnedGame};
pub use product::{parse_app_id, ProductInfo};
pub use session::NativeSession;
pub use token::is_client_token;
