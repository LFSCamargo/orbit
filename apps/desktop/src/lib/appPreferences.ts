import { isTauriRuntime } from '@/lib/devMockApi'
import { getSetting, listGames, setSetting, windowsCompatibility } from '@/lib/tauri'

/** App-level preferences, stored as one JSON value in the settings table. */
export const APP_PREFERENCES_KEY = 'app-preferences-v1'

export interface AppPreferences {
  onboardingCompleted: boolean
  /** Rescan Steam, Windows Steam and Mac apps quietly when Orbit opens. */
  scanOnStartup: boolean
  /** Queue newer versions of installed compatibility components at startup. */
  autoUpdateRuntimes: boolean
  /** The Xbox Cloud Gaming window has been opened (Home menu shows it). */
  xboxCloudConnected: boolean
}

/** Fresh installs: onboarding first, with the recommended toggles on. */
export const DEFAULT_APP_PREFERENCES: AppPreferences = {
  onboardingCompleted: false,
  scanOnStartup: true,
  autoUpdateRuntimes: true,
  xboxCloudConnected: false,
}

/** A saved value merged over the defaults, or `null` when nothing usable was saved. */
export function parseAppPreferences(raw: unknown): AppPreferences | null {
  let value = raw
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value)
    } catch {
      return null
    }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const saved = value as Record<string, unknown>
  const preferences = { ...DEFAULT_APP_PREFERENCES }
  for (const key of Object.keys(preferences) as (keyof AppPreferences)[]) {
    if (typeof saved[key] === 'boolean') preferences[key] = saved[key]
  }
  return preferences
}

/** Saved preferences win. Without any, an install that already has games or a
 * managed Wine is an upgrade: it skips onboarding and keeps the new background
 * work off, so updating Orbit changes nothing it did before.
 */
export function resolveAppPreferences(
  saved: AppPreferences | null,
  existing: { hasGames: boolean; hasManagedWine: boolean },
): { preferences: AppPreferences; migrated: boolean } {
  if (saved) return { preferences: saved, migrated: false }
  if (!existing.hasGames && !existing.hasManagedWine) {
    return { preferences: { ...DEFAULT_APP_PREFERENCES }, migrated: false }
  }
  return {
    preferences: {
      ...DEFAULT_APP_PREFERENCES,
      onboardingCompleted: true,
      scanOnStartup: false,
      autoUpdateRuntimes: false,
    },
    migrated: true,
  }
}

async function readSaved(): Promise<AppPreferences | null> {
  if (!isTauriRuntime()) {
    try {
      const local = parseAppPreferences(
        localStorage.getItem(`orbit.${APP_PREFERENCES_KEY}`),
      )
      if (local) return local
    } catch {
      // Storage blocked: fall through to the settings table.
    }
  }
  return parseAppPreferences(await getSetting(APP_PREFERENCES_KEY))
}

export async function loadAppPreferences(): Promise<AppPreferences> {
  const saved = await readSaved()
  if (saved) return saved
  const [games, compatibility] = await Promise.all([
    listGames().catch(() => []),
    windowsCompatibility().catch(() => null),
  ])
  const { preferences, migrated } = resolveAppPreferences(null, {
    hasGames: games.length > 0,
    hasManagedWine: Boolean(compatibility?.managed),
  })
  if (migrated) await saveAppPreferences(preferences)
  return preferences
}

export async function saveAppPreferences(preferences: AppPreferences): Promise<void> {
  await setSetting(APP_PREFERENCES_KEY, preferences)
}
