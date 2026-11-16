use super::*;
use std::fs;

/// Build a miniature GameHub support root with the exact registry shapes and
/// payload layouts observed on a real install, plus a fake Wine build whose
/// `--version` output satisfies the runtime probe.
struct Fixture {
    root: PathBuf,
}

impl Fixture {
    fn new() -> Self {
        let root = std::env::temp_dir().join(format!("orbit-gamehub-{}", uuid::Uuid::new_v4()));
        let engine = root.join("wine-engine");
        let wine = engine.join("containers/wine_installations/10000073");
        let base = engine.join("containers/base_containers/4");
        let vc = engine.join("containers/virtual_containers/3");

        fs::create_dir_all(wine.join("bin")).unwrap();
        fs::create_dir_all(wine.join("lib/wine/x86_64-unix")).unwrap();
        for name in ["wine", "wineserver"] {
            let path = wine.join("bin").join(name);
            fs::write(&path, b"#!/bin/sh\nprintf 'wine-11.0-fixture\\n'\n").unwrap();
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                fs::set_permissions(&path, fs::Permissions::from_mode(0o755)).unwrap();
            }
        }
        fs::create_dir_all(base.join("drive_c/windows/system32")).unwrap();
        fs::write(base.join("drive_c/windows/system32/cmd.exe"), b"MZ").unwrap();

        let steam = vc.join("drive_c/Program Files (x86)/Steam");
        fs::create_dir_all(&steam).unwrap();
        fs::write(steam.join("steam.exe"), b"MZ").unwrap();
        // Two manifests: a decoy that references another base, and the right
        // one referencing base_containers/4. The decoy is newer on disk order
        // but must lose to base matching.
        let manifests = vc.join(".gamehub/layer-manifests");
        fs::create_dir_all(&manifests).unwrap();
        fs::write(
            manifests.join("aaaa-decoy.bin"),
            format!("GHLAYR2{}/containers/base_containers/9", engine.display()),
        )
        .unwrap();
        fs::write(
            manifests.join("ffff-match.bin"),
            format!(
                "GHLAYR2{}{}",
                engine.display(),
                "/containers/base_containers/4"
            ),
        )
        .unwrap();

        let gptk = engine.join("downloads/gptk-4.0-2");
        fs::create_dir_all(gptk.join("wine/x86_64-windows")).unwrap();
        fs::create_dir_all(gptk.join("external")).unwrap();
        fs::write(gptk.join("wine/x86_64-windows/d3d11.dll"), b"PE").unwrap();
        fs::write(gptk.join("external/libd3dshared.dylib"), b"shared").unwrap();

        let zink = engine.join("downloads/opengl-zink");
        fs::create_dir_all(zink.join("external/lib")).unwrap();
        fs::write(zink.join("external/lib/libwine_mesa_zink.dylib"), b"zink").unwrap();
        fs::write(zink.join("external/lib/libvulkan.1.dylib"), b"vulkan").unwrap();

        fs::create_dir_all(engine.join("container")).unwrap();
        write(
            &engine.join("container/wine_installations.json"),
            &serde_json::json!({
                "wine_installations": {
                    "10000073": {
                        "id": "10000073",
                        "name": "wine-proton_11.0",
                        "version": "wine-11.0-gbdfedbca358c-dirty",
                        "install_status": "completed",
                        "architecture": "x86_64",
                        "install_path": wine.to_string_lossy(),
                        "unknown_future_field": {"nested": true}
                    }
                }
            }),
        );
        write(
            &engine.join("container/wine_containers.json"),
            &serde_json::json!({
                "containers": {
                    "4": {
                        "id": "4",
                        "prefix_path": base.to_string_lossy(),
                        "wine_installation_id": "10000073"
                    }
                }
            }),
        );
        write(
            &engine.join("container/wine_virtual_containers.json"),
            &serde_json::json!({
                "virtual_containers": {
                    "3": {
                        "id": "3",
                        "prefix_path": vc.to_string_lossy(),
                        "base_container_id": "4",
                        "sync_backend": "MSYNC",
                        "environment": {
                            "WINE_APP_ICON_MASK": "${WINE_PATH}/share/mask/roundrect-mask.png"
                        },
                        "graphics_stack_config": {
                            "id": "gptk-4.0-2",
                            "type": "D3DMETAL",
                            "install_path": gptk.to_string_lossy(),
                            "environment_template": {
                                "WINEDLLPATH": "${COMPONENT_PATH}/wine",
                                "WINE_GPTK_LIBD3DSHARED_PATH": "${COMPONENT_PATH}/external/libd3dshared.dylib"
                            }
                        },
                        "moltenvk_config": {
                            "id": "MoltenVK-gamesir-1.0",
                            "install_path": engine.join("downloads/MoltenVK-gamesir-1.0").to_string_lossy(),
                            "environment_template": {
                                "VK_ICD_FILENAMES": "${COMPONENT_PATH}/external/icd.d/MoltenVK_icd.json"
                            }
                        }
                    }
                }
            }),
        );
        fs::create_dir_all(root.join("gamehub")).unwrap();
        write(
            &root.join("gamehub/game_container_store.json"),
            &serde_json::json!({
                "schema_version": 3,
                "bindings": [
                    {
                        "id": 3,
                        "game_id": "steam-local-1593500",
                        "game_name": "God of War",
                        "platform": "steam",
                        "platform_app_id": "1593500",
                        "game_path": "/Users/someone/GameHub",
                        "virtual_container_id": "3",
                        "base_container_id": "4"
                    },
                    {
                        "id": 9,
                        "game_id": "epic-local-1",
                        "game_name": "Some Epic Game",
                        "platform": "epic",
                        "platform_app_id": "1234",
                        "game_path": "/Users/someone/GameHub",
                        "virtual_container_id": "3",
                        "base_container_id": "4"
                    }
                ]
            }),
        );
        // An accounts file whose token fields must never surface.
        fs::create_dir_all(root.join("steam-client")).unwrap();
        write(
            &root.join("steam-client/accounts.json"),
            &serde_json::json!({
                "schema_version": 1,
                "accounts": [{
                    "account_name": "gamehub_player",
                    "access_token": "SUPER-SECRET-TOKEN",
                    "login_key": "SUPER-SECRET-KEY",
                    "refresh_token": "SUPER-SECRET-REFRESH"
                }]
            }),
        );
        Self { root }
    }

    fn engine(&self) -> GamehubEngine {
        let mut engine = GamehubEngine::discover_in(&self.root).expect("fixture engine");
        // The overlay library normally comes from GameHub.app; point at a stub.
        let sandboxfs = self.root.join("libsandboxfs.dylib");
        fs::write(&sandboxfs, b"dylib-stub").unwrap();
        engine.sandboxfs = Some(sandboxfs);
        engine
    }
}

impl Drop for Fixture {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.root);
    }
}

fn write(path: &Path, value: &serde_json::Value) {
    fs::write(path, serde_json::to_vec_pretty(value).unwrap()).unwrap();
}

#[test]
fn discovers_an_installed_engine_and_ignores_absent_ones() {
    let fixture = Fixture::new();
    assert!(GamehubEngine::discover_in(&fixture.root).is_some());
    let empty = std::env::temp_dir().join(format!("orbit-gamehub-none-{}", uuid::Uuid::new_v4()));
    fs::create_dir_all(&empty).unwrap();
    assert!(GamehubEngine::discover_in(&empty).is_none());
    let _ = fs::remove_dir_all(empty);
}

#[test]
fn finds_steam_bindings_only() {
    let fixture = Fixture::new();
    let engine = fixture.engine();
    let binding = engine.binding_for_app_id("1593500").expect("gow binding");
    assert_eq!(binding.game_name, "God of War");
    assert_eq!(binding.virtual_container_id, "3");
    assert_eq!(binding.base_container_id.as_deref(), Some("4"));
    // The Epic entry shares the container but must not match a Steam lookup.
    assert!(engine.binding_for_app_id("1234").is_none());
    assert!(engine.binding_for_app_id("9999999").is_none());
}

#[test]
fn launch_plan_reproduces_the_verified_recipe() {
    let fixture = Fixture::new();
    let engine = fixture.engine();
    let binding = engine.binding_for_app_id("1593500").unwrap();
    let plan = engine.launch_plan(&binding).expect("plan");

    assert!(plan.overlay, "overlay is mandatory for container launches");
    assert!(plan.runtime.path.ends_with("bin/wine"));
    assert_eq!(plan.runtime.version, "wine-11.0-fixture");
    assert!(plan.steam_dir.join("steam.exe").is_file());
    let base = plan.base_prefix.as_ref().expect("base prefix");
    assert!(base.ends_with("base_containers/4"));

    let gptk = engine.root.join("downloads/gptk-4.0-2");
    assert_eq!(
        plan.env["WINEDLLPATH"],
        gptk.join("wine").to_string_lossy().as_ref()
    );
    assert_eq!(
        plan.env["WINE_GPTK_LIBD3DSHARED_PATH"],
        gptk.join("external/libd3dshared.dylib")
            .to_string_lossy()
            .as_ref()
    );
    assert_eq!(
        plan.env["WINE_APP_ICON_MASK"],
        engine
            .root
            .join("containers/wine_installations/10000073/share/mask/roundrect-mask.png")
            .to_string_lossy()
            .as_ref(),
        "WINE_PATH template expands against the installation"
    );
    assert_eq!(
        plan.env["VK_ICD_FILENAMES"],
        engine
            .root
            .join("downloads/MoltenVK-gamesir-1.0/external/icd.d/MoltenVK_icd.json")
            .to_string_lossy()
            .as_ref()
    );
    assert_eq!(plan.env["WINEMSYNC"], "1");
    assert_eq!(plan.env["WINEARCH"], "win64");
    assert_eq!(plan.env["D3DM_MTL4"], "1");
    assert_eq!(plan.env["ROSETTA_ADVERTISE_AVX"], "1");
    // zink is discovered from the engine's downloads directory.
    assert_eq!(plan.env["WINE_MAC_OPENGL_BACKEND"], "zink");
    assert_eq!(plan.env["GALLIUM_DRIVER"], "zink");
    assert!(plan.env["WINE_MAC_ZINK_PROVIDER"].ends_with("libwine_mesa_zink.dylib"));
    assert!(plan.env["WINE_SONAME_LIBVULKAN"].ends_with("libvulkan.1.dylib"));
    // Overlay injection references the stub library and the base-matching manifest.
    assert!(plan.env["DYLD_INSERT_LIBRARIES"].ends_with("libsandboxfs.dylib"));
    assert!(plan.env["SANDBOXFS_LAYER_MANIFEST"].ends_with("ffff-match.bin"));
    // Secrets and host RPC endpoints are never part of the recipe.
    assert!(!plan.env.contains_key("STEAMAGENT_PORT"));
    assert!(!plan.env.contains_key("STEAM_AGENT_SERVER_HOST"));
    assert!(plan
        .env
        .values()
        .all(|value| !value.contains("SUPER-SECRET")));
}

#[test]
fn launch_plan_fails_without_a_steam_client_or_overlay() {
    let fixture = Fixture::new();
    let engine = fixture.engine();
    let binding = engine.binding_for_app_id("1593500").unwrap();

    // Missing steam.exe
    let steam = fixture.root.join(
        "wine-engine/containers/virtual_containers/3/drive_c/Program Files (x86)/Steam/steam.exe",
    );
    fs::remove_file(&steam).unwrap();
    let error = engine.launch_plan(&binding).unwrap_err();
    assert!(format!("{error:#}").contains("no Steam client"));
    fs::write(&steam, b"MZ").unwrap();

    // No sandboxfs library → overlay impossible → hard error, never a silent
    // launch into an incomplete filesystem.
    let mut no_sandboxfs = engine.clone();
    no_sandboxfs.sandboxfs = None;
    let error = no_sandboxfs.launch_plan(&binding).unwrap_err();
    assert!(format!("{error:#}").contains("overlay"));
}

#[test]
fn manifest_selection_requires_the_matching_base_and_bounds_the_scan() {
    let fixture = Fixture::new();
    let vc = fixture
        .root
        .join("wine-engine/containers/virtual_containers/3");
    let base = fixture
        .root
        .join("wine-engine/containers/base_containers/4");
    let chosen = select_layer_manifest(&vc, &base).expect("matching manifest");
    assert!(chosen.ends_with("ffff-match.bin"));
    // A base nobody generated a manifest for yields None rather than a guess.
    let other = fixture
        .root
        .join("wine-engine/containers/base_containers/77");
    assert!(select_layer_manifest(&vc, &other).is_none());
}

#[test]
fn steam_agent_args_match_the_verified_vector() {
    let args = steam_agent_args("1593500", "player_one");
    assert_eq!(args[0], "C:\\Program Files (x86)\\Steam\\steam.exe");
    assert_eq!(args[1], "--username");
    assert_eq!(args[2], "player_one");
    assert!(args.contains(&"--offline".to_string()));
    assert!(args.contains(&"--rememberme".to_string()));
    assert!(args.contains(&"--disablesteaminput".to_string()));
    assert!(args.contains(&"--skip-appinfo-refresh".to_string()));
    assert_eq!(args[args.len() - 2], "--applaunch");
    assert_eq!(args[args.len() - 1], "1593500");
    // Without an account name the flag pair is omitted entirely.
    let anonymous = steam_agent_args("440", "");
    assert!(!anonymous.contains(&"--username".to_string()));
}

#[test]
fn account_name_prefers_orbit_and_never_leaks_tokens() {
    let fixture = Fixture::new();
    let engine = fixture.engine();
    let repo_root = std::env::temp_dir().join(format!("orbit-gh-acct-{}", uuid::Uuid::new_v4()));
    let repo = GameRepository::open(&repo_root.join("library.sqlite")).unwrap();

    // No Orbit account → GameHub's account_name is used, tokens are not.
    let name = steam_account_name(&repo, &engine).expect("gamehub account");
    assert_eq!(name, "gamehub_player");

    // A stored Orbit account wins.
    repo.set_setting(
        "steam-windows-account-v1",
        &serde_json::json!("orbit_player"),
    )
    .unwrap();
    assert_eq!(
        steam_account_name(&repo, &engine).as_deref(),
        Some("orbit_player")
    );

    // Serialized debug output must not carry token material.
    let debug = format!("{:?}", steam_account_name(&repo, &engine));
    assert!(!debug.contains("SUPER-SECRET"));
    drop(repo);
    let _ = fs::remove_dir_all(repo_root);
}

#[test]
fn busy_containers_are_detected_from_the_process_table() {
    let prefix = Path::new("/Users/someone/wine-engine/containers/virtual_containers/3");
    let running = format!(
        "93534 C:\\Program Files (x86)\\Steam\\steam.exe WINEPREFIX={}\n",
        prefix.display()
    );
    assert!(container_busy_from(&running, prefix));
    assert!(!container_busy_from("93534 /usr/bin/wine other\n", prefix));
    assert!(!container_busy_from("", prefix));
}

#[test]
fn oversized_registries_are_refused() {
    let fixture = Fixture::new();
    let path = fixture
        .root
        .join("wine-engine/container/wine_installations.json");
    fs::write(&path, vec![b'x'; (MAX_REGISTRY_BYTES + 1) as usize]).unwrap();
    let engine = GamehubEngine::discover_in(&fixture.root);
    // Discovery itself only checks existence; parsing must fail bounded.
    assert!(engine.is_some());
    let engine = fixture.engine();
    let binding = GameBinding {
        game_name: "God of War".into(),
        platform_app_id: "1593500".into(),
        virtual_container_id: "3".into(),
        base_container_id: Some("4".into()),
    };
    assert!(engine.launch_plan(&binding).is_err());
}

#[test]
fn route_decision_matrix() {
    use super::super::steam_windows::PlayEngine;
    // Orbit preference never consults the engine.
    assert!(matches!(
        route_decision(PlayEngine::Orbit, false, false),
        RouteDecision::Orbit
    ));
    // Auto without an engine or binding falls back silently.
    assert!(matches!(
        route_decision(PlayEngine::Auto, false, false),
        RouteDecision::Orbit
    ));
    assert!(matches!(
        route_decision(PlayEngine::Auto, true, false),
        RouteDecision::Orbit
    ));
    assert!(matches!(
        route_decision(PlayEngine::Auto, true, true),
        RouteDecision::Gamehub
    ));
    // Explicit GameHub surfaces an error instead of falling back.
    assert!(matches!(
        route_decision(PlayEngine::Gamehub, false, false),
        RouteDecision::Fail(_)
    ));
    assert!(matches!(
        route_decision(PlayEngine::Gamehub, true, false),
        RouteDecision::Fail(_)
    ));
    assert!(matches!(
        route_decision(PlayEngine::Gamehub, true, true),
        RouteDecision::Gamehub
    ));
}

fn process_mentions(needle: &str) -> bool {
    let Ok(output) = std::process::Command::new("ps")
        .args(["axeww", "-o", "command="])
        .output()
    else {
        return false;
    };
    String::from_utf8_lossy(&output.stdout)
        .to_ascii_lowercase()
        .contains(&needle.to_ascii_lowercase())
}

/// Live end-to-end proof of the GameHub container route against the real
/// engine on this machine: discover → binding → plan → spawn → game process →
/// stop. Opt-in like the other live play tests; skips cleanly (never fails)
/// when GameHub, the God of War install, or an account name is absent.
#[test]
#[ignore = "requires a local GameHub engine with God of War installed"]
fn live_gamehub_container_launch_and_stop() {
    use std::sync::atomic::AtomicBool;
    use std::time::{Duration, Instant};

    let Some(engine) = GamehubEngine::discover() else {
        eprintln!("SKIP: no GameHub engine installed");
        return;
    };
    let Some(binding) = engine.binding_for_app_id("1593500") else {
        eprintln!("SKIP: GameHub does not manage God of War (1593500)");
        return;
    };
    let repo_root = std::env::temp_dir().join(format!("orbit-gh-live-{}", uuid::Uuid::new_v4()));
    let repo = GameRepository::open(&repo_root.join("library.sqlite")).unwrap();
    let account = match steam_account_name(&repo, &engine) {
        Some(account) => account,
        None => {
            eprintln!("SKIP: no Steam account name available");
            drop(repo);
            let _ = fs::remove_dir_all(&repo_root);
            return;
        }
    };
    let plan = engine.launch_plan(&binding).expect("launch plan");
    assert!(plan.overlay, "container launch requires the overlay");
    assert!(
        !GamehubEngine::container_busy(&plan.prefix),
        "container busy"
    );

    let cancel = AtomicBool::new(false);
    let game_id = format!("gh-live-{}", uuid::Uuid::new_v4());
    let mut runtime = start_title(&plan, &game_id, "1593500", &account, &cancel, &mut |_| {})
        .expect("spawn in GameHub container");
    eprintln!("spawned wine pid={}", runtime.pid());

    let deadline = Instant::now() + Duration::from_secs(120);
    let mut saw_game = false;
    while Instant::now() < deadline {
        if process_mentions("GoW.exe") {
            saw_game = true;
            break;
        }
        if let Ok(Some(code)) = runtime.poll() {
            panic!("container launch exited early with code {code}");
        }
        std::thread::sleep(Duration::from_secs(2));
    }
    assert!(
        saw_game,
        "God of War did not start inside the GameHub container"
    );
    eprintln!("GoW.exe running inside the GameHub container");

    runtime.stop().expect("stop container session");
    let settle = Instant::now() + Duration::from_secs(30);
    while Instant::now() < settle && process_mentions("GoW.exe") {
        std::thread::sleep(Duration::from_secs(1));
    }
    assert!(
        !process_mentions("GoW.exe"),
        "stopping the session must terminate the game"
    );
    drop(repo);
    let _ = fs::remove_dir_all(&repo_root);
}
