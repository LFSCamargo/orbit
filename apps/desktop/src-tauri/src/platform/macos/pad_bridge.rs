//! The pad bridge: a pad Orbit reads natively (`xinput_usb`: XInput-only USB
//! pads and 2.4 GHz dongles) reaches a Windows game without Wine touching USB.
//! Orbit writes the pad into a 64-byte shared file
//! (`runtimes::controllers::pad_bridge_path`); Orbit Wine's SDL
//! (`scripts/wine/patches/sdl2`) maps it and shows winebus a virtual Xbox 360
//! gamepad while `connected` is set, and writes rumble back.
//!
//! Layout, little endian, as 32-bit words: 0 magic, 1 version, 2 seq (odd
//! while Orbit writes), 3 connected, 4 buttons (bit = SDL_GameControllerButton),
//! 5-7 axes as i16 pairs (SDL_GameControllerAxis order, Y down, triggers
//! -32768 released to 32767 pulled), 8 rumble (low frequency in the low half).
use std::fs::OpenOptions;
use std::io;
use std::os::unix::fs::OpenOptionsExt;
use std::os::unix::io::AsRawFd;
use std::path::Path;
use std::sync::atomic::{fence, AtomicU32, Ordering};

const MAGIC: u32 = 0x5042_524F; // "ORBP"
const VERSION: u32 = 1;
const SIZE: usize = 64;
const SEQ: usize = 2;
const CONNECTED: usize = 3;
const BUTTONS: usize = 4;
const AXES: usize = 5;
const RUMBLE: usize = 8;

/// SDL_GameControllerButton bits.
mod button {
    pub const A: u32 = 1 << 0;
    pub const B: u32 = 1 << 1;
    pub const X: u32 = 1 << 2;
    pub const Y: u32 = 1 << 3;
    pub const BACK: u32 = 1 << 4;
    pub const START: u32 = 1 << 6;
    pub const LEFT_STICK: u32 = 1 << 7;
    pub const RIGHT_STICK: u32 = 1 << 8;
    pub const LEFT_SHOULDER: u32 = 1 << 9;
    pub const RIGHT_SHOULDER: u32 = 1 << 10;
    pub const UP: u32 = 1 << 11;
    pub const DOWN: u32 = 1 << 12;
    pub const LEFT: u32 = 1 << 13;
    pub const RIGHT: u32 = 1 << 14;
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct BridgeState {
    pub buttons: u32,
    /// Left X, left Y, right X, right Y, left trigger, right trigger.
    pub axes: [i16; 6],
}

/// SDL's virtual pads take a trigger over the whole axis: released is
/// `i16::MIN`, fully pulled `i16::MAX`. A 0..32767 trigger rested half pulled.
impl BridgeState {
    /// Nothing pressed, sticks centred, triggers released.
    pub const NEUTRAL: Self = Self {
        buttons: 0,
        axes: [0, 0, 0, 0, i16::MIN, i16::MIN],
    };
}

fn trigger(value: u8) -> i16 {
    (i32::from(value) * 65_535 / 255 + i32::from(i16::MIN)) as i16
}

/// The bridge state of an Xbox 360 input report. Guide is left out: it stays
/// Orbit's Home button. O(1).
pub fn bridge_state(report: &[u8]) -> Option<BridgeState> {
    if report.len() < 14 || report[0] != 0x00 || report[1] != 0x14 {
        return None;
    }
    let (low, high) = (report[2], report[3]);
    let pairs = [
        (low, 0x01, button::UP),
        (low, 0x02, button::DOWN),
        (low, 0x04, button::LEFT),
        (low, 0x08, button::RIGHT),
        (low, 0x10, button::START),
        (low, 0x20, button::BACK),
        (low, 0x40, button::LEFT_STICK),
        (low, 0x80, button::RIGHT_STICK),
        (high, 0x01, button::LEFT_SHOULDER),
        (high, 0x02, button::RIGHT_SHOULDER),
        (high, 0x10, button::A),
        (high, 0x20, button::B),
        (high, 0x40, button::X),
        (high, 0x80, button::Y),
    ];
    let buttons = pairs
        .iter()
        .filter(|(byte, mask, _)| byte & mask != 0)
        .fold(0, |bits, (_, _, bit)| bits | bit);
    let stick = |at: usize| i16::from_le_bytes([report[at], report[at + 1]]);
    // The report's Y axes grow upward; SDL's grow downward.
    let axes = [
        stick(6),
        stick(8).saturating_neg(),
        stick(10),
        stick(12).saturating_neg(),
        trigger(report[4]),
        trigger(report[5]),
    ];
    Some(BridgeState { buttons, axes })
}

/// The Xbox 360 rumble output report for SDL's motor speeds.
pub fn rumble_report(low: u16, high: u16) -> [u8; 8] {
    let [large, _] = low.to_be_bytes();
    let [small, _] = high.to_be_bytes();
    [0x00, 0x08, 0x00, large, small, 0x00, 0x00, 0x00]
}

pub struct Bridge {
    map: *mut libc::c_void,
}

// The mapping is only touched through atomics.
unsafe impl Send for Bridge {}

impl Bridge {
    /// Creates (or reuses) the bridge file with no pad connected. A link at
    /// the path is refused.
    pub fn open(path: &Path) -> io::Result<Self> {
        if let Some(dir) = path.parent() {
            std::fs::create_dir_all(dir)?;
        }
        let file = OpenOptions::new()
            .read(true)
            .write(true)
            .create(true)
            .truncate(false)
            .mode(0o600)
            .custom_flags(libc::O_NOFOLLOW | libc::O_CLOEXEC)
            .open(path)?;
        file.set_len(SIZE as u64)?;
        // SAFETY: a fresh shared mapping of a file at least SIZE bytes long.
        let map = unsafe {
            libc::mmap(
                std::ptr::null_mut(),
                SIZE,
                libc::PROT_READ | libc::PROT_WRITE,
                libc::MAP_SHARED,
                file.as_raw_fd(),
                0,
            )
        };
        if map == libc::MAP_FAILED {
            return Err(io::Error::last_os_error());
        }
        let bridge = Self { map };
        bridge.publish(None);
        bridge.word(1).store(VERSION, Ordering::Release);
        bridge.word(0).store(MAGIC, Ordering::Release);
        Ok(bridge)
    }

    fn word(&self, index: usize) -> &AtomicU32 {
        debug_assert!(index < SIZE / 4);
        // SAFETY: the page-aligned mapping lives as long as self and holds
        // SIZE / 4 words.
        unsafe { &*(self.map as *const AtomicU32).add(index) }
    }

    /// Shows the game this pad state, or no pad.
    pub fn publish(&self, state: Option<&BridgeState>) {
        let seq = self.word(SEQ).load(Ordering::Relaxed);
        self.word(SEQ)
            .store(seq.wrapping_add(1) | 1, Ordering::Relaxed);
        fence(Ordering::Release);
        let state = state.copied();
        self.word(CONNECTED)
            .store(u32::from(state.is_some()), Ordering::Relaxed);
        let state = state.unwrap_or(BridgeState::NEUTRAL);
        self.word(BUTTONS).store(state.buttons, Ordering::Relaxed);
        for (pair, axes) in state.axes.chunks(2).enumerate() {
            let word = u32::from(axes[0] as u16) | (u32::from(axes[1] as u16) << 16);
            self.word(AXES + pair).store(word, Ordering::Relaxed);
        }
        let odd = self.word(SEQ).load(Ordering::Relaxed);
        self.word(SEQ).store(odd.wrapping_add(1), Ordering::Release);
    }

    /// The game's rumble (low frequency, high frequency).
    pub fn rumble(&self) -> (u16, u16) {
        let word = self.word(RUMBLE).load(Ordering::Acquire);
        (word as u16, (word >> 16) as u16)
    }
}

impl Drop for Bridge {
    fn drop(&mut self) {
        self.publish(None);
        // SAFETY: mapped in open with this size.
        unsafe {
            libc::munmap(self.map, SIZE);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn report(low: u8, high: u8) -> [u8; 20] {
        let mut report = [0u8; 20];
        report[1] = 0x14;
        report[2] = low;
        report[3] = high;
        report
    }

    #[test]
    fn buttons_use_sdls_numbering_and_guide_stays_orbits() {
        let state = bridge_state(&report(0x01 | 0x20, 0x10 | 0x04 | 0x02)).unwrap();
        assert_eq!(
            state.buttons,
            button::UP | button::BACK | button::A | button::RIGHT_SHOULDER
        );
    }

    #[test]
    fn sticks_point_down_and_triggers_are_positive() {
        let mut raw = report(0, 0);
        raw[4] = 255;
        raw[5] = 0;
        raw[6..8].copy_from_slice(&1000i16.to_le_bytes());
        raw[8..10].copy_from_slice(&i16::MAX.to_le_bytes());
        raw[12..14].copy_from_slice(&i16::MIN.to_le_bytes());
        let state = bridge_state(&raw).unwrap();
        assert_eq!(
            state.axes,
            [1000, -i16::MAX, 0, i16::MAX, i16::MAX, i16::MIN]
        );
        assert!(bridge_state(&[0x01, 0x03, 0x06]).is_none(), "LED status");
    }

    #[test]
    fn released_triggers_read_as_released() {
        // Regression: LT and RT did not work in games. SDL's virtual pad maps a
        // trigger from the whole axis, so 0 read as half pulled.
        assert_eq!(trigger(0), i16::MIN);
        assert_eq!(trigger(255), i16::MAX);
        assert!(trigger(128) > -200 && trigger(128) < 200, "half pulled");
    }

    #[test]
    fn a_pad_with_no_report_yet_has_its_triggers_released() {
        let released = bridge_state(&report(0, 0)).unwrap();
        assert_eq!(BridgeState::NEUTRAL, released);
    }

    #[test]
    fn rumble_drives_the_large_and_small_motors() {
        assert_eq!(
            rumble_report(0xff00, 0x8000),
            [0, 8, 0, 0xff, 0x80, 0, 0, 0]
        );
    }

    #[test]
    fn the_file_holds_what_wines_sdl_reads() {
        let path =
            std::env::temp_dir().join(format!("orbit-pad-bridge-{}/pad-0", uuid::Uuid::new_v4()));
        let bridge = Bridge::open(&path).unwrap();
        let state = BridgeState {
            buttons: button::A,
            axes: [1, -2, 3, -4, 5, 32767],
        };
        bridge.publish(Some(&state));
        let bytes = std::fs::read(&path).unwrap();
        let word = |i: usize| u32::from_le_bytes(bytes[i * 4..i * 4 + 4].try_into().unwrap());
        assert_eq!(word(0), MAGIC);
        assert_eq!(word(1), VERSION);
        assert_eq!(word(SEQ) % 2, 0, "not mid-write");
        assert_eq!(word(CONNECTED), 1);
        assert_eq!(word(BUTTONS), button::A);
        let axis = |n: usize| i16::from_le_bytes([bytes[20 + n * 2], bytes[21 + n * 2]]);
        assert_eq!((0..6).map(axis).collect::<Vec<_>>(), state.axes);
        drop(bridge);
        let bytes = std::fs::read(&path).unwrap();
        assert_eq!(bytes[12], 0, "no pad once Orbit lets go");
        let _ = std::fs::remove_dir_all(path.parent().unwrap());
    }

    #[test]
    fn a_link_is_never_written_through() {
        let dir = std::env::temp_dir().join(format!("orbit-pad-link-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let target = dir.join("target");
        std::fs::write(&target, b"keep").unwrap();
        std::os::unix::fs::symlink(&target, dir.join("pad-0")).unwrap();
        assert!(Bridge::open(&dir.join("pad-0")).is_err());
        assert_eq!(std::fs::read(&target).unwrap(), b"keep");
        let _ = std::fs::remove_dir_all(dir);
    }
}
