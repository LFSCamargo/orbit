# Experimental GameHub bridge investigation

Inspected installed GameHub 0.8.613 on 2026-11-10. Binary SHA-256:
`fe44b84c0b4e7eaca5da57ae10f576b7bf265c627862a074b088f381e9aaa357`.

`tools/gamehub/inspect_embedded_assets.py` reproduces extraction of its Brotli-compressed Tauri frontend modules from the Mach-O `__DATA_CONST` asset map. Run it with a temporary output directory and the local GameHub executable. Extracted vendor code belongs outside this repository.

## Verified command contract from the bundled frontend

| Operation           | Native Tauri command           | Frontend argument shape                                                                                                                   | Observation                                                            |
| ------------------- | ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Steam owned library | `get_library`                  | `{ steamId }`                                                                                                                             | Returns records with `app_id` and `install_state`.                     |
| Steam entitlement   | `get_steam_app_access_profile` | `{ appId }`                                                                                                                               | Returns `owned` and `authorization`, including selected family lender. |
| Epic sessions       | `epic_list_sessions`           | `{}`                                                                                                                                      | Needed to choose an authenticated account.                             |
| Epic owned library  | `epic_list_library`            | `{ request: { accountId, ... } }`                                                                                                         | Store wrapper forwards a request object.                               |
| GOG sessions        | `gog_list_sessions`            | `{}`                                                                                                                                      | Needed to choose an authenticated account.                             |
| GOG owned library   | `gog_list_library`             | `{ request: { accountId } }`                                                                                                              | Store wrapper forwards a request object.                               |
| Queue               | `download_get_queue`           | `{}`                                                                                                                                      | Returns live task snapshot.                                            |
| Install             | `download_enqueue`             | `{ request: { provider, gameId, providerGameId, providerAccountId, title, coverImageUrl, installPath, ... }, confirmSteamLenderChange? }` | Returns a `task.taskId`.                                               |

For Steam, the frontend validates the active Steam session, entitlement, and family lender before enqueue. Its request includes `steamAppId`, optional branch and depot settings, and `steamFamilyLenderSteamId`. Epic includes `epicAppName`; GOG can include `gogLanguage`. GameHub chooses an installation path through its own folder dialog and capacity checks. These checks must be reproduced or delegated, and any lender change must require an explicit user decision.

The earlier `start_download_task` symbol is not the normal game installation path. The normal UI calls `download_enqueue`.

## Current implementation boundary

Orbit's GameHub page reads its local installed bindings and download queue with a strict field allowlist. This supplies real cached task status but cannot enumerate every owned game. The private commands above exist only in GameHub's Tauri webview. Orbit's Tauri `invoke` reaches Orbit's backend; it cannot call GameHub's commands by name. The bundled Firebase bridge is not a general install API, and the recognized `gamehub://` links launch games or handle authentication, not installation.

A complete bridge therefore needs a GameHub-side adapter running in the authenticated GameHub webview. It should run in an isolated app copy for compatibility tests, expose only the operations above through a user-local authenticated IPC channel, and reject any binary hash besides the one inspected. It must return GameHub task IDs and queue status, preserve its ownership checks, avoid queue-file edits, and never export store credentials. The adapter has not been installed or verified against a running GameHub process, so `directInstallSupported` remains false in Orbit.

GameHub was running during this investigation. Its executable, signature, account, queue, and installation were not changed. No download was submitted.
