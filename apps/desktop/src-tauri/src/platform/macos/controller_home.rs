use std::sync::{Arc, OnceLock};
use std::thread;
use std::time::{Duration, Instant};

use std::collections::HashMap;

use gilrs::{Axis, Button, EventType, GamepadId, Gilrs};
use objc2_app_kit::NSApplicationDidBecomeActiveNotification;
use objc2_foundation::{NSNotificationCenter, NSOperationQueue};
use objc2_game_controller::{
    GCController, GCControllerDidConnectNotification, GCControllerDidDisconnectNotification,
    GCInputButtonHome, GCSystemGestureState,
};
use parking_lot::Mutex;
use tauri::{AppHandle, Emitter};

use super::native_pads::PadState;

static APP: OnceLock<Arc<AppHandle>> = OnceLock::new();
static LAST_HOME_PRESS: Mutex<Option<Instant>> = Mutex::new(None);
const HOME_DEBOUNCE: Duration = Duration::from_millis(250);
const STICK_SCROLL_DEADZONE: f32 = 0.14;
const STICK_SCROLL_SPEED_PX_PER_MS: f32 = 0.55;

#[derive(serde::Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct StickScrollPayload {
    delta_x: f32,
    delta_y: f32,
}

/// Capture the controller Home / Guide button and bring Orbit to the front instead of
/// Apple Games, Steam, or other system handlers.
pub fn start_controller_home(app: AppHandle) {
    super::xinput_usb::start(app.clone());
    let app = Arc::new(app);
    let _ = APP.set(app.clone());

    unsafe {
        GCController::setShouldMonitorBackgroundEvents(true);
    }

    reapply_gesture_overrides();
    register_observers(app);
    start_gilrs_background_listener();
}

/// Re-apply gesture overrides when Orbit becomes active again.
#[allow(dead_code)]
pub fn refresh_controller_home_bindings() {
    reapply_gesture_overrides();
}

/// Poll gamepads at the HID layer so Home works while another app is focused.
fn start_gilrs_background_listener() {
    thread::spawn(|| {
        let mut gilrs = match Gilrs::new() {
            Ok(gilrs) => gilrs,
            Err(error) => {
                eprintln!("[orbit] Failed to start controller background listener: {error}");
                return;
            }
        };

        let mut mode_pressed = false;
        let mut last_poll = Instant::now();
        // Last state sent to the WebView per pad (`native_pads`).
        let mut sent: HashMap<GamepadId, (String, PadState)> = HashMap::new();

        loop {
            while let Some(event) = gilrs.next_event() {
                match event.event {
                    EventType::ButtonPressed(Button::Mode, _) => dispatch_home_press(),
                    EventType::Disconnected => {
                        if let (Some(app), Some((id, _))) = (APP.get(), sent.remove(&event.id)) {
                            super::native_pads::emit(app, &id, None);
                        }
                    }
                    _ => {}
                }
            }

            let pressed = gilrs
                .gamepads()
                .any(|(_, gamepad)| gamepad.is_pressed(Button::Mode));

            if pressed && !mode_pressed {
                dispatch_home_press();
            }

            mode_pressed = pressed;

            let now = Instant::now();
            let dt_ms = now.duration_since(last_poll).as_secs_f32() * 1000.0;
            last_poll = now;
            // The game owns the sticks; Orbit only listens for Home meanwhile.
            if !crate::launching::game_activity::running() {
                dispatch_stick_scroll(&gilrs, dt_ms.min(32.0));
                send_pads(&gilrs, &mut sent);
            } else if !sent.is_empty() {
                // Sent again in full when Orbit is back in front.
                sent.clear();
            }

            thread::sleep(crate::launching::game_activity::controller_poll_interval());
        }
    });
}

/// Sends every connected HID pad whose state changed. O(pads × buttons).
fn send_pads(gilrs: &Gilrs, sent: &mut HashMap<GamepadId, (String, PadState)>) {
    let Some(app) = APP.get() else {
        return;
    };
    for (gamepad_id, gamepad) in gilrs.gamepads() {
        let state = super::native_pads::gilrs_state(&gamepad);
        if sent
            .get(&gamepad_id)
            .is_some_and(|(_, last)| *last == state)
        {
            continue;
        }
        let id = super::native_pads::gilrs_id(&gamepad);
        super::native_pads::emit(app, &id, Some(state.clone()));
        sent.insert(gamepad_id, (id, state));
    }
}

pub(super) fn dispatch_home_press() {
    let Some(app) = APP.get() else {
        return;
    };
    on_home_pressed(app.clone());
}

fn scroll_axis_value(value: f32) -> f32 {
    let abs = value.abs();
    if abs < STICK_SCROLL_DEADZONE {
        return 0.0;
    }
    let normalized = (abs - STICK_SCROLL_DEADZONE) / (1.0 - STICK_SCROLL_DEADZONE);
    let curved = normalized.powf(1.35);
    value.signum() * curved
}

fn dispatch_stick_scroll(gilrs: &Gilrs, dt_ms: f32) {
    let Some(app) = APP.get() else {
        return;
    };

    let mut delta_x = 0.0_f32;
    let mut delta_y = 0.0_f32;

    for (_, gamepad) in gilrs.gamepads() {
        let rx = gamepad.value(Axis::RightStickX);
        let ry = gamepad.value(Axis::RightStickY);
        if rx.abs() > delta_x.abs() {
            delta_x = rx;
        }
        if ry.abs() > delta_y.abs() {
            delta_y = ry;
        }
    }

    if let Some(payload) = stick_scroll(delta_x, delta_y, dt_ms) {
        let _ = app.emit("controller-stick-scroll", payload);
    }
}

/// Scrolls the page for a right-stick position from another reader (Y up).
pub(super) fn emit_stick_scroll(x: f32, y: f32, dt_ms: f32) {
    let Some(app) = APP.get() else {
        return;
    };
    if let Some(payload) = stick_scroll(x, y, dt_ms) {
        let _ = app.emit("controller-stick-scroll", payload);
    }
}

/// Page scroll for a right-stick position. gilrs reports stick-up as positive
/// Y, while page scroll grows downward, so Y is flipped: pushing up scrolls up.
fn stick_scroll(x: f32, y: f32, dt_ms: f32) -> Option<StickScrollPayload> {
    let (x, y) = (scroll_axis_value(x), -scroll_axis_value(y));
    if x == 0.0 && y == 0.0 {
        return None;
    }
    Some(StickScrollPayload {
        delta_x: x * STICK_SCROLL_SPEED_PX_PER_MS * dt_ms,
        delta_y: y * STICK_SCROLL_SPEED_PX_PER_MS * dt_ms,
    })
}

fn register_observers(_app: Arc<AppHandle>) {
    unsafe {
        let center = NSNotificationCenter::defaultCenter();
        let queue = NSOperationQueue::mainQueue();

        let connect_block = block2::RcBlock::new(move |_notification| {
            reapply_gesture_overrides();
        });
        center.addObserverForName_object_queue_usingBlock(
            Some(GCControllerDidConnectNotification),
            None,
            Some(&queue),
            &connect_block,
        );

        let disconnect_block = block2::RcBlock::new(move |_notification| {
            reapply_gesture_overrides();
        });
        center.addObserverForName_object_queue_usingBlock(
            Some(GCControllerDidDisconnectNotification),
            None,
            Some(&queue),
            &disconnect_block,
        );

        let active_block = block2::RcBlock::new(move |_notification| {
            reapply_gesture_overrides();
        });
        center.addObserverForName_object_queue_usingBlock(
            Some(NSApplicationDidBecomeActiveNotification),
            None,
            Some(&queue),
            &active_block,
        );
    }
}

fn reapply_gesture_overrides() {
    unsafe {
        let controllers = GCController::controllers();
        for controller in controllers.iter() {
            disable_home_system_gesture(&controller);
        }
    }
}

unsafe fn disable_home_system_gesture(controller: &GCController) {
    let profile = controller.physicalInputProfile();

    if let Some(home_name) = GCInputButtonHome.as_ref() {
        let buttons = profile.buttons();
        if let Some(home_btn) = buttons.objectForKey(home_name) {
            home_btn.setPreferredSystemGestureState(GCSystemGestureState::Disabled);
        }
    }

    for element in profile.allElements().iter() {
        if element.isBoundToSystemGesture() {
            element.setPreferredSystemGestureState(GCSystemGestureState::Disabled);
        }
    }

    if let Some(extended) = controller.extendedGamepad() {
        if let Some(home) = extended.buttonHome() {
            home.setPreferredSystemGestureState(GCSystemGestureState::Disabled);
        }
    }
}

fn on_home_pressed(app: Arc<AppHandle>) {
    let handle = app.clone();
    let _ = app.run_on_main_thread(move || {
        let mut last = LAST_HOME_PRESS.lock();
        if last.is_some_and(|instant| instant.elapsed() < HOME_DEBOUNCE) {
            return;
        }
        *last = Some(Instant::now());

        let was_focused = crate::commands::window::is_orbit_focused(&handle);
        crate::commands::window::focus_orbit_window(&handle);
        let _ = handle.emit(
            "controller-home-pressed",
            serde_json::json!({ "wasFocused": was_focused }),
        );
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pushing_the_right_stick_up_scrolls_up_and_down_scrolls_down() {
        // Regression: gilrs' up-positive Y was sent as is, so up scrolled down.
        let up = stick_scroll(0.0, 1.0, 16.0).unwrap();
        assert!(up.delta_y < 0.0);
        let down = stick_scroll(0.0, -1.0, 16.0).unwrap();
        assert!(down.delta_y > 0.0);
        let right = stick_scroll(1.0, 0.0, 16.0).unwrap();
        assert!(right.delta_x > 0.0 && right.delta_y == 0.0);
    }

    #[test]
    fn a_resting_stick_does_not_scroll() {
        assert!(stick_scroll(0.1, -0.1, 16.0).is_none());
    }
}
