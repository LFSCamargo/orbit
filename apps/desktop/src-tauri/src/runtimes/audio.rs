//! The audio gate: games in a container get a deeper Wine audio buffer.
//!
//! Wine's shared-mode audio buffer is 3 periods (30 ms). Under Rosetta a
//! game's audio thread often misses one 10 ms deadline, the buffer runs dry and
//! the game crackles and distorts. Orbit Wine's `mmdevapi`
//! (`scripts/wine/patches/0003-mmdevapi-orbit-audio-buffer.patch`) raises the
//! smallest shared-mode buffer to `ORBIT_AUDIO_BUFFER_MS`. A game's own value
//! wins; other Wines ignore it.

pub const BUFFER_VAR: &str = "ORBIT_AUDIO_BUFFER_MS";
/// Twice Wine's default: rides out a missed deadline at ~30 ms more latency.
pub const BUFFER_MS: &str = "60";

pub fn container_audio_env() -> [(&'static str, &'static str); 1] {
    [(BUFFER_VAR, BUFFER_MS)]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn container_wine_commands_carry_the_audio_gate() {
        // Regression: every game crackled; Wine's 30 ms buffer ran dry.
        let cmd = super::super::process::command(
            std::path::Path::new("/opt/wine/bin/wine"),
            std::path::Path::new("/tmp/prefix"),
        );
        let value = cmd
            .get_envs()
            .find(|(key, _)| *key == BUFFER_VAR)
            .and_then(|(_, value)| value);
        assert_eq!(value, Some(std::ffi::OsStr::new(BUFFER_MS)));
        let ms: u32 = BUFFER_MS.parse().unwrap();
        assert!(
            (30..=500).contains(&ms),
            "above Wine's 30 ms, within the patch's clamp"
        );
    }
}
