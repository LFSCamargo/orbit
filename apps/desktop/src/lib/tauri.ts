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

export async function scanGamehubFolder(folder?: string): Promise<ScanResult> {
  return run<ScanResult>('scan_gamehub_folder', { folder: folder ?? null })
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
    localStorage.setItem(`orbit.${key}`, String(value))
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

export async function getGameHubLibrary(): Promise<
  import('@/types/gamehub').GameHubLibrary
> {
  return run('get_gamehub_library')
}
export async function openGameHub(foreground = false): Promise<void> {
  return run('open_gamehub', { foreground })
}

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
