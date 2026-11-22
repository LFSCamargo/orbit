import { create } from 'zustand'
import type { AppUpdateState } from '@/types/appUpdate'

interface AppUpdateStore {
  /** Pushed by Rust as `app-update` (`useAppUpdateEvents`). */
  state: AppUpdateState
  setState: (state: AppUpdateState) => void
}

export const useAppUpdateStore = create<AppUpdateStore>((set) => ({
  state: { status: 'idle' },
  setState: (state) => set({ state }),
}))
