// Reusable download progress tracker for any Orbit background transfer.
//
// Downloads outlive the panel that started them: navigating away from Settings
// must not hide progress or restart a transfer, and the upcoming Steam library
// install flow will report the same phases through this store.
import { create } from 'zustand'
import type { SetupProgress } from '@/types/runtime'

export type DownloadTask = {
  /** Stable identity for one transfer, e.g. `component:dxvk:v2.3` or `steam:1091500`. */
  key: string
  /** Human label shown next to the bar. */
  label: string
  progress: SetupProgress | null
  startedAt: string
}

type DownloadStore = {
  tasks: Record<string, DownloadTask>
  /** Last error per task key, kept until dismissed or a retry starts. */
  failures: Record<string, string>
  start: (task: { key: string; label: string }) => void
  update: (key: string, progress: SetupProgress) => void
  finish: (key: string) => void
  fail: (key: string, error: string) => void
  clear: (key: string) => void
}

export const useDownloadStore = create<DownloadStore>((set) => ({
  tasks: {},
  failures: {},
  start: ({ key, label }) =>
    set((state) => ({
      tasks: {
        ...state.tasks,
        [key]: { key, label, progress: null, startedAt: new Date().toISOString() },
      },
      failures: omit(state.failures, key),
    })),
  update: (key, progress) =>
    set((state) => {
      const task = state.tasks[key]
      if (!task) return state
      return { tasks: { ...state.tasks, [key]: { ...task, progress } } }
    }),
  finish: (key) =>
    set((state) => {
      const task = state.tasks[key]
      if (!task) return state
      return {
        tasks: {
          ...state.tasks,
          [key]: {
            ...task,
            progress: { phase: 'Ready', component: task.label, message: 'Ready' },
          },
        },
      }
    }),
  fail: (key, error) =>
    set((state) => ({
      tasks: omit(state.tasks, key),
      failures: { ...state.failures, [key]: error },
    })),
  clear: (key) =>
    set((state) => ({
      tasks: omit(state.tasks, key),
      failures: omit(state.failures, key),
    })),
}))

function omit<T>(record: Record<string, T>, key: string): Record<string, T> {
  const next = { ...record }
  delete next[key]
  return next
}

/** Percentage 0-100 for a running download, or null when the total is unknown. */
export function downloadPercent(progress: SetupProgress | null): number | null {
  if (progress?.phase !== 'Downloading' || progress.totalBytes <= 0) return null
  return Math.min(100, Math.round((progress.downloadedBytes / progress.totalBytes) * 100))
}

/** One-line status a screen can read out, always including a percentage when known. */
export function downloadStatus(task: DownloadTask): string {
  const { progress, label } = task
  if (!progress) return `Preparing ${label}…`
  switch (progress.phase) {
    case 'Downloading': {
      const percent = downloadPercent(progress)
      const transferred = `${megabytes(progress.downloadedBytes)} of ${megabytes(progress.totalBytes)} MB`
      return percent === null
        ? `Downloading ${label} · ${transferred}`
        : `Downloading ${label} · ${percent}% · ${transferred}`
    }
    case 'Verifying':
      return `Checking the download of ${label}…`
    case 'Extracting':
      return `Unpacking ${label}…`
    case 'Installing':
      return `Finishing setup for ${label}…`
    case 'Ready':
      return `${label} · ${progress.message}`
  }
}

function megabytes(bytes: number): number {
  return Math.round(bytes / 1_000_000)
}

/** True while any tracked transfer is active; screens use this to block duplicates. */
export function selectBusy(tasks: Record<string, DownloadTask>): boolean {
  return Object.keys(tasks).length > 0
}
