//! Whether a game session is running, so Orbit's background loops stand down
//! while the game plays: the controller poller only watches Home (no 60 Hz
//! stick-scroll events into the hidden WebView) and Steam status polling, which
//! runs a system-wide `ps`, pauses.

use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

static RUNNING: AtomicBool = AtomicBool::new(false);

/// Controller polling while Orbit is in charge of the screen.
pub const MENU_POLL: Duration = Duration::from_millis(16);
/// While a game runs Orbit only needs the Home button.
pub const GAME_POLL: Duration = Duration::from_millis(50);

pub fn set_running(running: bool) {
    RUNNING.store(running, Ordering::SeqCst);
}

pub fn running() -> bool {
    RUNNING.load(Ordering::SeqCst)
}

/// How often the controller listener polls.
pub fn controller_poll_interval() -> Duration {
    if running() {
        GAME_POLL
    } else {
        MENU_POLL
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn background_work_backs_off_while_a_game_runs() {
        set_running(false);
        assert_eq!(controller_poll_interval(), MENU_POLL);
        set_running(true);
        assert!(running());
        assert_eq!(controller_poll_interval(), GAME_POLL);
        set_running(false);
        assert!(!running());
    }
}
