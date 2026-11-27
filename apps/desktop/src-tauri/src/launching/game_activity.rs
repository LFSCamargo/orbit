//! Whether a game is playing, so Orbit's background loops stand down while it
//! does: the controller poller only watches Home (no 60 Hz stick-scroll events
//! into the hidden WebView) and the network monitor stops pushing samples.
//!
//! A local session (a game process) and an Xbox Cloud stream playing in
//! Orbit's own player both count.

use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

static RUNNING: AtomicBool = AtomicBool::new(false);
static CLOUD_STREAMING: AtomicBool = AtomicBool::new(false);

/// Controller polling while Orbit is in charge of the screen.
pub const MENU_POLL: Duration = Duration::from_millis(16);
/// While a game plays Orbit only needs Home. gilrs queues button events, so a
/// slower poll adds latency to Home but never misses a press.
pub const GAME_POLL: Duration = Duration::from_millis(100);

/// A local game session started or ended.
pub fn set_running(running: bool) {
    RUNNING.store(running, Ordering::SeqCst);
}

/// A cloud stream is playing (not paused behind Orbit's menu) or stopped.
pub fn set_cloud_streaming(streaming: bool) {
    CLOUD_STREAMING.store(streaming, Ordering::SeqCst);
}

/// A local game process is playing (not a cloud stream, which reads the pad
/// through Orbit's own WebView).
pub fn local_session() -> bool {
    RUNNING.load(Ordering::SeqCst)
}

pub fn running() -> bool {
    RUNNING.load(Ordering::SeqCst) || CLOUD_STREAMING.load(Ordering::SeqCst)
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

    // One test: both flags are process-wide and tests run in parallel.
    #[test]
    fn background_work_backs_off_while_a_game_or_cloud_stream_plays() {
        set_running(false);
        set_cloud_streaming(false);
        assert_eq!(controller_poll_interval(), MENU_POLL);
        set_running(true);
        assert!(running());
        assert_eq!(controller_poll_interval(), GAME_POLL);
        set_running(false);
        assert!(!running());

        // Regression: a cloud stream left the 16 ms poller sending right-stick
        // (camera) scroll events into the WebView decoding the video.
        set_cloud_streaming(true);
        assert!(running());
        assert_eq!(controller_poll_interval(), GAME_POLL);
        // Ending a local session does not end the stream's stand-down.
        set_running(false);
        assert!(running());
        set_cloud_streaming(false);
        assert!(!running());
    }
}
