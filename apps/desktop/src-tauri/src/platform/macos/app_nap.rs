//! Keeps Orbit out of App Nap while a game plays. Orbit is minimized then,
//! and macOS throttles a background app's timers and threads: the dongle
//! reader (`xinput_usb`) ran late, so games got delayed and stuck input.
use objc2::rc::Retained;
use objc2::runtime::{NSObjectProtocol, ProtocolObject};
use objc2_foundation::{NSActivityOptions, NSProcessInfo, NSString};

/// An activity assertion; dropping it lets macOS nap Orbit again.
pub struct Awake(Retained<ProtocolObject<dyn NSObjectProtocol>>);

pub fn hold(reason: &str) -> Awake {
    let options = NSActivityOptions::UserInitiatedAllowingIdleSystemSleep
        | NSActivityOptions::LatencyCritical;
    let info = NSProcessInfo::processInfo();
    Awake(info.beginActivityWithOptions_reason(options, &NSString::from_str(reason)))
}

impl Drop for Awake {
    fn drop(&mut self) {
        // SAFETY: the object beginActivityWithOptions returned.
        unsafe { NSProcessInfo::processInfo().endActivity(&self.0) };
    }
}

/// The calling thread runs at the user-interactive QoS, as input handling does.
pub fn interactive_thread() {
    // SAFETY: only changes the calling thread's own QoS class.
    unsafe {
        libc::pthread_set_qos_class_self_np(libc::qos_class_t::QOS_CLASS_USER_INTERACTIVE, 0);
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn an_activity_can_be_held_and_released() {
        let awake = super::hold("Orbit test");
        drop(awake);
        super::interactive_thread();
    }
}
