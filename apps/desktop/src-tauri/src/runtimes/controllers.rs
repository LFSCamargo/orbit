//! SDL controller mappings for games in a Wine container.
//!
//! Wine's winebus passes controllers to games through SDL. A pad SDL has no
//! mapping for reaches the game as a raw joystick, and XInput guesses its axes:
//! a right stick on Z/Rz becomes the triggers and the real triggers are lost.
//! These mappings turn such pads into standard gamepads. SDL reads them from
//! `SDL_GAMECONTROLLERCONFIG` when winebus starts, so every process that can
//! start a container's wineserver must carry the same value.

/// One SDL mapping per line. GUIDs omit the name CRC so they match whatever
/// name the transport reports.
const MAPPINGS: &str = concat!(
    // 8BitDo Ultimate 2 Wireless over Bluetooth (2DC8:6012). Its HID report is
    // hat, X Y Z Rz (left and right sticks), Accelerator and Brake (right and
    // left triggers), then 24 buttons. SDL 2.32 has no entry for it.
    "03000000c82d00001260000001000000,8BitDo Ultimate 2 Wireless,",
    "a:b0,b:b1,back:b10,dpdown:h0.4,dpleft:h0.8,dpright:h0.2,dpup:h0.1,guide:b12,",
    "leftshoulder:b6,leftstick:b13,lefttrigger:a5,leftx:a0,lefty:a1,",
    "rightshoulder:b7,rightstick:b14,righttrigger:a4,rightx:a2,righty:a3,",
    "start:b11,x:b3,y:b4,platform:Mac OS X,",
);

pub const CONFIG_VAR: &str = "SDL_GAMECONTROLLERCONFIG";

/// Turns off Wine's HID driver for a prefix. Orbit's helper Steams (library
/// sync, sign-in) have no game to give a pad to, and their Steam Input opens
/// Big Picture on the Guide button.
pub const NO_CONTROLLERS_DLL: &str = "winebus.sys=d";

/// The file Orbit Wine's SDL reads a pad from that Orbit reads natively
/// (`platform/macos/pad_bridge.rs`, `scripts/wine/patches/sdl2`): XInput-only
/// USB pads and 2.4 GHz dongles, which Wine never gets USB access to.
pub const BRIDGE_VAR: &str = "ORBIT_PAD_BRIDGE";

pub fn pad_bridge_path() -> std::path::PathBuf {
    super::root().join("controllers").join("pad-0")
}

/// The controller variables for a container process.
pub fn container_controller_env() -> [(&'static str, String); 2] {
    [
        (CONFIG_VAR, MAPPINGS.to_string()),
        (BRIDGE_VAR, pad_bridge_path().to_string_lossy().into_owned()),
    ]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn container_wine_commands_carry_the_mappings() {
        // winebus starts with the container's first Wine process, so the
        // shared command (Steam, helpers) must carry them, not just the game.
        let cmd = super::super::process::command(
            std::path::Path::new("/opt/wine/bin/wine"),
            std::path::Path::new("/tmp/prefix"),
        );
        let value = cmd
            .get_envs()
            .find(|(key, _)| *key == CONFIG_VAR)
            .and_then(|(_, value)| value);
        assert_eq!(value, Some(std::ffi::OsStr::new(MAPPINGS)));
    }

    #[test]
    fn container_wine_commands_name_the_pad_bridge() {
        // Regression: the 2.4 GHz 8BitDo Ultimate 2C dongle never reached
        // games; Wine's SDL now reads it from Orbit through this file.
        let cmd = super::super::process::command(
            std::path::Path::new("/opt/wine/bin/wine"),
            std::path::Path::new("/tmp/prefix"),
        );
        let value = cmd
            .get_envs()
            .find(|(key, _)| *key == BRIDGE_VAR)
            .and_then(|(_, value)| value);
        assert_eq!(value, Some(pad_bridge_path().as_os_str()));
    }

    #[test]
    fn every_mapping_is_a_complete_sdl_line() {
        for line in MAPPINGS.lines() {
            let fields: Vec<&str> = line.split(',').collect();
            assert_eq!(fields[0].len(), 32, "GUID in {line}");
            assert!(fields[0].chars().all(|c| c.is_ascii_hexdigit()));
            assert!(!fields[1].is_empty(), "name in {line}");
            assert!(line.ends_with("platform:Mac OS X,"), "platform in {line}");
            for control in [
                "a:", "b:", "x:", "y:", "leftx:", "lefty:", "rightx:", "righty:",
            ] {
                assert!(
                    fields.iter().any(|f| f.starts_with(control)),
                    "{control} in {line}"
                );
            }
        }
    }

    #[test]
    fn the_8bitdo_ultimate_2_uses_its_real_axis_layout() {
        // Regression: without a mapping the right stick (Z/Rz) was read as the
        // triggers and the left stick's vertical axis came out wrong in games.
        let line = MAPPINGS
            .lines()
            .find(|line| line.starts_with("03000000c82d00001260000001000000"))
            .expect("8BitDo Ultimate 2 Wireless mapping");
        for pair in [
            "leftx:a0",
            "lefty:a1",
            "rightx:a2",
            "righty:a3",
            "righttrigger:a4",
            "lefttrigger:a5",
        ] {
            assert!(line.contains(&format!(",{pair},")), "{pair}");
        }
    }
}
