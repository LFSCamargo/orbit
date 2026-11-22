# Xbox Cloud Gaming

Orbit browses the xCloud catalog, links a Microsoft account with a device code, and streams cloud games in Orbit's own player (see below). Games stream on xbox.com: Orbit has no streaming client and does not read browser sessions.

## Sign-in (device code)

`services/xbox_auth.rs`, commands in `commands/xcloud.rs`, UI in `modules/xcloud/components/XboxDeviceCodeModal.tsx`.

1. `xbox_device_start`: `login.microsoftonline.com/consumers/oauth2/v2.0/devicecode` with xbox.com's public client `1f907974-e22b-4810-a9de-d9647380c97e` and scope `xboxlive.signin openid profile offline_access` (the client Greenlight uses). Only this client gets xCloud streaming tokens; the older Xbox app client `000000004C12AE6F` does not, and a link saved with it counts as signed out, so the user links once more. Orbit shows `user_code` and the `microsoft.com/link` page.
2. `xbox_device_poll`: polls `oauth2/v2.0/token` at the given interval. It handles `authorization_pending`, `slow_down`, `expired_token` and `access_denied`.
3. Once approved, the access token (as `RpsTicket: d=<token>`) is exchanged for an Xbox user token and then an XSTS token, which give the gamertag and XUID. These calls send xbox.com's `Origin`/`Referer`.
4. Only the refresh token, gamertag and XUID are saved, in `Application Support/Orbit/xbox/session.json` (mode 0600, symlinks refused). The device code and access tokens stay in memory and never reach the frontend. `xbox_sign_out` deletes the file.

## Orbit's own player (no xbox.com page)

Play streams in Orbit's main window. Nothing opens a web page: the launch commands only record the launch (`record_launch` in `commands/xcloud.rs`), and `playLibraryEntry` opens the player (`stores/xcloudPlayer.store.ts`, `modules/xcloud-player/`). Written in Orbit from the protocol xbox.com and Greenlight use (MIT, read for reference; no third-party code is bundled). It is an unofficial, undocumented service and can break.

**Tokens** (`services/xcloud_stream/auth.rs`): refresh the saved link (the rotated refresh token is saved), Xbox user token, XSTS for `http://gssv.xboxlive.com/`, then `POST https://{offering}.gssv-play-prod.xboxlive.com/v2/login/user` (`x-gssv-client: XboxComBrowser`), trying `xgpuweb` then `xgpuwebf2p`. Only `https` region hosts under `.gssv-play-prod.xboxlive.com` are kept. `xcloud_stream_status` returns only the market and region names (Settings: "Cloud streaming ready · {region} ({market})").

**Session** (`services/xcloud_stream/session.rs`, `http.rs`; one stream at a time; token and session stay in Rust):

1. `xcloud_stream_start(productId)`: `GET /v2/titles` maps the Store product id to xCloud's title id, then `POST /v5/sessions/cloud/play`. The returned `sessionPath` must be under `/v5/sessions/cloud/`.
2. `xcloud_stream_state`: `GET {session}/state`. On `ReadyToConnect` it sends `POST {session}/connect` once with a login.live.com token for `PURPOSE_XBOX_CLOUD_CONSOLE_TRANSFER_TOKEN`. `WaitingForResources` is the queue; `Failed` carries Microsoft's reason.
3. `xcloud_stream_sdp(offer)` and `xcloud_stream_ice(candidates)`: post, then poll until `exchangeResponse` (30 s limit).
4. `xcloud_stream_keepalive` every 30 s; `xcloud_stream_stop` sends `DELETE {session}`.
5. `xcloud_stream_playing(playing)`: the player is showing the stream (true) or paused or closed (false). It only toggles Orbit's background stand-down (`launching/game_activity.rs`); `xcloud_stream_stop` also clears it.
   Every request carries xbox.com's `X-MS-Device-Info` (Windows, so 1080p) and checked paths only; answers are capped at 256 KB.

**Player** (`modules/xcloud-player/`): `runStream.ts` drives the steps above. `xcloudPeer.ts` holds the `RTCPeerConnection` (H.264 preferred, stereo audio) with the `message` (handshake, client configuration, server disconnect, default answers to system dialogs), `control` (authorization, gamepad slot, keyframe requests only when the picture freezes for 1 s or the stream resumes, at most one per 2 s, `keyframePolicy.ts`; periodic keyframes spiked the bitrate), `input` and `chat` channels, and adds the IPv4 candidates hidden in Teredo addresses (`teredo.ts`). `inputPacket.ts` encodes the binary input reports (14-byte header, video frame timings from `requestVideoFrameCallback`, 23-byte gamepad frames with Y up-positive). `gamepadFrame.ts` reads the first standard-mapping pad every 16 ms; rumble plays through `vibrationActuator`. `XcloudPlayer.tsx` is a full-screen overlay (the window goes fullscreen and returns), with queue and error states. Home (any path, including the native Guide button), Esc, the menu button or holding View + Menu for 1.5 s pauses the stream and opens Orbit's Home menu with **Continue**, **Stop game**, **Back to Orbit** and **Quit Orbit**. Paused, the connection and keepalive stay up; the player is hidden and muted and sends a released pad, then no input (`setPaused`). **Back to Orbit** leaves it paused in the background and Orbit fully usable; the Home menu offers Continue again. The Guide button never reaches the game: the player reads it from the in-page pad (button 16) and opens the menu on press, because the native Home listener (gilrs) does not know every pad, such as the 8BitDo Ultimate 2 over Bluetooth. One press seen by both paths opens the menu once (`homeMenuOpenedAt`, 600 ms). B belongs to the game, so Orbit's controller navigation and stick scrolling pause only while the stream is visible. While it plays, `useStreamStandDown` suspends Orbit's in-page pad poller and calls `xcloud_stream_playing(true)`, so Rust's controller listener drops to Home-only polling and the network monitor stops pushing samples, as for a local game; Orbit's screens behind the player are not painted (`app/appLayer.ts`). Pausing or closing reverses both. Microsoft may end a stream that stays idle too long.

## Catalog

`services/xcloud_catalog.rs` (fetch and parse) and `services/xcloud_library.rs` (cache and library annotation).

- Product ids come from SIGL `catalog.gamepass.com/sigls/v2?id=29a81209-df6f-41fd-a528-2ae6b91f719c`, the cloud "All games" list. It was checked against the live API and differs from the console and PC lists.
- Details come from `displaycatalog.mp.microsoft.com/v7.0/products` in batches of 20. A failed batch is skipped, products with no title are dropped, and missing art stays empty. `//` image URIs become `https:`. Entries are deduplicated by Store product id.
- The catalog is cached per market in the metadata cache (`xcloud_catalog`, `xcloud_catalog_fetches`) and refreshed when older than 24 h, or on demand. If a refresh fails, the cached catalog is served along with the error.
- The market comes from the `xbox-market` setting (`US` or `en-US` form) and defaults to `en-US`.

## Library: Game Pass in All games, saved titles in Installed

- `list_library_entries` with `includeCloudCatalog` (sent only by the Library and Search pages) adds every cached catalog title that is not saved. These come from `xcloud_library::catalog_library_entries`, with id `xcloud:{productId}`, provider `xcloud` and **no installation**, so they show in All games, in the "Xbox Cloud Gaming" section, but never in Installed. Home and the sidebar leave them out.
- A title becomes Installed (a `games` row with an installation that has no path) when either of these succeeds:
  - **Add to library**: `save_xcloud_game` → `xcloud_launch::save_catalog_entry`. No launch is recorded.
  - **Play**: `launch_xcloud_game`. It validates the `https://www.xbox.com/…/play/launch/{slug}/{productId}` URL, saves the title and records the launch in `play_sessions` and `last_played_at`; the frontend then opens Orbit's player.
- Catalog fetches never write `games`. **In library** (remove) deletes the row, and the title goes back to Game Pass in All games.
- Saved games replay with `launch_xcloud_library_game`, which never starts a tracked session. They have no disk size, folder, uninstall or Wine/GPTK settings, and they join Recently played.
- A Steam title and its xCloud entry stay separate rows.
- The slug is cosmetic: Xbox routes by product id.

## UI

- **Library sections** (`LibrarySections`): each source can be collapsed (`librarySectionsCollapsed` in the UI store) and pages 24 tiles at a time ("Show more"). Collapse all / Expand all sits above them. A search opens every section and shows every match. The Library page loads every title at once (`limit: 5000`), and the sections do the paging.
- **Square art**: the Store's 1:1 `BoxArt` / `FeaturePromotionalSquareArt` is the cloud game's `icon`, so the Home shelf (square art only) shows it. Saved games without it get it from the cached catalog, written once to the game row (`fill_missing_icon`) so screens that read games directly, like the Home shelf, show it, and a catalog cached before square art was read refreshes once.
- **Cloud cards**: the tile only opens the game's details; it has no buttons. **Play** and **Add to library** / **In library** (`CloudGameActions`) live on the details page.
- **Sign-in** (`XboxDeviceCodeModal`): it uses the shared dialog style. It asks Microsoft for a fresh code on every open and on **New code**. It appears in Settings → General (`XboxCloudSettings`) and on the onboarding Account step.
- `XBOX_CLOUD_ENABLED` in `lib/features.ts` gates all of it. Library → Refresh also refreshes the catalog.
