//! Live network for the downloads panel and the download queue. The Mac's
//! interface byte counters are sampled once a second (real download and upload
//! rates), and while downloads are queued Steam's servers are probed so a
//! Wi-Fi link without internet still counts as offline. Losing the network
//! pauses the queue; getting it back resumes it.
use std::collections::HashMap;
use std::net::{TcpStream, ToSocketAddrs};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::time::{Duration, Instant};

use parking_lot::Mutex;
use serde::Serialize;
use tauri::{AppHandle, Emitter};

pub const STATS_EVENT: &str = "network-stats";
const SAMPLE: Duration = Duration::from_secs(1);
const PROBE_EVERY: Duration = Duration::from_secs(10);
/// Retry sooner while offline so a returning network resumes downloads quickly.
const PROBE_OFFLINE_EVERY: Duration = Duration::from_secs(3);
const PROBE_TIMEOUT: Duration = Duration::from_secs(3);
const PROBE_HOST: &str = "api.steampowered.com:443";
/// Consecutive samples a change must hold before the queue reacts, so a
/// brief Wi-Fi roam does not pause a download.
const SETTLE: u32 = 3;
/// Virtual and peer-to-peer links: VPN tunnels repeat the traffic of the
/// physical link, and AirDrop / Continuity links carry no internet.
const SKIPPED_PREFIXES: [&str; 10] = [
    "lo", "utun", "awdl", "llw", "gif", "stf", "bridge", "anpi", "ap", "ipsec",
];

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NetworkStats {
    pub online: bool,
    /// Bytes per second received over the Mac's network links.
    pub download_rate: u64,
    /// Bytes per second sent over the Mac's network links.
    pub upload_rate: u64,
}

/// One interface's counters. macOS keeps them as 32-bit values that wrap.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Reading {
    pub name: String,
    pub received: u32,
    pub sent: u32,
    /// Has an address that can reach the internet (not link-local).
    pub routable: bool,
}

pub fn counted(name: &str) -> bool {
    !SKIPPED_PREFIXES
        .iter()
        .any(|prefix| name.starts_with(prefix))
}

/// Bytes between two 32-bit counter values, across one wrap.
pub fn counter_delta(previous: u32, next: u32) -> u64 {
    u64::from(next.wrapping_sub(previous))
}

/// Rates between successive readings. O(interfaces) per sample.
#[derive(Debug, Default)]
pub struct Sampler {
    previous: HashMap<String, (u32, u32)>,
    at: Option<Instant>,
    /// Bytes received since the monitor started.
    pub received_total: u64,
}

impl Sampler {
    /// (download, upload) bytes per second. An interface seen for the first
    /// time only sets its baseline, so a new link never reads as a burst.
    pub fn sample(&mut self, readings: &[Reading], now: Instant) -> (u64, u64) {
        let mut received = 0u64;
        let mut sent = 0u64;
        let mut next = HashMap::with_capacity(readings.len());
        for reading in readings.iter().filter(|reading| counted(&reading.name)) {
            if let Some(&(rx, tx)) = self.previous.get(&reading.name) {
                received += counter_delta(rx, reading.received);
                sent += counter_delta(tx, reading.sent);
            }
            next.insert(reading.name.clone(), (reading.received, reading.sent));
        }
        self.previous = next;
        let elapsed = self
            .at
            .replace(now)
            .map(|at| now.saturating_duration_since(at).as_secs_f64())
            .unwrap_or(0.0);
        self.received_total = self.received_total.saturating_add(received);
        if elapsed < 0.2 {
            return (0, 0);
        }
        (
            (received as f64 / elapsed).round() as u64,
            (sent as f64 / elapsed).round() as u64,
        )
    }
}

/// Online state that only flips after `SETTLE` agreeing samples.
#[derive(Debug, Clone, Copy)]
pub struct Link {
    pub online: bool,
    streak: u32,
}

impl Default for Link {
    fn default() -> Self {
        Self {
            online: true,
            streak: 0,
        }
    }
}

impl Link {
    /// Returns the new state when it changed.
    pub fn observe(&mut self, seen_online: bool) -> Option<bool> {
        if seen_online == self.online {
            self.streak = 0;
            return None;
        }
        self.streak += 1;
        if self.streak < SETTLE {
            return None;
        }
        self.streak = 0;
        self.online = seen_online;
        Some(seen_online)
    }
}

static STATS: Mutex<NetworkStats> = Mutex::new(NetworkStats {
    online: true,
    download_rate: 0,
    upload_rate: 0,
});
static RECEIVED: AtomicU64 = AtomicU64::new(0);
static ROUTABLE: AtomicBool = AtomicBool::new(true);
static PROBE_OK: AtomicBool = AtomicBool::new(true);
static STARTED: AtomicBool = AtomicBool::new(false);

pub fn snapshot() -> NetworkStats {
    *STATS.lock()
}

pub fn online() -> bool {
    STATS.lock().online
}

/// Bytes received over the Mac's links since Orbit started.
pub fn received_bytes() -> u64 {
    RECEIVED.load(Ordering::Relaxed)
}

/// Starts the sampler and the reachability probe once.
pub fn start(app: AppHandle) {
    if STARTED.swap(true, Ordering::SeqCst) {
        return;
    }
    std::thread::spawn(move || run_sampler(&app));
    std::thread::spawn(run_probe);
}

fn run_sampler(app: &AppHandle) {
    let mut sampler = Sampler::default();
    let mut link = Link::default();
    loop {
        let readings = read_interfaces();
        let routable = readings
            .iter()
            .any(|reading| reading.routable && counted(&reading.name));
        ROUTABLE.store(routable, Ordering::Relaxed);
        let (download_rate, upload_rate) = sampler.sample(&readings, Instant::now());
        RECEIVED.store(sampler.received_total, Ordering::Relaxed);
        let changed = link.observe(routable && PROBE_OK.load(Ordering::Relaxed));
        let stats = NetworkStats {
            online: link.online,
            download_rate,
            upload_rate,
        };
        *STATS.lock() = stats;
        let _ = app.emit(STATS_EVENT, stats);
        if let Some(online) = changed {
            crate::services::download_queue::network_changed(app, online);
        }
        std::thread::sleep(SAMPLE);
    }
}

/// Probes only while downloads need the network; an idle Orbit makes no
/// connections of its own.
fn run_probe() {
    loop {
        let wanted = crate::services::download_queue::has_work();
        if !wanted || !ROUTABLE.load(Ordering::Relaxed) {
            // No link: the sampler already reports offline. A later link is
            // probed fresh instead of trusting a stale failure.
            PROBE_OK.store(true, Ordering::Relaxed);
            std::thread::sleep(SAMPLE);
            continue;
        }
        let reachable = probe(PROBE_HOST);
        PROBE_OK.store(reachable, Ordering::Relaxed);
        std::thread::sleep(if reachable {
            PROBE_EVERY
        } else {
            PROBE_OFFLINE_EVERY
        });
    }
}

/// One TCP connect to Steam, bounded by `PROBE_TIMEOUT` per address.
fn probe(host: &str) -> bool {
    let Ok(addresses) = host.to_socket_addrs() else {
        return false;
    };
    addresses
        .take(2)
        .any(|address| TcpStream::connect_timeout(&address, PROBE_TIMEOUT).is_ok())
}

#[cfg(target_os = "macos")]
fn read_interfaces() -> Vec<Reading> {
    use std::ffi::CStr;

    let mut list: *mut libc::ifaddrs = std::ptr::null_mut();
    // SAFETY: getifaddrs fills `list` with a linked list we free below.
    if unsafe { libc::getifaddrs(&mut list) } != 0 {
        return Vec::new();
    }
    let mut readings: HashMap<String, Reading> = HashMap::new();
    let mut cursor = list;
    while !cursor.is_null() {
        // SAFETY: `cursor` walks the list getifaddrs returned and is not freed yet.
        let entry = unsafe { &*cursor };
        cursor = entry.ifa_next;
        let flags = entry.ifa_flags as libc::c_int;
        if entry.ifa_name.is_null()
            || entry.ifa_addr.is_null()
            || flags & libc::IFF_UP == 0
            || flags & libc::IFF_RUNNING == 0
            || flags & libc::IFF_LOOPBACK != 0
        {
            continue;
        }
        // SAFETY: ifa_name is a NUL-terminated C string owned by the list.
        let name = unsafe { CStr::from_ptr(entry.ifa_name) }
            .to_string_lossy()
            .into_owned();
        let reading = readings.entry(name.clone()).or_insert(Reading {
            name,
            received: 0,
            sent: 0,
            routable: false,
        });
        // SAFETY: ifa_addr is non-null and points at a sockaddr of `sa_family`.
        let family = i32::from(unsafe { (*entry.ifa_addr).sa_family });
        match family {
            libc::AF_LINK if !entry.ifa_data.is_null() => {
                // SAFETY: AF_LINK entries carry an if_data in ifa_data.
                let data = unsafe { &*(entry.ifa_data as *const libc::if_data) };
                reading.received = data.ifi_ibytes;
                reading.sent = data.ifi_obytes;
            }
            libc::AF_INET => {
                // SAFETY: AF_INET addresses are sockaddr_in.
                let addr = unsafe { &*(entry.ifa_addr as *const libc::sockaddr_in) };
                let ip = std::net::Ipv4Addr::from(u32::from_be(addr.sin_addr.s_addr));
                reading.routable |= routable_v4(ip);
            }
            libc::AF_INET6 => {
                // SAFETY: AF_INET6 addresses are sockaddr_in6.
                let addr = unsafe { &*(entry.ifa_addr as *const libc::sockaddr_in6) };
                let ip = std::net::Ipv6Addr::from(addr.sin6_addr.s6_addr);
                reading.routable |= routable_v6(ip);
            }
            _ => {}
        }
    }
    // SAFETY: frees the list getifaddrs allocated; no references outlive it.
    unsafe { libc::freeifaddrs(list) };
    readings.into_values().collect()
}

#[cfg(not(target_os = "macos"))]
fn read_interfaces() -> Vec<Reading> {
    Vec::new()
}

/// Not loopback, unspecified or a self-assigned 169.254 address.
pub fn routable_v4(ip: std::net::Ipv4Addr) -> bool {
    !(ip.is_loopback() || ip.is_unspecified() || ip.is_link_local())
}

/// Not loopback, unspecified or link-local (fe80::/10).
pub fn routable_v6(ip: std::net::Ipv6Addr) -> bool {
    let link_local = ip.segments()[0] & 0xffc0 == 0xfe80;
    !(ip.is_loopback() || ip.is_unspecified() || link_local)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn reading(name: &str, received: u32, sent: u32) -> Reading {
        Reading {
            name: name.into(),
            received,
            sent,
            routable: true,
        }
    }

    #[test]
    fn rates_come_from_counter_growth_and_survive_a_wrap() {
        let mut sampler = Sampler::default();
        let start = Instant::now();
        assert_eq!(
            sampler.sample(&[reading("en0", u32::MAX - 99, 10)], start),
            (0, 0)
        );
        let later = start + Duration::from_secs(2);
        assert_eq!(
            sampler.sample(&[reading("en0", 1_900, 2_010)], later),
            (1_000, 1_000),
            "the received counter wrapped past u32::MAX"
        );
        assert_eq!(sampler.received_total, 2_000);
    }

    #[test]
    fn tunnels_and_new_links_do_not_inflate_the_rate() {
        let mut sampler = Sampler::default();
        let start = Instant::now();
        sampler.sample(&[reading("en0", 0, 0), reading("utun3", 0, 0)], start);
        let rates = sampler.sample(
            &[
                reading("en0", 500, 0),
                reading("utun3", 500, 0),
                reading("en1", 9_000_000, 0),
            ],
            start + Duration::from_secs(1),
        );
        assert_eq!(
            rates,
            (500, 0),
            "VPN copies and a fresh link are not traffic"
        );
        assert!(counted("en0"));
        assert!(!counted("utun0"));
        assert!(!counted("awdl0"));
        assert!(!counted("lo0"));
    }

    #[test]
    fn the_link_flips_only_after_settled_samples() {
        let mut link = Link::default();
        assert!(link.online);
        assert_eq!(link.observe(false), None);
        assert_eq!(link.observe(true), None, "a blip resets the streak");
        assert_eq!(link.observe(false), None);
        assert_eq!(link.observe(false), None);
        assert_eq!(link.observe(false), Some(false));
        assert!(!link.online);
        assert_eq!(link.observe(false), None);
        link.observe(true);
        link.observe(true);
        assert_eq!(link.observe(true), Some(true));
    }

    #[test]
    fn self_assigned_addresses_are_not_internet() {
        assert!(routable_v4("192.168.1.20".parse().unwrap()));
        assert!(!routable_v4("169.254.10.1".parse().unwrap()));
        assert!(!routable_v4("127.0.0.1".parse().unwrap()));
        assert!(routable_v6("2602:801:f005:101::1".parse().unwrap()));
        assert!(!routable_v6("fe80::1".parse().unwrap()));
        assert!(!routable_v6("::1".parse().unwrap()));
    }

    #[test]
    fn reads_the_macs_links_without_loopback() {
        let readings = read_interfaces();
        assert!(readings
            .iter()
            .all(|reading| !reading.name.starts_with("lo")));
        for reading in &readings {
            eprintln!("{reading:?}");
        }
    }

    #[test]
    fn an_unresolvable_host_is_unreachable() {
        assert!(!probe("orbit.invalid:443"));
    }
}
