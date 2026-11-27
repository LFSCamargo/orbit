//! Controllers Orbit reads natively, sent to the WebView as `native-gamepad`
//! in the Standard Gamepad layout (`controllers/nativePads.ts`).
//!
//! Two readers feed it: gilrs (every HID pad over Bluetooth or USB: Xbox,
//! DualShock 4, DualSense, Switch Pro, 8BitDo, EasySMX and other generic pads,
//! mapped with SDL's controller database) and `xinput_usb` (XInput-only USB
//! pads and 2.4 GHz dongles that have no HID interface). The menus then work
//! with any of them, whether or not WebKit lists the pad.
use gilrs::{Axis, Button, Gamepad};
use serde::Serialize;
use tauri::{AppHandle, Emitter};

/// Standard Gamepad buttons (A B X Y, LB RB LT RT, Back Start, LS RS, D-pad, Guide).
pub const BUTTONS: usize = 17;
#[cfg(test)]
pub const GUIDE: usize = 16;
const PRESSED: f32 = 0.5;

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PadState {
    pub buttons: [bool; BUTTONS],
    /// Left X, left Y, right X, right Y; Y grows downward as in the Gamepad API.
    pub axes: [f32; 4],
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct NativeGamepadPayload<'a> {
    id: &'a str,
    connected: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    state: Option<PadState>,
}

/// Sends a pad's state, or its disconnection when `state` is `None`.
pub fn emit(app: &AppHandle, id: &str, state: Option<PadState>) {
    let payload = NativeGamepadPayload {
        id,
        connected: state.is_some(),
        state,
    };
    let _ = app.emit("native-gamepad", payload);
}

/// The WebView id of a gilrs pad: its name, ids, and gilrs slot (two identical
/// pads stay apart).
pub fn gilrs_id(gamepad: &Gamepad<'_>) -> String {
    format!(
        "{} (Vendor: {:04x} Product: {:04x}) #{}",
        gamepad.name(),
        gamepad.vendor_id().unwrap_or(0),
        gamepad.product_id().unwrap_or(0),
        usize::from(gamepad.id())
    )
}

/// gilrs buttons in Standard Gamepad order (positional: South is the bottom face button).
const GILRS_BUTTONS: [Button; BUTTONS] = [
    Button::South,
    Button::East,
    Button::West,
    Button::North,
    Button::LeftTrigger,
    Button::RightTrigger,
    Button::LeftTrigger2,
    Button::RightTrigger2,
    Button::Select,
    Button::Start,
    Button::LeftThumb,
    Button::RightThumb,
    Button::DPadUp,
    Button::DPadDown,
    Button::DPadLeft,
    Button::DPadRight,
    Button::Mode,
];

/// Builds the Standard Gamepad state from per-button and per-axis readers, so
/// the mapping is testable without a device. Hats reported as D-pad axes
/// count as D-pad presses; gilrs' up-positive Y axes are flipped.
pub fn standard_state(pressed: impl Fn(Button) -> bool, axis: impl Fn(Axis) -> f32) -> PadState {
    let mut buttons = GILRS_BUTTONS.map(&pressed);
    let (dpad_x, dpad_y) = (axis(Axis::DPadX), axis(Axis::DPadY));
    buttons[12] |= dpad_y > PRESSED;
    buttons[13] |= dpad_y < -PRESSED;
    buttons[14] |= dpad_x < -PRESSED;
    buttons[15] |= dpad_x > PRESSED;
    // Analog triggers some pads report only as axes.
    buttons[6] |= axis(Axis::LeftZ) > PRESSED;
    buttons[7] |= axis(Axis::RightZ) > PRESSED;
    PadState {
        buttons,
        axes: [
            axis(Axis::LeftStickX),
            -axis(Axis::LeftStickY),
            axis(Axis::RightStickX),
            -axis(Axis::RightStickY),
        ],
    }
}

pub fn gilrs_state(gamepad: &Gamepad<'_>) -> PadState {
    standard_state(
        |button| {
            gamepad
                .button_data(button)
                .is_some_and(|data| data.is_pressed() || data.value() > PRESSED)
        },
        |axis| gamepad.value(axis),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn face_buttons_are_positional_and_guide_is_last() {
        let state = standard_state(|b| matches!(b, Button::South | Button::Mode), |_| 0.0);
        assert!(state.buttons[0], "South is A / Cross");
        assert!(state.buttons[GUIDE]);
        assert_eq!(state.buttons.iter().filter(|b| **b).count(), 2);
    }

    #[test]
    fn a_hat_d_pad_and_axis_triggers_count_as_presses() {
        // Generic HID pads (EasySMX, 8BitDo in D-input) report a hat and
        // analog triggers as axes; menus still need D-pad and trigger presses.
        let state = standard_state(
            |_| false,
            |axis| match axis {
                Axis::DPadY => 1.0,
                Axis::DPadX => -1.0,
                Axis::RightZ => 0.9,
                _ => 0.0,
            },
        );
        assert!(state.buttons[12], "up");
        assert!(state.buttons[14], "left");
        assert!(state.buttons[7], "right trigger");
        assert!(!state.buttons[13] && !state.buttons[15]);
    }

    #[test]
    fn sticks_use_the_gamepad_api_direction() {
        let state = standard_state(
            |_| false,
            |axis| match axis {
                Axis::LeftStickY => 1.0,
                Axis::RightStickX => 0.5,
                _ => 0.0,
            },
        );
        assert_eq!(state.axes, [0.0, -1.0, 0.5, 0.0], "up is negative Y");
    }
}
