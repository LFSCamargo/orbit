//! Optional APFS transparent compression of installed games: per-file
//! compression (`afsc`), whole folders (`tree`), which folders (`targets`)
//! and the Settings switch with its background job (`job`).
pub mod afsc;
pub mod job;
pub mod targets;
pub mod tree;
