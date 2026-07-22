import { invoke } from '@tauri-apps/api/core'
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

export async function themesDirectory(): Promise<string> {
  return run<string>('themes_directory')
}

export { isTauriRuntime }
