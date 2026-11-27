//! Wired-protocol Xbox 360 controllers on USB, read with libusb.
//!
//! Some pads expose their gamepad only as an XInput interface (USB class 0xFF,
//! subclass 0x5D, protocol 0x01): the 8BitDo Ultimate 2C 2.4 GHz dongle, many
//! third-party Xbox 360 pads. macOS has no driver for it, so neither WebKit's
//! Gamepad API nor GameController lists them. Orbit claims the interface while
//! it shows its menus and sends the pad to the WebView as `native-gamepad` (Standard
//! Gamepad layout), the right stick as `controller-stick-scroll` and Guide as
//! Home. Orbit keeps the interface while a Windows game plays (Wine gets no
//! USB access): the game gets the pad through the pad bridge (`pad_bridge`),
//! the menus get nothing, and Guide stays Home, as with a Bluetooth pad. A macOS game, or Steam for Mac, reads USB pads itself, so
//! for one the interface is lent (`lend_to_game`) until the game ends.
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::Arc;
use std::thread;
use std::time::{Duration, Instant};

use rusb::{Direction, TransferType, UsbContext};
use tauri::AppHandle;

use super::native_pads::{emit, PadState};
use super::pad_bridge::{bridge_state, rumble_report, Bridge, BridgeState};

const XINPUT_CLASS: u8 = 0xff;
const XINPUT_SUBCLASS: u8 = 0x5d;
const XINPUT_PROTOCOL: u8 = 0x01;
const REPORT_LEN: usize = 20;
const READ_TIMEOUT: Duration = Duration::from_millis(16);
const WRITE_TIMEOUT: Duration = Duration::from_millis(16);
const RESCAN: Duration = Duration::from_secs(1);
/// Reopening a pad that dropped out while a game has it, for the whole
/// session: a 2.4 GHz link that drops comes back as soon as it re-pairs.
const RESCAN_PLAYING: Duration = Duration::from_millis(100);
/// A pad whose reads keep failing this long is gone.
const FAILING_LIMIT: Duration = Duration::from_secs(1);
/// A read error shorter than this keeps the held input: the pad may only
/// report changes, so dropping it would lose a held stick or trigger.
const HICCUP_HOLD: Duration = Duration::from_millis(100);
/// How often the rumble writer looks for a new motor speed.
const RUMBLE_TICK: Duration = Duration::from_millis(8);
const RETRY_PAUSE: Duration = Duration::from_millis(4);
const AXIS_MAX: f32 = 32767.0;
const TRIGGER_PRESSED: u8 = 128;
const LED_PLAYER_ONE: [u8; 3] = [0x01, 0x03, 0x06];

pub fn is_xinput_interface(class: u8, subclass: u8, protocol: u8) -> bool {
    class == XINPUT_CLASS && subclass == XINPUT_SUBCLASS && protocol == XINPUT_PROTOCOL
}

fn axis(lo: u8, hi: u8, flip: bool) -> f32 {
    let value = (i16::from_le_bytes([lo, hi]) as f32 / AXIS_MAX).clamp(-1.0, 1.0);
    if flip {
        -value
    } else {
        value
    }
}

/// Decodes an Xbox 360 input report (type 0x00, length 0x14). Other reports
/// (LED and rumble status) are ignored. O(1).
pub fn parse_report(report: &[u8]) -> Option<PadState> {
    if report.len() < REPORT_LEN || report[0] != 0x00 || report[1] != 0x14 {
        return None;
    }
    let (low, high) = (report[2], report[3]);
    let bit = |byte: u8, mask: u8| byte & mask != 0;
    let buttons = [
        bit(high, 0x10),              // A
        bit(high, 0x20),              // B
        bit(high, 0x40),              // X
        bit(high, 0x80),              // Y
        bit(high, 0x01),              // LB
        bit(high, 0x02),              // RB
        report[4] >= TRIGGER_PRESSED, // LT
        report[5] >= TRIGGER_PRESSED, // RT
        bit(low, 0x20),               // Back
        bit(low, 0x10),               // Start
        bit(low, 0x40),               // LS
        bit(low, 0x80),               // RS
        bit(low, 0x01),               // Up
        bit(low, 0x02),               // Down
        bit(low, 0x04),               // Left
        bit(low, 0x08),               // Right
        bit(high, 0x04),              // Guide
    ];
    // The report's Y axes grow upward; the Gamepad API's grow downward.
    let axes = [
        axis(report[6], report[7], false),
        axis(report[8], report[9], true),
        axis(report[10], report[11], false),
        axis(report[12], report[13], true),
    ];
    Some(PadState { buttons, axes })
}

/// The newest motor speeds the game asked for, low frequency in the low half.
/// Latest value wins: the writer never queues stale speeds.
#[derive(Default)]
struct RumbleSlot {
    wanted: AtomicU32,
    stop: AtomicBool,
}

impl RumbleSlot {
    fn set(&self, (low, high): (u16, u16)) {
        self.wanted
            .store(u32::from(low) | (u32::from(high) << 16), Ordering::Release);
    }

    /// The speeds to send when they differ from `sent`.
    fn next(&self, sent: u32) -> Option<u32> {
        let wanted = self.wanted.load(Ordering::Acquire);
        (wanted != sent).then_some(wanted)
    }
}

/// Sends rumble on its own thread, so a USB OUT transfer never delays the
/// next input read (Ragnarök changes its rumble almost every frame).
struct RumbleWriter {
    slot: Arc<RumbleSlot>,
    thread: Option<thread::JoinHandle<()>>,
}

impl RumbleWriter {
    fn start(handle: Arc<rusb::DeviceHandle<rusb::Context>>, out: u8) -> Self {
        let slot = Arc::new(RumbleSlot::default());
        let shared = slot.clone();
        let thread = thread::spawn(move || {
            super::app_nap::interactive_thread();
            let mut sent = 0u32;
            while !shared.stop.load(Ordering::Acquire) {
                if let Some(wanted) = shared.next(sent) {
                    let report = rumble_report(wanted as u16, (wanted >> 16) as u16);
                    if handle.write_interrupt(out, &report, WRITE_TIMEOUT).is_ok() {
                        sent = wanted;
                    }
                }
                thread::sleep(RUMBLE_TICK);
            }
            if sent != 0 {
                let _ = handle.write_interrupt(out, &rumble_report(0, 0), WRITE_TIMEOUT);
            }
        });
        Self {
            slot,
            thread: Some(thread),
        }
    }
}

impl Drop for RumbleWriter {
    fn drop(&mut self) {
        self.slot.stop.store(true, Ordering::Release);
        if let Some(thread) = self.thread.take() {
            let _ = thread.join();
        }
    }
}

struct OpenPad {
    handle: Arc<rusb::DeviceHandle<rusb::Context>>,
    interface: u8,
    endpoint: u8,
    /// Rumble through the interrupt OUT endpoint, when the pad has one.
    rumble: Option<RumbleWriter>,
    id: String,
}

impl OpenPad {
    /// Never blocks: the writer thread sends it.
    fn set_rumble(&self, speeds: (u16, u16)) {
        if let Some(rumble) = &self.rumble {
            rumble.slot.set(speeds);
        }
    }
}

impl Drop for OpenPad {
    fn drop(&mut self) {
        // The writer stops before the interface goes.
        drop(self.rumble.take());
        let _ = self.handle.release_interface(self.interface);
    }
}

/// The first XInput interface with an interrupt IN endpoint Orbit can claim.
/// O(devices).
fn open_first(context: &rusb::Context) -> Option<OpenPad> {
    let devices = context.devices().ok()?;
    for device in devices.iter() {
        let Ok(descriptor) = device.device_descriptor() else {
            continue;
        };
        let Ok(config) = device.active_config_descriptor() else {
            continue;
        };
        for interface in config.interfaces() {
            for alt in interface.descriptors() {
                if !is_xinput_interface(alt.class_code(), alt.sub_class_code(), alt.protocol_code())
                {
                    continue;
                }
                let Some(endpoint) = alt.endpoint_descriptors().find(|ep| {
                    ep.direction() == Direction::In && ep.transfer_type() == TransferType::Interrupt
                }) else {
                    continue;
                };
                let out = alt.endpoint_descriptors().find(|ep| {
                    ep.direction() == Direction::Out
                        && ep.transfer_type() == TransferType::Interrupt
                });
                let Ok(handle) = device.open() else {
                    continue;
                };
                if handle.claim_interface(alt.interface_number()).is_err() {
                    continue;
                }
                // Player 1 LED, as the Xbox 360 driver sends: some pads only
                // start reporting once a host has set it.
                if let Some(out) = out.as_ref() {
                    let _ = handle.write_interrupt(out.address(), &LED_PLAYER_ONE, READ_TIMEOUT);
                }
                let name = handle
                    .read_product_string_ascii(&descriptor)
                    .unwrap_or_else(|_| "Xbox 360 Controller".into());
                let handle = Arc::new(handle);
                return Some(OpenPad {
                    rumble: out.map(|out| RumbleWriter::start(handle.clone(), out.address())),
                    handle,
                    interface: alt.interface_number(),
                    endpoint: endpoint.address(),
                    id: format!(
                        "{name} (XInput USB Vendor: {:04x} Product: {:04x})",
                        descriptor.vendor_id(),
                        descriptor.product_id()
                    ),
                });
            }
        }
    }
    None
}

pub fn start(app: AppHandle) {
    thread::spawn(move || {
        super::app_nap::interactive_thread();
        let Ok(context) = rusb::Context::new() else {
            eprintln!("[orbit] libusb is unavailable; XInput USB pads are not read");
            return;
        };
        run(&app, &context);
    });
}

/// A macOS game launch asked for the pads (`lend_to_game`).
static LENT: AtomicBool = AtomicBool::new(false);
/// Orbit has an XInput pad claimed right now.
static HOLDING: AtomicBool = AtomicBool::new(false);
const LEND_WAIT: Duration = Duration::from_millis(1500);

/// Releases every XInput pad before a macOS game starts, so it (or Steam for
/// Mac) can claim it. Waits up to `LEND_WAIT` for the reader to let go.
pub fn lend_to_game() {
    LENT.store(true, Ordering::SeqCst);
    let deadline = Instant::now() + LEND_WAIT;
    while HOLDING.load(Ordering::SeqCst) && Instant::now() < deadline {
        thread::sleep(Duration::from_millis(20));
    }
}

/// The game ended or its launch failed: Orbit reads its pads again.
pub fn take_back() {
    LENT.store(false, Ordering::SeqCst);
}

fn lent() -> bool {
    LENT.load(Ordering::SeqCst)
}

#[derive(Debug, PartialEq, Eq)]
enum Failure {
    /// A hiccup (often while a game loads): keep the pad and read again.
    Retry,
    /// Unplugged, taken by another program, or failing for `FAILING_LIMIT`.
    Lost,
}

fn read_failure(err: &rusb::Error, failing_for: Duration) -> Failure {
    match err {
        rusb::Error::NoDevice | rusb::Error::NotFound | rusb::Error::Access => Failure::Lost,
        _ if failing_for >= FAILING_LIMIT => Failure::Lost,
        _ => Failure::Retry,
    }
}

/// Orbit stays out of App Nap for the whole local session, also while the pad
/// is missing: a napped reader rescans late and a dropout lasts seconds.
fn stay_awake(playing: bool, lending: bool) -> bool {
    playing && !lending
}

/// What the reader does with a report: menus get the whole pad; while a game
/// plays they get nothing and Guide still brings Orbit back.
#[derive(Debug, PartialEq, Eq)]
enum Route {
    Menus,
    GuideOnly,
}

fn route(game_running: bool) -> Route {
    if game_running {
        Route::GuideOnly
    } else {
        Route::Menus
    }
}

/// Feeds the pad to a Windows game through the pad bridge (Orbit Wine's SDL
/// shows it to winebus as an Xbox 360 gamepad) and plays the game's rumble.
struct GameFeed {
    bridge: Option<Bridge>,
    shown: Option<BridgeState>,
    rumble: (u16, u16),
}

impl GameFeed {
    fn new() -> Self {
        let path = crate::runtimes::controllers::pad_bridge_path();
        let bridge = Bridge::open(&path)
            .map_err(|err| eprintln!("[orbit] pad bridge {} unavailable: {err}", path.display()))
            .ok();
        Self {
            bridge,
            shown: None,
            rumble: (0, 0),
        }
    }

    /// Writes only changes; `None` takes the pad away from the game.
    fn show(&mut self, state: Option<BridgeState>) {
        if self.shown == state {
            return;
        }
        if let Some(bridge) = &self.bridge {
            bridge.publish(state.as_ref());
        }
        self.shown = state;
    }

    /// A read failed `failing_for` ago and is retried. A brief hiccup keeps
    /// the held input; a longer one lets go, so nothing keeps moving.
    fn interrupt_input(
        &mut self,
        raw: &mut Option<BridgeState>,
        playing: bool,
        failing_for: Duration,
    ) {
        if failing_for < HICCUP_HOLD {
            return;
        }
        *raw = None;
        self.show(playing.then_some(BridgeState::NEUTRAL));
    }

    /// Hands the game's rumble to the pad's writer thread. Never blocks.
    fn play_rumble(&mut self, pad: &OpenPad) {
        let wanted = match (&self.bridge, self.shown) {
            (Some(bridge), Some(_)) => bridge.rumble(),
            _ => (0, 0),
        };
        if wanted == self.rumble {
            return;
        }
        pad.set_rumble(wanted);
        self.rumble = wanted;
    }

    /// The pad is lent or play ended: the game loses it, nothing rumbles.
    fn lose_pad(&mut self) {
        self.show(None);
        self.rumble = (0, 0);
    }

    /// Keep the player slot neutral while the physical controller is missing.
    fn pad_gone(&mut self) {
        self.rumble = (0, 0);
        if self.shown.is_some() {
            self.show(Some(BridgeState::NEUTRAL));
        }
    }

    /// Detach only when play ends.
    fn settle(&mut self, playing: bool) {
        if !playing {
            self.lose_pad();
        }
    }

    /// Fast while a game holds the pad's slot, for the whole session.
    fn rescan_interval(&self) -> Duration {
        if self.shown.is_some() {
            RESCAN_PLAYING
        } else {
            RESCAN
        }
    }
}

fn run(app: &AppHandle, context: &rusb::Context) {
    let mut feed = GameFeed::new();
    // The last input report, as the game would see it.
    let mut raw: Option<BridgeState> = None;
    let mut pad: Option<OpenPad> = None;
    let mut last: Option<PadState> = None;
    let mut guide_down = false;
    let mut last_tick = Instant::now();
    let mut buf = [0u8; 64];
    // The menus were told about the pad (cleared while a game plays).
    let mut shown = false;
    let mut failing_since: Option<Instant> = None;
    let mut awake: Option<super::app_nap::Awake> = None;
    loop {
        // A local game, not a cloud stream: Orbit's own player reads the pad
        // through the menus' path (`native-gamepad`).
        let playing = crate::launching::game_activity::local_session();
        let lending = lent();
        let keep_awake = stay_awake(playing, lending);
        if keep_awake != awake.is_some() {
            awake = keep_awake.then(|| super::app_nap::hold("A game is reading its controller"));
        }
        if lending {
            feed.lose_pad();
            if let Some(open) = pad.take() {
                emit(app, &open.id, None);
                raw = None;
                drop(open);
                HOLDING.store(false, Ordering::SeqCst);
                guide_down = false;
                last = None;
                shown = false;
            }
            thread::sleep(RESCAN);
            continue;
        }
        let Some(open) = pad.as_ref() else {
            match open_first(context) {
                Some(open) => {
                    pad = Some(open);
                    HOLDING.store(true, Ordering::SeqCst);
                    failing_since = None;
                }
                None => {
                    feed.settle(playing);
                    thread::sleep(feed.rescan_interval());
                }
            }
            last_tick = Instant::now();
            continue;
        };
        let menus = route(playing) == Route::Menus;
        if !menus && shown {
            // The game has the screen: the menus must not move underneath it.
            last = None;
            emit(app, &open.id, None);
            shown = false;
        }
        match open
            .handle
            .read_interrupt(open.endpoint, &mut buf, READ_TIMEOUT)
        {
            Ok(len) => {
                failing_since = None;
                let report = &buf[..len];
                if let Some(state) = bridge_state(report) {
                    raw = Some(state);
                    let guide = report[3] & 0x04 != 0;
                    if guide && !guide_down {
                        super::controller_home::dispatch_home_press();
                    }
                    guide_down = guide;
                    if menus {
                        if let Some(state) = parse_report(report) {
                            if !shown || last.as_ref() != Some(&state) {
                                emit(app, &open.id, Some(state.clone()));
                                shown = true;
                            }
                            last = Some(state);
                        }
                    }
                }
            }
            Err(rusb::Error::Timeout) => failing_since = None,
            Err(err) => {
                let now = Instant::now();
                let since = *failing_since.get_or_insert(now);
                let failing_for = now.duration_since(since);
                if read_failure(&err, failing_for) == Failure::Retry {
                    feed.interrupt_input(&mut raw, playing, failing_for);
                    if err == rusb::Error::Pipe {
                        let _ = open.handle.clear_halt(open.endpoint);
                    }
                    thread::sleep(RETRY_PAUSE);
                    continue;
                }
                // Unplugged, or another program took the interface: wait
                // before reopening instead of spinning on it.
                emit(app, &open.id, None);
                feed.pad_gone();
                raw = None;
                pad = None;
                HOLDING.store(false, Ordering::SeqCst);
                guide_down = false;
                last = None;
                shown = false;
                failing_since = None;
                thread::sleep(feed.rescan_interval());
                continue;
            }
        }
        // The game sees the pad only while it plays; the menus never do.
        feed.show((!menus).then(|| raw.unwrap_or(BridgeState::NEUTRAL)));
        feed.play_rumble(open);
        let now = Instant::now();
        let dt_ms = (now.duration_since(last_tick).as_secs_f32() * 1000.0).min(32.0);
        last_tick = now;
        if let Some(state) = last.as_ref().filter(|_| menus) {
            // stick_scroll takes an up-positive Y, as gilrs reports it.
            super::controller_home::emit_stick_scroll(state.axes[2], -state.axes[3], dt_ms);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::super::native_pads::GUIDE;
    use super::*;

    fn report(low: u8, high: u8, lx: i16, ly: i16) -> [u8; REPORT_LEN] {
        let mut report = [0u8; REPORT_LEN];
        report[1] = 0x14;
        report[2] = low;
        report[3] = high;
        report[6..8].copy_from_slice(&lx.to_le_bytes());
        report[8..10].copy_from_slice(&ly.to_le_bytes());
        report
    }

    #[test]
    fn only_the_xbox_360_interface_is_claimed() {
        // Regression: the 8BitDo Ultimate 2C dongle (2DC8:310A) exposes its pad
        // only as this vendor interface, so Orbit's menus saw no controller.
        assert!(is_xinput_interface(0xff, 0x5d, 0x01));
        assert!(
            !is_xinput_interface(0x03, 0x01, 0x01),
            "its keyboard interface"
        );
        assert!(!is_xinput_interface(0xff, 0x5d, 0x02), "headset audio");
    }

    #[test]
    fn buttons_follow_the_standard_gamepad_layout() {
        let state = parse_report(&report(0x01 | 0x10, 0x10 | 0x04, 0, 0)).unwrap();
        assert!(state.buttons[0], "A");
        assert!(state.buttons[9], "Start");
        assert!(state.buttons[12], "D-pad up");
        assert!(state.buttons[GUIDE], "Guide");
        assert_eq!(state.buttons.iter().filter(|b| **b).count(), 4);
    }

    #[test]
    fn pushing_the_left_stick_up_reads_as_negative_y() {
        let state = parse_report(&report(0, 0, i16::MAX, i16::MAX)).unwrap();
        assert_eq!(state.axes[0], 1.0);
        assert_eq!(state.axes[1], -1.0);
        let state = parse_report(&report(0, 0, i16::MIN, 0)).unwrap();
        assert_eq!(state.axes[0], -1.0);
    }

    /// Hardware check: `cargo test --lib xinput_usb -- --ignored` with a pad plugged in.
    #[test]
    #[ignore]
    fn reads_a_connected_pad() {
        let context = rusb::Context::new().unwrap();
        let Some(pad) = open_first(&context) else {
            panic!("an XInput USB pad Orbit can claim");
        };
        let mut buf = [0u8; 64];
        let mut reports = 0;
        let until = Instant::now() + Duration::from_secs(2);
        while Instant::now() < until {
            if let Ok(len) = pad
                .handle
                .read_interrupt(pad.endpoint, &mut buf, READ_TIMEOUT)
            {
                reports += usize::from(parse_report(&buf[..len]).is_some());
            }
        }
        eprintln!("{}: {reports} input reports", pad.id);
    }

    #[test]
    fn a_windows_game_never_takes_the_pad_from_orbit() {
        // Regression: Wine's libusb SDL claimed the 2.4 GHz dongle, its Steam
        // opened Big Picture, and the menus lost the pad. Orbit keeps it; a
        // game only silences the menus, Guide still goes Home.
        assert_eq!(route(false), Route::Menus);
        assert_eq!(route(true), Route::GuideOnly);
        assert!(!lent(), "a running Windows game does not lend the pad");
    }

    #[test]
    fn a_read_hiccup_while_a_game_loads_keeps_the_pad() {
        // Regression: during loading screens the pad "disconnected" mid-move,
        // so the camera kept spinning and input stalled.
        let brief = Duration::from_millis(200);
        assert_eq!(read_failure(&rusb::Error::Io, brief), Failure::Retry);
        assert_eq!(read_failure(&rusb::Error::Pipe, brief), Failure::Retry);
        assert_eq!(read_failure(&rusb::Error::Overflow, brief), Failure::Retry);
        assert_eq!(read_failure(&rusb::Error::Io, FAILING_LIMIT), Failure::Lost);
        assert_eq!(read_failure(&rusb::Error::NoDevice, brief), Failure::Lost);
        assert_eq!(read_failure(&rusb::Error::Access, brief), Failure::Lost);
    }

    #[test]
    fn a_brief_read_hiccup_keeps_held_input_and_a_long_one_lets_go() {
        // Regression: every USB hiccup released the sticks and triggers. A
        // quiet pad reports only changes, so a held aim or run was lost until
        // it moved again, which felt like input lag.
        for x in [i16::MIN, i16::MAX] {
            let held = bridge_state(&report(0, 0, x, 0));
            let mut raw = held;
            let mut feed = GameFeed {
                bridge: None,
                shown: held,
                rumble: (0, 0),
            };
            feed.interrupt_input(&mut raw, true, Duration::from_millis(20));
            assert_eq!((feed.shown, raw), (held, held), "held through a hiccup");
            feed.interrupt_input(&mut raw, true, HICCUP_HOLD);
            assert_eq!(
                feed.shown,
                Some(BridgeState::NEUTRAL),
                "nothing keeps moving"
            );
            assert_eq!(raw, None);
        }
    }

    #[test]
    fn a_dropout_keeps_the_player_slot_and_rescans_fast_until_game_exit() {
        // Regression: after 2 s of dropout Orbit went back to one scan per
        // second, so a 2.4 GHz link that re-paired waited up to a second more.
        let mut feed = GameFeed {
            bridge: None,
            shown: Some(BridgeState {
                buttons: 0,
                axes: [i16::MAX, 0, 0, 0, i16::MIN, i16::MIN],
            }),
            rumble: (1, 1),
        };
        assert_eq!(feed.rescan_interval(), RESCAN_PLAYING);
        feed.pad_gone();
        assert_eq!(feed.shown, Some(BridgeState::NEUTRAL), "the stick lets go");
        assert_eq!(feed.rumble, (0, 0));
        for _ in 0..100 {
            feed.settle(true);
        }
        assert_eq!(feed.shown, Some(BridgeState::NEUTRAL), "still connected");
        assert_eq!(feed.rescan_interval(), RESCAN_PLAYING, "fast all session");
        feed.settle(false);
        assert_eq!(feed.shown, None, "the session ended");
        assert_eq!(feed.rescan_interval(), RESCAN);
    }

    #[test]
    fn orbit_stays_awake_for_the_whole_session_even_without_a_pad() {
        // Regression: the App Nap hold ended when the pad dropped out, so the
        // napped reader rescanned late and reconnecting took seconds.
        assert!(stay_awake(true, false));
        assert!(!stay_awake(true, true), "a macOS game reads the pad itself");
        assert!(!stay_awake(false, false));
    }

    #[test]
    fn rumble_sends_only_the_newest_speeds() {
        // Rumble runs on its own thread; a burst of changes is one write.
        let slot = RumbleSlot::default();
        assert_eq!(slot.next(0), None, "nothing to send");
        slot.set((0x1000, 0x2000));
        slot.set((0xff00, 0x8000));
        let wanted = slot.next(0).unwrap();
        assert_eq!((wanted as u16, (wanted >> 16) as u16), (0xff00, 0x8000));
        assert_eq!(slot.next(wanted), None, "already sent");
        slot.set((0, 0));
        assert_eq!(slot.next(wanted), Some(0), "stopping is sent too");
    }

    #[test]
    fn a_macos_game_takes_the_pads_until_it_is_done() {
        assert!(!lent());
        lend_to_game();
        assert!(lent());
        take_back();
        assert!(!lent());
    }

    #[test]
    fn other_reports_are_ignored() {
        assert!(parse_report(&[0x01, 0x03, 0x06]).is_none(), "LED status");
        let mut rumble = report(0, 0, 0, 0);
        rumble[0] = 0x08;
        assert!(parse_report(&rumble).is_none());
    }
}
