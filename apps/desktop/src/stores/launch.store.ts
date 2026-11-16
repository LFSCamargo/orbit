import { create } from 'zustand'
import { LAUNCH_STEPS, launchStepIndex, type LaunchProgress } from '@/lib/launchProgress'

type LaunchState = LaunchProgress | null

interface LaunchStore {
  launch: LaunchState
  begin: (gameId: string) => void
  apply: (progress: LaunchProgress) => void
  fail: (gameId: string, step: string, message: string) => void
  clear: () => void
}

export const useLaunchStore = create<LaunchStore>((set) => ({
  launch: null,
  begin: (gameId) =>
    set({
      launch: {
        gameId,
        step: 'resolve',
        message: 'Starting…',
        index: 0,
        total: LAUNCH_STEPS.length,
        failed: false,
      },
    }),
  apply: (progress) =>
    set((state) => {
      if (
        state.launch &&
        state.launch.gameId !== progress.gameId &&
        !state.launch.gameId.startsWith('steam-windows:')
      ) {
        return state
      }
      return { launch: progress }
    }),
  fail: (gameId, step, message) =>
    set({
      launch: {
        gameId,
        step,
        message,
        index: launchStepIndex(step),
        total: LAUNCH_STEPS.length,
        failed: true,
      },
    }),
  clear: () => set({ launch: null }),
}))
