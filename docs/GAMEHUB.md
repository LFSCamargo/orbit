# GameHub in Orbit

Open **Library → GameHub downloads** in any theme. The same cached titles appear under **Connected games** in Library and Search. A Steam record can check for a Mac build and open Steam’s install dialog. GameHub remains the handoff for its own installs.

The manager reads GameHub's local game bindings and download queue in `~/Library/Application Support/com.gamemac.www`. It supports Steam, GOG, and Epic records and shows search, store/status filters, pagination, download percentages, cache errors, and a last-checked time. Data refreshes every five seconds while the page is open. An existing install directory is labeled **Path available**; this does not claim that a game is verified or playable. Completed downloads can remain in the cache after uninstalling. Missing progress stays unavailable.

**Keep running in background** opens GameHub without activating it and stores the `gameHubBackground` preference. While Orbit is running, it checks every 30 seconds and restarts GameHub if it has closed. Disabling the preference stops these restarts; it does not terminate GameHub or an ongoing download. This is not a macOS login item or an operating-system daemon. The integration never writes GameHub queues, containers, or account files. Only whitelisted game/progress fields are returned to the frontend; authorization fields from download records are not exposed.

## Installation boundary

The installed GameHub app supports `gamehub://launch/{store}/{id}` links. A supported external interface for enumerating the complete owned library or starting, pausing, cancelling, and uninstalling games was not found. Orbit therefore provides **Install / manage in GameHub**, which opens the existing app. It does not pretend an installation was submitted. Store login, ownership checks, install location, compatibility settings, and install controls remain in GameHub. This is an installation handoff and local status viewer, not an in-Orbit installer.

GameHub's Steam ownership snapshot uses a private binary format. Orbit does not parse it, read login credentials, invoke private Tauri commands, or modify its task files. Adding full owned-library management requires a documented GameHub API/CLI or a separately agreed store integration with proper authentication, entitlement checks, download management, and Wine/container provisioning.

After installation, create a GameHub desktop shortcut and use **Sync GameHub shortcuts**. Existing Orbit import and launch behavior handles the shortcut. Browser preview uses clearly marked sample records and never starts an installation or an external app.

## Sessions and the shared process

GameHub's existing session PID identifies its shared host rather than the selected Windows game. Orbit's **End session tracking** saves the play record without terminating the host or claiming to stop the game. Use **Close or manage the game in GameHub** to manage the actual game. GameHub game-process monitoring remains limited by the current host-level integration; Orbit cannot infer that a specific game exited while the host remains running.
