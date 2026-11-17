//! Finish stopping a game launch. Every launch starts in its own session
//! (`process::detached`), and Wine processes inherit it: Steam, the game and its
//! crash handlers alike. `wineserver -k` returns once the server is gone, but a
//! game whose render loop makes no server call keeps running, and its working
//! directory may be any Steam library. So the session is signalled directly:
//! TERM, a short grace period, then KILL. Orbit's resident Steam client runs in
//! a session of its own and is never touched.

use std::time::{Duration, Instant};

const GRACE: Duration = Duration::from_secs(3);
const KILL_WAIT: Duration = Duration::from_secs(5);

/// Pids (other than Orbit and launchd) whose session id is `session`.
fn members(session: i32) -> Vec<i32> {
    let own = std::process::id() as i32;
    let mut pids = vec![0i32; 8192];
    let bytes = (pids.len() * std::mem::size_of::<i32>()) as libc::c_int;
    // SAFETY: the buffer holds `bytes` bytes of pids.
    let count = unsafe { libc::proc_listallpids(pids.as_mut_ptr().cast(), bytes) };
    if count <= 0 {
        return Vec::new();
    }
    pids.truncate(count as usize);
    pids.into_iter()
        .filter(|pid| *pid > 1 && *pid != own)
        // SAFETY: getsid only reads the session id of a pid.
        .filter(|pid| unsafe { libc::getsid(*pid) } == session)
        .collect()
}

fn signal(pids: &[i32], signal: libc::c_int) {
    for pid in pids {
        // SAFETY: plain kill(2) on a pid just observed in the session.
        unsafe {
            libc::kill(*pid, signal);
        }
    }
}

/// Stop every process in `session`, returning how many survived KILL.
/// Orbit's own session is refused so a misconfigured caller cannot stop Orbit.
pub fn reap(session: i32) -> usize {
    // SAFETY: getsid(0) reads Orbit's own session id.
    if session <= 1 || session == unsafe { libc::getsid(0) } {
        return 0;
    }
    let initial = members(session);
    if initial.is_empty() {
        return 0;
    }
    signal(&initial, libc::SIGTERM);
    let wait_until = |deadline: Instant| loop {
        let left = members(session);
        if left.is_empty() || Instant::now() >= deadline {
            return left;
        }
        std::thread::sleep(Duration::from_millis(250));
    };
    let left = wait_until(Instant::now() + GRACE);
    if left.is_empty() {
        return 0;
    }
    signal(&left, libc::SIGKILL);
    wait_until(Instant::now() + KILL_WAIT).len()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::process::Command;

    /// A session leader with a child that ignores TERM, like a busy game.
    fn session_with_stubborn_child() -> std::process::Child {
        let mut command = Command::new("/bin/sh");
        command.arg("-c").arg("trap '' TERM; /bin/sleep 30 & wait");
        crate::runtimes::process::detached(&command)
            .unwrap()
            .spawn()
            .unwrap()
    }

    #[test]
    fn stops_the_whole_launch_session() {
        let mut leader = session_with_stubborn_child();
        let session = leader.id() as i32;
        std::thread::sleep(Duration::from_millis(300));
        assert!(members(session).len() >= 2, "leader and its child");
        assert_eq!(reap(session), 0);
        assert!(members(session).is_empty());
        let _ = leader.wait();
    }

    #[test]
    fn never_reaps_orbits_own_session() {
        // SAFETY: getsid(0) reads this process's session id.
        let own = unsafe { libc::getsid(0) };
        assert_eq!(reap(own), 0);
        assert_eq!(reap(1), 0);
        assert_eq!(reap(0), 0);
    }
}
