//! Orbit's in-container Steam client. Orbit runs this inside a game's Wine
//! container in place of a full `steam.exe`. It wraps the saved refresh token
//! into the ConnectCache with Windows DPAPI, points the registry at Valve's
//! `steamclient64.dll`, hosts that DLL as the logged-on IPC master, tells Orbit
//! it is ready, and stays alive while the game runs. No window, no browser, no
//! bootstrap updater. Secrets are never written to stdout or a log.
//!
//! Lifecycle (all paths arrive through environment variables Orbit sets):
//!   ORBIT_AGENT_SESSION  0600 JSON request; read once, then deleted.
//!   ORBIT_AGENT_READY    touched when the client reaches Logged On.
//!   ORBIT_AGENT_STOP     when this file appears, the agent logs off and exits.
//!
//! With ORBIT_AGENT_SEED_ONLY set, the agent writes the login files (the token
//! DPAPI-wrapped by this container's own Wine) and exits, so Valve's silent
//! client can log on with them.
//!
//! Unwrap mode reads back the token Valve's own sign-in window saved, so Orbit
//! can reuse it in game containers. It hosts nothing and exits:
//!   ORBIT_AGENT_UNWRAP   Windows path to the signed-in user's `local.vdf`.
//!   ORBIT_AGENT_ACCOUNT  the account whose ConnectCache entry to unwrap.
//!   ORBIT_AGENT_OUT      0600 file Orbit created; receives the token.
//!
//! Built for `x86_64-pc-windows-gnu` only. On other targets `main` is a stub so
//! the pure `session` module can still be unit-tested on the host.
mod session;

#[cfg(windows)]
fn main() {
    std::process::exit(windows::run());
}

#[cfg(not(windows))]
fn main() {
    eprintln!("orbit-steam-agent runs only inside a Windows container");
    std::process::exit(2);
}

#[cfg(windows)]
mod windows {
    use crate::session::{hex, Request};
    use std::ffi::c_void;
    use std::path::Path;
    use std::time::{Duration, Instant};

    use windows_sys::Win32::Foundation::{GetLastError, LocalFree};
    use windows_sys::Win32::Security::Cryptography::{
        CryptProtectData, CryptUnprotectData, CRYPTPROTECT_UI_FORBIDDEN, CRYPT_INTEGER_BLOB,
    };
    use windows_sys::Win32::System::LibraryLoader::{
        GetProcAddress, LoadLibraryA, SetDllDirectoryA,
    };
    use windows_sys::Win32::System::Registry::{
        RegCloseKey, RegCreateKeyExA, RegSetValueExA, HKEY, HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE,
        KEY_WRITE, REG_DWORD, REG_OPTION_NON_VOLATILE, REG_SZ,
    };

    const LOGON_TIMEOUT: Duration = Duration::from_secs(60);

    // steamclient64.dll's flat C exports. Signatures are the documented Steam2
    // entry points; the engine is the IPC master every Steamworks game attaches
    // to through its own steam_api64.dll.
    type CreatePipe = unsafe extern "C" fn() -> i32;
    type CreateUser = unsafe extern "C" fn(*mut i32) -> i32;
    type LogOn = unsafe extern "C" fn(i32, i32, u64);
    type LogOff = unsafe extern "C" fn(i32, i32);
    type BLoggedOn = unsafe extern "C" fn(i32, i32) -> bool;
    type BGetCallback = unsafe extern "C" fn(i32, *mut c_void, *mut c_void) -> bool;
    /// Must run after every successful `Steam_BGetCallback`. Without it the
    /// pipe repeats one callback and never finishes logging on.
    type FreeLast = unsafe extern "C" fn(i32);
    type ReleaseUser = unsafe extern "C" fn(i32, i32);
    type ReleasePipe = unsafe extern "C" fn(i32) -> bool;

    pub fn run() -> i32 {
        if std::env::var_os("ORBIT_AGENT_UNWRAP").is_some() {
            return match unwrap_saved_token() {
                Ok(()) => 0,
                Err(message) => {
                    eprintln!("orbit-steam-agent: {message}");
                    6
                }
            };
        }
        let request = match load_request() {
            Ok(request) => request,
            Err(message) => {
                eprintln!("orbit-steam-agent: {message}");
                return 2;
            }
        };
        if let Err(message) = seed_login(&request) {
            eprintln!("orbit-steam-agent: {message}");
            return 3;
        }
        if std::env::var_os("ORBIT_AGENT_SEED_ONLY").is_some() {
            return 0;
        }
        let steam_dir = request.steam_dir.clone();
        if let Err(message) = write_registry(&steam_dir) {
            eprintln!("orbit-steam-agent: {message}");
            return 4;
        }
        match host_steamclient(&request, &steam_dir) {
            Ok(()) => 0,
            Err(message) => {
                eprintln!("orbit-steam-agent: {message}");
                5
            }
        }
    }

    fn load_request() -> Result<Request, String> {
        let path = std::env::var("ORBIT_AGENT_SESSION")
            .map_err(|_| "ORBIT_AGENT_SESSION is not set".to_string())?;
        let bytes = std::fs::read(&path).map_err(|_| "agent request is unreadable".to_string())?;
        // The request holds the token in the clear; remove it before anything
        // else so it never outlives this process.
        let _ = std::fs::remove_file(&path);
        Request::parse(&bytes)
    }

    /// Wrap the token with DPAPI (entropy = account name) and write the three
    /// login files Valve's client reads at startup.
    fn seed_login(request: &Request) -> Result<(), String> {
        let blob = dpapi_protect(
            request.refresh_token.as_bytes(),
            request.account_name.as_bytes(),
        )?;
        write_private(
            Path::new(&request.local_vdf),
            request.local_vdf(&hex(&blob)).as_bytes(),
        )?;
        let config = Path::new(&request.steam_dir).join("config");
        std::fs::create_dir_all(&config)
            .map_err(|_| "could not create Steam config".to_string())?;
        write_private(
            &config.join("loginusers.vdf"),
            request.loginusers_vdf().as_bytes(),
        )?;
        write_private(&config.join("config.vdf"), request.config_vdf().as_bytes())?;
        // Skip the bootstrap self-update so no updater window ever appears.
        let _ = std::fs::write(
            Path::new(&request.steam_dir).join("steam.cfg"),
            b"BootStrapperInhibitAll = Enable\nBootStrapperForceSelfUpdate = False\n",
        );
        Ok(())
    }

    /// Unwrap the ConnectCache token Valve's client saved for one account and
    /// hand it to Orbit through the file Orbit created.
    fn unwrap_saved_token() -> Result<(), String> {
        let var = |name: &str| std::env::var(name).map_err(|_| format!("{name} is not set"));
        let (local, account, out) = (
            var("ORBIT_AGENT_UNWRAP")?,
            var("ORBIT_AGENT_ACCOUNT")?,
            var("ORBIT_AGENT_OUT")?,
        );
        let text = std::fs::read_to_string(&local)
            .map_err(|_| "the saved Steam login is unreadable".to_string())?;
        let blob = orbit_steam::saved_token_hex(&text, &account)
            .and_then(orbit_steam::unhex)
            .ok_or("no saved Steam login for this account")?;
        let token = dpapi_unprotect(&blob, account.as_bytes())?;
        let token = String::from_utf8(token).map_err(|_| "the saved Steam login is not a token")?;
        if !Path::new(&out).is_file() {
            return Err("the token file Orbit created is missing".into());
        }
        write_private(Path::new(&out), token.trim().as_bytes())
    }

    fn write_private(path: &Path, bytes: &[u8]) -> Result<(), String> {
        if path
            .symlink_metadata()
            .is_ok_and(|m| m.file_type().is_symlink())
        {
            return Err("a login file is a symlink".into());
        }
        std::fs::write(path, bytes).map_err(|_| "could not write a login file".to_string())
    }

    fn dpapi_protect(data: &[u8], entropy: &[u8]) -> Result<Vec<u8>, String> {
        let input = CRYPT_INTEGER_BLOB {
            cbData: data.len() as u32,
            pbData: data.as_ptr() as *mut u8,
        };
        let ent = CRYPT_INTEGER_BLOB {
            cbData: entropy.len() as u32,
            pbData: entropy.as_ptr() as *mut u8,
        };
        let mut out = CRYPT_INTEGER_BLOB {
            cbData: 0,
            pbData: std::ptr::null_mut(),
        };
        let ok = unsafe {
            CryptProtectData(
                &input,
                std::ptr::null(),
                &ent,
                std::ptr::null(),
                std::ptr::null(),
                CRYPTPROTECT_UI_FORBIDDEN,
                &mut out,
            )
        };
        if ok == 0 {
            return Err("DPAPI could not wrap the Steam token".into());
        }
        let blob = unsafe { std::slice::from_raw_parts(out.pbData, out.cbData as usize) }.to_vec();
        unsafe { LocalFree(out.pbData as *mut c_void) };
        Ok(blob)
    }

    fn dpapi_unprotect(blob: &[u8], entropy: &[u8]) -> Result<Vec<u8>, String> {
        let input = CRYPT_INTEGER_BLOB {
            cbData: blob.len() as u32,
            pbData: blob.as_ptr() as *mut u8,
        };
        let ent = CRYPT_INTEGER_BLOB {
            cbData: entropy.len() as u32,
            pbData: entropy.as_ptr() as *mut u8,
        };
        let mut out = CRYPT_INTEGER_BLOB {
            cbData: 0,
            pbData: std::ptr::null_mut(),
        };
        let ok = unsafe {
            CryptUnprotectData(
                &input,
                std::ptr::null_mut(),
                &ent,
                std::ptr::null(),
                std::ptr::null(),
                CRYPTPROTECT_UI_FORBIDDEN,
                &mut out,
            )
        };
        if ok == 0 {
            return Err("DPAPI could not unwrap the saved Steam login".into());
        }
        let data = unsafe { std::slice::from_raw_parts(out.pbData, out.cbData as usize) }.to_vec();
        unsafe { LocalFree(out.pbData as *mut c_void) };
        Ok(data)
    }

    /// Point Steam's registry at Valve's client in this container so the game's
    /// `steam_api64.dll` finds the running engine.
    fn write_registry(steam_dir: &str) -> Result<(), String> {
        let steam_exe = format!("{steam_dir}\\steam.exe");
        let client = format!("{steam_dir}\\steamclient.dll");
        let client64 = format!("{steam_dir}\\steamclient64.dll");
        set_values(
            HKEY_CURRENT_USER,
            "Software\\Valve\\Steam\\ActiveProcess",
            &[
                Value::Dword("pid", std::process::id()),
                Value::Dword("Universe", 1),
                Value::Str("SteamClientDll", &client),
                Value::Str("SteamClientDll64", &client64),
            ],
        )?;
        set_values(
            HKEY_CURRENT_USER,
            "Software\\Valve\\Steam",
            &[
                Value::Str("SteamPath", steam_dir),
                Value::Str("SteamExe", &steam_exe),
            ],
        )?;
        set_values(
            HKEY_LOCAL_MACHINE,
            "Software\\Wow6432Node\\Valve\\Steam",
            &[Value::Str("InstallPath", steam_dir)],
        )
    }

    enum Value<'a> {
        Str(&'a str, &'a str),
        Dword(&'a str, u32),
    }

    fn set_values(root: HKEY, subkey: &str, values: &[Value]) -> Result<(), String> {
        let mut key: HKEY = std::ptr::null_mut();
        let path = cstr(subkey);
        let status = unsafe {
            RegCreateKeyExA(
                root,
                path.as_ptr(),
                0,
                std::ptr::null(),
                REG_OPTION_NON_VOLATILE,
                KEY_WRITE,
                std::ptr::null(),
                &mut key,
                std::ptr::null_mut(),
            )
        };
        if status != 0 {
            return Err(format!("registry key {subkey} could not be opened"));
        }
        for value in values {
            let name = match value {
                Value::Str(name, _) | Value::Dword(name, _) => cstr(name),
            };
            let status = match value {
                Value::Str(_, text) => {
                    let data = cstr(text);
                    unsafe {
                        RegSetValueExA(
                            key,
                            name.as_ptr(),
                            0,
                            REG_SZ,
                            data.as_ptr(),
                            data.len() as u32,
                        )
                    }
                }
                Value::Dword(_, number) => {
                    let data = number.to_le_bytes();
                    unsafe {
                        RegSetValueExA(
                            key,
                            name.as_ptr(),
                            0,
                            REG_DWORD,
                            data.as_ptr(),
                            data.len() as u32,
                        )
                    }
                }
            };
            if status != 0 {
                unsafe { RegCloseKey(key) };
                return Err(format!(
                    "registry value under {subkey} could not be written"
                ));
            }
        }
        unsafe { RegCloseKey(key) };
        Ok(())
    }

    type CreateInterface = unsafe extern "C" fn(*const u8, *mut i32) -> *mut c_void;
    type InterfacePipe = unsafe extern "C" fn(*mut c_void) -> i32;

    /// Load one SteamClient interface so the flat exports start working.
    fn wake_client_interface(
        proc: &dyn Fn(&str) -> Result<*const c_void, String>,
    ) -> Option<*mut c_void> {
        let Ok(create) = proc("CreateInterface") else {
            return None;
        };
        let create: CreateInterface = unsafe { std::mem::transmute(create) };
        // The in-process engine is what actually opens a pipe. SteamClient023
        // comes up, then its own CreateSteamPipe stays at 0.
        for name in ["CLIENTENGINE_INTERFACE_VERSION005", "SteamClient023"] {
            let name = cstr(name);
            let mut code = 0i32;
            let interface = unsafe { create(name.as_ptr(), &mut code) };
            if !interface.is_null() {
                return Some(interface);
            }
        }
        None
    }

    /// The client thread needs a moment after the interface exists. Slot 0 of
    /// ISteamClient is CreateSteamPipe; the flat export is the same call.
    fn open_pipe(create_pipe: CreatePipe, interface: Option<*mut c_void>) -> i32 {
        let deadline = Instant::now() + Duration::from_secs(8);
        while Instant::now() < deadline {
            let mut pipe = unsafe { create_pipe() };
            if pipe == 0 {
                if let Some(interface) = interface {
                    pipe = interface_pipe(interface);
                }
            }
            if pipe > 0 {
                return pipe;
            }
            std::thread::sleep(Duration::from_millis(200));
        }
        0
    }

    fn interface_pipe(interface: *mut c_void) -> i32 {
        let vtable = unsafe { *(interface as *const *const *const c_void) };
        if vtable.is_null() {
            return 0;
        }
        let method: InterfacePipe = unsafe { std::mem::transmute(*vtable) };
        unsafe { method(interface) }
    }

    fn cstr(text: &str) -> Vec<u8> {
        let mut bytes = text.as_bytes().to_vec();
        bytes.push(0);
        bytes
    }

    fn host_steamclient(request: &Request, steam_dir: &str) -> Result<(), String> {
        let dll_dir = cstr(steam_dir);
        unsafe { SetDllDirectoryA(dll_dir.as_ptr()) };
        let dll = cstr(&format!("{steam_dir}\\steamclient64.dll"));
        let module = unsafe { LoadLibraryA(dll.as_ptr()) };
        if module.is_null() {
            return Err(format!("steamclient64.dll did not load (err {})", unsafe {
                GetLastError()
            }));
        }
        let proc = |name: &str| -> Result<*const c_void, String> {
            let symbol = cstr(name);
            unsafe { GetProcAddress(module, symbol.as_ptr()) }
                .map(|p| p as *const c_void)
                .ok_or_else(|| format!("steamclient64.dll has no {name}"))
        };
        let create_pipe: CreatePipe =
            unsafe { std::mem::transmute(proc("Steam_CreateSteamPipe")?) };
        let create_user: CreateUser =
            unsafe { std::mem::transmute(proc("Steam_CreateGlobalUser")?) };
        let log_on: LogOn = unsafe { std::mem::transmute(proc("Steam_LogOn")?) };
        let log_off: LogOff = unsafe { std::mem::transmute(proc("Steam_LogOff")?) };
        let logged_on: BLoggedOn = unsafe { std::mem::transmute(proc("Steam_BLoggedOn")?) };
        let get_callback: BGetCallback =
            unsafe { std::mem::transmute(proc("Steam_BGetCallback")?) };
        let free_last: FreeLast = unsafe { std::mem::transmute(proc("Steam_FreeLastCallback")?) };
        let release_user: ReleaseUser = unsafe { std::mem::transmute(proc("Steam_ReleaseUser")?) };
        let release_pipe: ReleasePipe =
            unsafe { std::mem::transmute(proc("Steam_BReleaseSteamPipe")?) };
        // Creating a SteamClient interface starts the client. The pipe export
        // returns 0 until that startup finishes, so retry briefly.
        let interface = wake_client_interface(&proc);
        let mut pipe = open_pipe(create_pipe, interface);
        if pipe == 0 {
            return Err("steamclient would not open a pipe".into());
        }
        let user = unsafe { create_user(&mut pipe) };
        if user == 0 {
            return Err("steamclient would not create a user".into());
        }
        let steam_id = request.steam_id_u64()?;
        unsafe { log_on(user, pipe, steam_id) };

        let logged = wait_logged_on(logged_on, get_callback, free_last, user, pipe);
        if logged {
            if let Ok(ready) = std::env::var("ORBIT_AGENT_READY") {
                let _ = std::fs::write(ready, b"1");
            }
            pump_until_stopped(get_callback, free_last, logged_on, user, pipe);
        }

        unsafe {
            log_off(user, pipe);
            release_user(pipe, user);
            release_pipe(pipe);
        }
        if logged {
            Ok(())
        } else {
            Err("steamclient did not reach Logged On with the saved token".into())
        }
    }

    fn wait_logged_on(
        logged_on: BLoggedOn,
        get_callback: BGetCallback,
        free_last: FreeLast,
        user: i32,
        pipe: i32,
    ) -> bool {
        let deadline = Instant::now() + LOGON_TIMEOUT;
        while Instant::now() < deadline {
            pump(get_callback, free_last, pipe);
            if unsafe { logged_on(user, pipe) } {
                return true;
            }
            std::thread::sleep(Duration::from_millis(250));
        }
        false
    }

    /// Stay the IPC master while the game runs. Exit when Orbit drops the stop
    /// file in or the session signs out.
    fn pump_until_stopped(
        get_callback: BGetCallback,
        free_last: FreeLast,
        logged_on: BLoggedOn,
        user: i32,
        pipe: i32,
    ) {
        let stop = std::env::var("ORBIT_AGENT_STOP").ok();
        loop {
            pump(get_callback, free_last, pipe);
            if stop.as_deref().is_some_and(|path| Path::new(path).exists()) {
                return;
            }
            if !unsafe { logged_on(user, pipe) } {
                return;
            }
            std::thread::sleep(Duration::from_millis(200));
        }
    }

    /// Drain pending callbacks so the client keeps its connection alive. Each
    /// callback is released immediately; leaving it queued stalls logon.
    fn pump(get_callback: BGetCallback, free_last: FreeLast, pipe: i32) {
        let mut message: [u64; 8] = [0; 8];
        let mut call: [u64; 2] = [0; 2];
        let mut guard = 0;
        while guard < 128
            && unsafe {
                get_callback(
                    pipe,
                    message.as_mut_ptr() as *mut c_void,
                    call.as_mut_ptr() as *mut c_void,
                )
            }
        {
            unsafe { free_last(pipe) };
            guard += 1;
        }
    }
}
