import { create } from 'zustand'
import {
  DEFAULT_APP_PREFERENCES,
  loadAppPreferences,
  saveAppPreferences,
  type AppPreferences,
} from '@/lib/appPreferences'

interface PreferencesState {
  preferences: AppPreferences
  /** Loaded (or failed to load) once; the app waits for this before choosing
   * between onboarding and Home. */
  ready: boolean
  hydrate: () => Promise<void>
  update: (patch: Partial<AppPreferences>) => Promise<void>
}

export const usePreferencesStore = create<PreferencesState>((set, get) => ({
  preferences: DEFAULT_APP_PREFERENCES,
  ready: false,
  hydrate: async () => {
    try {
      set({ preferences: await loadAppPreferences(), ready: true })
    } catch {
      set({ ready: true })
    }
  },
  update: async (patch) => {
    const preferences = { ...get().preferences, ...patch }
    set({ preferences })
    await saveAppPreferences(preferences)
  },
}))
