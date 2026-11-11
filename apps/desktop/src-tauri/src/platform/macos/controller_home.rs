use std::sync::{Arc, OnceLock};
use std::thread;
use std::time::{Duration, Instant};

use gilrs::{Axis, Button, EventType, Gilrs};
use objc2_app_kit::NSApplicationDidBecomeActiveNotification;
use objc2_foundation::{NSNotificationCenter, NSOperationQueue};
use objc2_game_controller::{
    GCController, GCControllerDidConnectNotification, GCControllerDidDisconnectNotification,
    GCInputButtonHome, GCSystemGestureState,
};
use parking_lot::Mutex;
use tauri::{AppHandle, Emitter};

static APP: OnceLock<Arc<AppHandle>> = OnceLock::new();
static LAST_HOME_PRESS: Mutex<Option<Instant>> = Mutex::new(None);
const HOME_DEBOUNCE: Duration = Duration::from_millis(250);
const BACKGROUND_POLL_INTERVAL: Duration = Duration::from_millis(16);
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

        loop {
            while let Some(event) = gilrs.next_event() {
                if matches!(event.event, EventType::ButtonPressed(Button::Mode, _)) {
                    dispatch_home_press();
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
            dispatch_stick_scroll(&gilrs, dt_ms.min(32.0));

            thread::sleep(BACKGROUND_POLL_INTERVAL);
        }
    });
}

fn dispatch_home_press() {
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
        let rx = scroll_axis_value(gamepad.value(Axis::RightStickX));
        let ry = scroll_axis_value(gamepad.value(Axis::RightStickY));
        if rx.abs() > delta_x.abs() {
            delta_x = rx;
        }
        if ry.abs() > delta_y.abs() {
            delta_y = ry;
        }
    }

    if delta_x == 0.0 && delta_y == 0.0 {
        return;
    }

    let payload = StickScrollPayload {
        delta_x: delta_x * STICK_SCROLL_SPEED_PX_PER_MS * dt_ms,
        delta_y: delta_y * STICK_SCROLL_SPEED_PX_PER_MS * dt_ms,
    };

    let _ = app.emit("controller-stick-scroll", payload);
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
