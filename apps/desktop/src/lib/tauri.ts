import { Channel, invoke } from '@tauri-apps/api/core'
import { isTauriRuntime, mockInvoke } from '@/lib/devMockApi'
import type {
  CreateGameRequest,
  Game,
  GameSession,
  ImporterStatus,
  ScanResult,
  UpdateGameRequest,
} from '@/types/game'
import type { SwitchLibraryScan } from '@/types/switch'
import type { HomeContentInventory } from '@/types/gameContent'
import type { ThemeDefinition } from '@/themes/types'

import type {
  DownloadQueue,
  InstallLocation,
  NetworkStats,
  UninstallReport,
} from '@/types/downloads'
import type { StorageOverview } from '@/types/storage'
import type { InstallSize } from '@/types/library'
async function run<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (!isTauriRuntime()) {
    return mockInvoke<T>(cmd, args)
  }
  return invoke<T>(cmd, args)
}

export async function listGames(): Promise<Game[]> {
  return run<Game[]>('list_games')
}

export async function getGame(gameId: string): Promise<Game | null> {
  return run<Game | null>('get_game', { gameId })
}

export async function createGame(request: CreateGameRequest): Promise<Game> {
  return run<Game>('create_game', { request })
}

export async function updateGame(
  gameId: string,
  request: UpdateGameRequest,
): Promise<Game> {
  return run<Game>('update_game', { gameId, request })
}

export async function toggleFavorite(gameId: string): Promise<Game> {
  return run<Game>('toggle_favorite', { gameId })
}

export async function setGameHidden(gameId: string, hidden: boolean): Promise<Game> {
  return run<Game>('set_game_hidden', { gameId, hidden })
}

export async function deleteGame(gameId: string): Promise<void> {
  return run('delete_game', { gameId })
}

export async function clearLibrary(): Promise<number> {
  return run<number>('clear_library')
}

export async function launchGame(gameId: string): Promise<GameSession> {
  return run<GameSession>('launch_game', { gameId })
}

export async function stopGame(sessionId: string): Promise<GameSession> {
  return run<GameSession>('stop_game', { sessionId })
}

export async function getActiveSession(): Promise<GameSession | null> {
  return run<GameSession | null>('get_active_session')
}

export async function setWindowFullscreen(fullscreen: boolean): Promise<void> {
  return run('set_window_fullscreen', { fullscreen })
}

export async function hideOrbitWindow(): Promise<void> {
  return run('hide_orbit_window')
}

export async function showOrbitWindow(): Promise<void> {
  return run('show_orbit_window')
}

/** Minimizes Orbit's window to the Dock; no-op in the browser build. */
export async function minimizeOrbitWindow(): Promise<void> {
  if (!isTauriRuntime()) return
  const { getCurrentWindow } = await import('@tauri-apps/api/window')
  await getCurrentWindow().minimize()
}

/** Opens (or brings back) the Xbox Cloud Gaming window, xbox.com/play. */
export async function openXboxCloud(): Promise<void> {
  return run('open_xbox_cloud')
}

export async function quitOrbit(): Promise<void> {
  return run('quit_orbit')
}

export async function detectImporters(): Promise<ImporterStatus[]> {
  return run<ImporterStatus[]>('detect_importers')
}

export async function scanSteamLibrary(): Promise<ScanResult> {
  return run<ScanResult>('scan_steam_library')
}

export async function scanAstrisFolder(folder: string): Promise<ScanResult> {
  return run<ScanResult>('scan_astris_folder', { folder })
}

export async function scanSwitchLibraryFolder(
  folder: string,
): Promise<SwitchLibraryScan> {
  return run<SwitchLibraryScan>('scan_switch_library_folder', { folder })
}

export async function scanSwitchLibraryFromLibrary(): Promise<SwitchLibraryScan> {
  return run<SwitchLibraryScan>('scan_switch_library_from_library')
}

export async function getHomeContentInventory(): Promise<HomeContentInventory> {
  return run<HomeContentInventory>('get_home_content_inventory')
}

export async function scanNativeApps(): Promise<ScanResult> {
  return run<ScanResult>('scan_native_apps')
}

export async function importGamePath(path: string): Promise<ScanResult> {
  return run<ScanResult>('import_game_path', { path })
}

export interface EnrichGameResult {
  enriched: boolean
  message: string
}

export async function enrichGameMetadata(gameId: string): Promise<EnrichGameResult> {
  return run<EnrichGameResult>('enrich_game_metadata', { gameId })
}

export async function enrichGamesMetadata(
  gameIds: string[],
): Promise<{ enriched: number }> {
  return run<{ enriched: number }>('enrich_games_metadata', { gameIds })
}

export interface MetadataCacheStats {
  gameCount: number
  dbPath: string
}

export async function getMetadataCacheStats(): Promise<MetadataCacheStats> {
  return run<MetadataCacheStats>('get_metadata_cache_stats')
}

export interface MetadataApiTestResult {
  thegamesdbOk: boolean
  steamgriddbOk: boolean
  message: string
}

export async function testMetadataApiKeys(): Promise<MetadataApiTestResult> {
  return run<MetadataApiTestResult>('test_metadata_api_keys')
}

export async function getSetting<T = unknown>(key: string): Promise<T | null> {
  if (!isTauriRuntime() && key === 'themeId') {
    const local = localStorage.getItem('orbit.themeId')
    if (local) return local as T
  }
  return run<T | null>('get_setting', { key })
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  if (!isTauriRuntime()) {
    localStorage.setItem(
      `orbit.${key}`,
      typeof value === 'string' ? value : JSON.stringify(value),
    )
  }
  return run('set_setting', { key, value })
}

export async function listCustomThemes(): Promise<ThemeDefinition[]> {
  return run<ThemeDefinition[]>('list_custom_themes')
}

export async function saveCustomTheme(theme: ThemeDefinition): Promise<ThemeDefinition> {
  return run<ThemeDefinition>('save_custom_theme', { theme })
}

export async function deleteCustomTheme(id: string): Promise<void> {
  return run('delete_custom_theme', { id })
}

export async function themesDirectory(): Promise<string> {
  return run<string>('themes_directory')
}

export { isTauriRuntime }

export interface ThemeArtworkHit {
  id: string
  title: string
  previewUrl: string
  imageUrl: string
  source: string
  width: number
  height: number
}
export function searchThemeArtwork(query: string, slot: 'logo' | 'hero') {
  return run<ThemeArtworkHit[]>('search_theme_artwork', { query, slot })
}
export function fetchThemeArtwork(url: string, slot: 'logo' | 'hero') {
  return run<string>('fetch_theme_artwork', { url, slot })
}

export function bundledThemeArtwork(themeId: string, slot: 'logo' | 'hero') {
  return run<string | null>('bundled_theme_artwork', { themeId, slot })
}

export function cacheArtworkFromUrl(url: string, gameId: string, slot: string) {
  return run<string>('cache_artwork_from_url', { url, gameId, slot })
}

export function openSteamLibrary(): Promise<void> {
  return run('open_steam_library')
}

export function installSteamGame(appId: string): Promise<void> {
  return run('install_steam_game', { appId })
}

export function getHeroLighting(gameId: string, slot: 'hero' | 'cover') {
  return run<[number, number, number] | null>('get_hero_lighting', { gameId, slot })
}

export function getGlassMaterial() {
  return run<{ grain: string; toolbarBlur: number; panelBlur: number }>(
    'get_glass_material',
  )
}

export interface ThemePreview {
  themeId: string
  logo: string | null
  hero: string | null
}

export function prepareThemePreviews(
  onPreview: (preview: ThemePreview) => void,
): Promise<void> {
  const channel = new Channel<ThemePreview>()
  channel.onmessage = onPreview
  return run('prepare_theme_previews', { onPreview: channel })
}

export async function windowsCompatibility(): Promise<
  import('@/types/runtime').CompatibilityStatus
> {
  return run('windows_compatibility')
}

export async function installWindowsCompatibility(
  onProgress: (progress: import('@/types/runtime').SetupProgress) => void,
): Promise<import('@/types/runtime').WineInstallation> {
  if (!isTauriRuntime()) return run('install_windows_compatibility')
  const channel = new Channel<import('@/types/runtime').SetupProgress>()
  channel.onmessage = onProgress
  return run('install_windows_compatibility', { onProgress: channel })
}

export async function orbitWineStatus(): Promise<
  import('@/types/runtime').OrbitWineStatus | null
> {
  return run('orbit_wine_status')
}

/** Installs the newest published Orbit Wine and prepares its base container. */
export async function installOrbitWine(
  onProgress: (progress: import('@/types/runtime').SetupProgress) => void,
): Promise<import('@/types/runtime').OrbitWineStatus> {
  if (!isTauriRuntime()) return run('install_orbit_wine')
  const channel = new Channel<import('@/types/runtime').SetupProgress>()
  channel.onmessage = onProgress
  return run('install_orbit_wine', { onProgress: channel })
}

export async function installComponent(
  spec: import('@/types/runtime').ComponentSpec,
  onProgress: (progress: import('@/types/runtime').SetupProgress) => void,
): Promise<import('@/types/runtime').InstalledComponent> {
  if (!isTauriRuntime()) return run('install_component', { spec })
  const channel = new Channel<import('@/types/runtime').SetupProgress>()
  channel.onmessage = onProgress
  return run('install_component', { spec, onProgress: channel })
}

export async function getComponentStatus(): Promise<
  import('@/types/runtime').InstalledComponent[]
> {
  return run('component_status')
}

export async function getActiveComponents(): Promise<
  import('@/types/runtime').ActiveComponents
> {
  return run('active_components')
}

export async function setActiveComponent(
  component: string,
  version: string,
): Promise<import('@/types/runtime').ActiveComponents> {
  return run('set_active_component', { component, version })
}

export async function getComponentViews(): Promise<Record<string, string>> {
  return run('component_views')
}

export async function setComponentView(
  group: string,
  key: string,
): Promise<Record<string, string>> {
  return run('set_component_view', { group, key })
}

export async function installGptkViaHomebrew(
  formula: import('@/types/runtime').GptkFormula,
  onProgress: (message: string) => void,
): Promise<import('@/types/runtime').InstalledComponent> {
  if (!isTauriRuntime()) return run('install_gptk_via_homebrew', { formula })
  const channel = new Channel<string>()
  channel.onmessage = onProgress
  return run('install_gptk_via_homebrew', { formula, onProgress: channel })
}

export async function installLocalGptkPackage(
  path: string,
  onProgress: (progress: import('@/types/runtime').SetupProgress) => void,
): Promise<import('@/types/runtime').InstalledComponent> {
  if (!isTauriRuntime()) return run('install_local_gptk_package', { path })
  const channel = new Channel<import('@/types/runtime').SetupProgress>()
  channel.onmessage = onProgress
  return run('install_local_gptk_package', { path, onProgress: channel })
}

export async function registerComponentPath(
  id: string,
  version: string,
  path: string,
): Promise<import('@/types/runtime').InstalledComponent> {
  return run('register_component_path', { id, version, path })
}

export async function getCompatibilityCatalog(
  forceRefresh = false,
): Promise<import('@/types/runtime').CompatibilityCatalog> {
  return run('compatibility_catalog', { forceRefresh })
}

export async function getCompatibilitySettings(): Promise<
  import('@/types/runtime').CompatibilitySettings
> {
  return run('compatibility_settings')
}

export async function updateCompatibilitySettings(
  settings: import('@/types/runtime').CompatibilitySettings,
): Promise<import('@/types/runtime').CompatibilitySettings> {
  return run('update_compatibility_settings', { settings })
}

export async function detectRuntimes(): Promise<
  import('@/types/runtime').WineInstallation[]
> {
  return run('detect_runtimes')
}
export async function registerWineRuntime(
  path: string,
): Promise<import('@/types/runtime').WineInstallation> {
  return run('register_wine_runtime', { path })
}
export async function runtimeDiagnostics(gameId: string): Promise<string> {
  return run('runtime_diagnostics', { gameId })
}
export async function cancelGameLaunch(): Promise<void> {
  return run('cancel_game_launch')
}

export async function steamWindowsStatus(): Promise<
  import('@/types/steam').SteamWindowsStatus
> {
  return run('steam_windows_status')
}

export async function steamWindowsPreferences(): Promise<
  import('@/types/steam').SteamWindowsPreferences
> {
  return run('steam_windows_preferences')
}

export async function setSteamWindowsPreferences(
  preferences: import('@/types/steam').SteamWindowsPreferences,
): Promise<import('@/types/steam').SteamWindowsPreferences> {
  return run('set_steam_windows_preferences', { preferences })
}

export async function steamWindowsLibrary(): Promise<
  import('@/types/steam').SteamOwnedGame[]
> {
  return run('steam_windows_library')
}

export async function installWindowsSteam(): Promise<void> {
  return run('install_windows_steam')
}

export async function openSteamWindowsLogin(): Promise<void> {
  return run('open_steam_windows_login')
}

export async function placeSteamWindowsLogin(frame: {
  x: number
  y: number
  width: number
  height: number
}): Promise<import('@/types/steam').SteamLoginPlacement> {
  return run('place_steam_windows_login', frame)
}

export async function pollSteamWindowsLogin(): Promise<
  import('@/types/steam').SteamLoginPoll
> {
  return run('poll_steam_windows_login')
}

export async function beginSteamWindowsPassword(
  accountName: string,
  password: string,
): Promise<import('@/types/steam').SteamPasswordStart> {
  return run('begin_steam_windows_password', { accountName, password })
}

export async function submitSteamWindowsGuard(
  clientId: string,
  steamId: string,
  code: string,
  codeType: number,
): Promise<void> {
  return run('submit_steam_windows_guard', { clientId, steamId, code, codeType })
}

export async function startSteamWindowsQr(): Promise<
  import('@/types/steam').SteamQrStart
> {
  return run('start_steam_windows_qr')
}

export async function pollSteamWindowsQr(
  clientId: string,
  requestId: string,
): Promise<import('@/types/steam').SteamQrPoll> {
  return run('poll_steam_windows_qr', { clientId, requestId })
}

export async function connectSteamWindows(): Promise<
  import('@/types/steam').SteamWindowsStatus
> {
  return run('connect_steam_windows')
}

export async function cancelSteamWindowsSignIn(): Promise<void> {
  return run('cancel_steam_windows_sign_in')
}

export async function disconnectSteamWindows(): Promise<
  import('@/types/steam').SteamWindowsStatus
> {
  return run('disconnect_steam_windows')
}

export async function refreshSteamWindowsLibrary(): Promise<
  import('@/types/steam').SteamOwnedGame[]
> {
  return run('refresh_steam_windows_library')
}

export async function retrySteamCatalogMetadata(): Promise<
  import('@/types/steam').SteamOwnedGame[]
> {
  return run('retry_steam_catalog_metadata')
}

export async function downloadSteamWindowsGame(appId: string): Promise<void> {
  return run('download_steam_windows_game', { appId })
}

/**
 * Queues an owned Steam title; progress arrives as `steam-download-progress`
 * events. `location` is an install location id; without one the game keeps
 * its current location (or the last one used).
 */
export async function enqueueSteamDownload(
  appId: string,
  location?: string,
): Promise<void> {
  return run('enqueue_steam_download', { appId, location: location ?? null })
}

/** Steam's controller support for a title: `full`, `partial`, `none`, or null until known. */
export async function steamControllerSupport(appId: string): Promise<string | null> {
  return run('steam_controller_support', { appId })
}

export async function listInstallLocations(): Promise<InstallLocation[]> {
  return run('list_install_locations')
}

export async function addInstallLocation(path: string): Promise<InstallLocation> {
  return run('add_install_location', { path })
}

export async function removeInstallLocation(id: string): Promise<void> {
  return run('remove_install_location', { id })
}

export async function getDownloadQueue(): Promise<DownloadQueue> {
  return run('get_download_queue')
}

export async function removeQueuedDownload(appId: string): Promise<void> {
  return run('remove_queued_download', { appId })
}

export async function startQueuedDownloadNow(appId: string): Promise<void> {
  return run('start_queued_download_now', { appId })
}

export async function pauseActiveDownload(): Promise<void> {
  return run('pause_active_download')
}

/** Latest network sample; later ones arrive as `network-stats` events. */
export async function getNetworkStats(): Promise<NetworkStats> {
  return run('get_network_stats')
}

export async function uninstallSteamGame(
  appId: string,
  deletePrefix: boolean,
): Promise<UninstallReport> {
  return run('uninstall_steam_game', { appId, deletePrefix })
}

export async function getInstallSizes(
  entryId: string,
  refresh = false,
): Promise<InstallSize[]> {
  return run('get_install_sizes', { entryId, refresh })
}

export async function getStorageOverview(refresh = false): Promise<StorageOverview> {
  return run('get_storage_overview', { refresh })
}

export async function removeComponent(id: string, version: string): Promise<void> {
  return run('remove_component', { id, version })
}

export async function cancelSteamWindowsDownload(): Promise<void> {
  return run('cancel_steam_windows_download')
}

export async function playSteamWindowsGame(appId: string): Promise<GameSession> {
  return run('play_steam_windows_game', { appId })
}

export function listLibraryEntries(query: import('@/types/library').LibraryQuery) {
  return run<import('@/types/library').LibraryPageResult>('list_library_entries', {
    query,
  })
}
export function getLibraryEntry(entryId: string) {
  return run<import('@/types/library').LibraryEntry | null>('get_library_entry', {
    entryId,
  })
}
export function updateLibraryEntry(
  entryId: string,
  patch: import('@/types/library').LibraryEntryPatch,
) {
  return run<void>('update_library_entry', { entryId, patch })
}
export function scanSteamInstallations() {
  return run<ScanResult>('scan_steam_installations')
}

export function deleteLibraryEntry(entryId: string) {
  return run<void>('delete_library_entry', { entryId })
}

export function revealPath(path: string) {
  return run<void>('reveal_path', { path })
}

export function xboxDeviceStart() {
  return run<import('@/types/xcloud').XboxDeviceStart>('xbox_device_start')
}

export function xboxDevicePoll() {
  return run<import('@/types/xcloud').XboxDevicePoll>('xbox_device_poll')
}

export function xboxDeviceCancel() {
  return run<void>('xbox_device_cancel')
}

/** Starts a cloud stream for a Store product id; tokens stay in Rust. */
export function xcloudStreamStart(productId: string) {
  return run<void>('xcloud_stream_start', { productId })
}

export function xcloudStreamState() {
  return run<import('@/types/xcloud').XcloudStreamState>('xcloud_stream_state')
}

export function xcloudStreamSdp(offer: string) {
  return run<string>('xcloud_stream_sdp', { offer })
}

export function xcloudStreamIce(
  candidates: import('@/types/xcloud').XcloudIceCandidate[],
) {
  return run<import('@/types/xcloud').XcloudIceCandidate[]>('xcloud_stream_ice', {
    candidates,
  })
}

export function xcloudStreamKeepalive() {
  return run<boolean>('xcloud_stream_keepalive')
}

export function xcloudStreamStop() {
  return run<void>('xcloud_stream_stop')
}

/** The player shows the stream (true) or is paused or closed (false). */
export function xcloudStreamPlaying(playing: boolean) {
  return run<void>('xcloud_stream_playing', { playing })
}

/** Whether the linked account can stream in Orbit's player, and from where. */
export function xcloudStreamStatus() {
  return run<import('@/types/xcloud').XcloudStreamStatus>('xcloud_stream_status')
}

export function xboxAccountStatus() {
  return run<import('@/types/xcloud').XboxAccount | null>('xbox_account_status')
}

export function xboxSignOut() {
  return run<void>('xbox_sign_out')
}

export function listXcloudCatalog(refresh = false) {
  return run<import('@/types/xcloud').XcloudCatalog>('list_xcloud_catalog', { refresh })
}

/** Opens a catalog title in the browser; the first launch adds it to the library. */
export function launchXcloudGame(productId: string) {
  return run<Game>('launch_xcloud_game', { productId })
}

export function launchXcloudLibraryGame(gameId: string) {
  return run<Game>('launch_xcloud_library_game', { gameId })
}

/** Opens an https link in the default browser (a new tab in the dev mock). */
export async function openExternalUrl(url: string) {
  if (!url.startsWith('https://')) throw new Error('Only https links can be opened')
  if (!isTauriRuntime()) {
    window.open(url, '_blank', 'noopener')
    return
  }
  const { openUrl } = await import('@tauri-apps/plugin-opener')
  await openUrl(url)
}

/** Adds a catalog title to the library (Installed) without launching it. */
export function saveXcloudGame(productId: string) {
  return run<Game>('save_xcloud_game', { productId })
}
