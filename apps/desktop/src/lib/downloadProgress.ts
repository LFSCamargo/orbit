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
  /** Smoothed bytes per second while downloading; null when not measurable. */
  rate?: number | null
  /** Last byte sample the rate was measured from. */
  sample?: { at: number; bytes: number }
  /** Recent speeds (oldest first, about one per second) for the speed graph. */
  history?: number[]
  /** Fastest speed seen for this transfer. */
  peak?: number
}

/** Speed samples kept per transfer: about a minute and a half. */
const HISTORY_LIMIT = 90

type DownloadStore = {
  tasks: Record<string, DownloadTask>
  /** Last error per task key, kept until dismissed or a retry starts. */
  failures: Record<string, string>
  start: (task: { key: string; label: string }) => void
  update: (key: string, progress: SetupProgress) => void
  finish: (key: string) => void
  fail: (key: string, error: string) => void
  clear: (key: string) => void
  /** Drops every finished transfer; running ones and failures stay. */
  clearCompleted: () => void
}

export const useDownloadStore = create<DownloadStore>((set) => ({
  tasks: {},
  failures: {},
  start: ({ key, label }) =>
    set((state) => ({
      tasks: {
        ...state.tasks,
        [key]: {
          key,
          label,
          progress: null,
          startedAt: new Date().toISOString(),
          rate: null,
        },
      },
      failures: omit(state.failures, key),
    })),
  update: (key, progress) =>
    set((state) => {
      const task = state.tasks[key]
      if (!task) return state
      return {
        tasks: {
          ...state.tasks,
          [key]: { ...task, progress, ...track(task, measure(task, progress)) },
        },
      }
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
  clearCompleted: () =>
    set((state) => ({
      tasks: Object.fromEntries(
        Object.entries(state.tasks).filter(([, task]) => !isFinished(task)),
      ),
    })),
}))

/** Weight of the newest sample in the smoothed rate. */
const RATE_SMOOTHING = 0.4

/** Adds a measured speed to the task's history and peak. O(h), h ≤ HISTORY_LIMIT. */
function track(
  task: DownloadTask,
  measured: Pick<DownloadTask, 'rate' | 'sample'>,
): Pick<DownloadTask, 'rate' | 'sample' | 'history' | 'peak'> {
  const rate = measured.rate
  if (typeof rate !== 'number' || measured.sample === undefined) {
    return { ...measured, history: task.history, peak: task.peak }
  }
  const history = [...(task.history ?? []), rate].slice(-HISTORY_LIMIT)
  return { ...measured, history, peak: Math.max(task.peak ?? 0, rate) }
}

/** Rate fields after a progress update. O(1). */
function measure(
  task: DownloadTask,
  progress: SetupProgress,
): Pick<DownloadTask, 'rate' | 'sample'> {
  if (progress.phase !== 'Downloading') return { rate: null, sample: undefined }
  const next = { at: Date.now(), bytes: progress.downloadedBytes }
  if (typeof progress.bytesPerSecond === 'number')
    return { rate: Math.max(0, Math.round(progress.bytesPerSecond)), sample: next }
  const measured = transferRate(task.sample ?? null, next)
  if (measured === null) {
    // Too soon after the last sample: keep it so the next one spans longer.
    return task.sample && next.at - task.sample.at < 200
      ? { rate: task.rate ?? null, sample: task.sample }
      : { rate: task.rate ?? null, sample: next }
  }
  const previous = task.rate ?? null
  const rate =
    previous === null
      ? measured
      : previous * (1 - RATE_SMOOTHING) + measured * RATE_SMOOTHING
  return { rate: Math.round(rate), sample: next }
}

function omit<T>(record: Record<string, T>, key: string): Record<string, T> {
  const next = { ...record }
  delete next[key]
  return next
}

function isFinished(task: DownloadTask): boolean {
  return task.progress?.phase === 'Ready'
}

/** Byte counters when the phase reports them, regardless of which phase it is. */
function progressBytes(
  progress: SetupProgress | null,
): { downloaded: number; total: number } | null {
  if (!progress || !('totalBytes' in progress)) return null
  const total = progress.totalBytes ?? 0
  return { downloaded: progress.downloadedBytes ?? 0, total }
}

/**
 * Percentage 0-100 for any phase that reports a known total, 100 once ready,
 * or null while the amount of work is unknown (the bar is indeterminate).
 */
export function downloadPercent(progress: SetupProgress | null): number | null {
  if (progress?.phase === 'Ready') return 100
  const bytes = progressBytes(progress)
  if (!bytes || bytes.total <= 0) return null
  return Math.min(100, Math.round((bytes.downloaded / bytes.total) * 100))
}

/**
 * Precise 0-100 progress (not rounded), 100 once ready, or null while the
 * amount of work is unknown. Use for bars so large downloads move smoothly.
 */
export function downloadFraction(progress: SetupProgress | null): number | null {
  if (progress?.phase === 'Ready') return 100
  const bytes = progressBytes(progress)
  if (!bytes || bytes.total <= 0) return null
  return Math.min(100, Math.max(0, (bytes.downloaded / bytes.total) * 100))
}

/** "3.4%", "100%"; one decimal while in progress so slow movement shows. */
export function formatPercent(value: number | null): string | null {
  if (value === null) return null
  if (value <= 0) return '0%'
  if (value >= 100) return '100%'
  return `${Math.floor(value * 10) / 10}%`
}

/** "35s", "41m", "1h 12m", "2d 2h": how people say time left. */
export function formatTimeLeft(seconds: number): string {
  const total = Math.max(0, Math.round(seconds))
  if (total < 60) return `${total}s`
  const minutes = Math.floor(total / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ${minutes % 60}m`
  return `${Math.floor(hours / 24)}d ${hours % 24}h`
}

/** One-line status a screen can read out, always including a percentage when known. */
export function downloadStatus(task: DownloadTask): string {
  const { progress, label } = task
  if (!progress) return `Preparing ${label}…`
  const percent = downloadPercent(progress)
  switch (progress.phase) {
    case 'Downloading': {
      if (percent === null)
        return `Downloading ${label} · ${formatTransferSize(progress.downloadedBytes)}`
      return `Downloading ${label} · ${percent}% · ${transferredOf(progress)}`
    }
    case 'Verifying':
      return percent === null
        ? `Checking the download of ${label}…`
        : `Checking the download of ${label} · ${percent}%`
    case 'Extracting':
      return `Unpacking ${label}…`
    case 'Installing': {
      const step = progress.message ? `${progress.message} · ${label}` : null
      if (step) return percent === null ? `${step}…` : `${step} · ${percent}%`
      return `Finishing setup for ${label}…`
    }
    case 'Ready':
      return `${label} · ${progress.message}`
  }
}

/** "42.1 GB / 74.6 GB" for a download with a known total, else null. */
export function transferredOf(progress: SetupProgress | null): string | null {
  const bytes = progressBytes(progress)
  if (!bytes || bytes.total <= 0) return null
  return `${formatTransferSize(bytes.downloaded)} / ${formatTransferSize(bytes.total)}`
}

/** Decimal units, matching how Steam and transfer rates report sizes. */
export function formatTransferSize(bytes: number): string {
  if (bytes < 1_000) return `${Math.max(0, Math.round(bytes))} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let value = bytes / 1_000
  let unit = 0
  while (value >= 1_000 && unit < units.length - 1) {
    value /= 1_000
    unit += 1
  }
  return `${value.toFixed(1)} ${units[unit]}`
}

export function transferRate(
  previous: { at: number; bytes: number } | null,
  next: { at: number; bytes: number },
): number | null {
  if (!previous) return null
  const elapsed = (next.at - previous.at) / 1000
  if (elapsed < 0.2) return null
  const delta = next.bytes - previous.bytes
  if (delta < 0) return null
  return delta / elapsed
}

export function formatTransferRate(bytesPerSecond: number | null): string {
  if (bytesPerSecond === null) return 'Idle'
  if (bytesPerSecond < 1_000) return `${Math.round(bytesPerSecond)} B/s`
  if (bytesPerSecond < 1_000_000) return `${(bytesPerSecond / 1_000).toFixed(1)} KB/s`
  return `${(bytesPerSecond / 1_000_000).toFixed(1)} MB/s`
}

/** Seconds until a download with a known total finishes, or null. */
export function timeLeft(
  progress: SetupProgress | null,
  rate: number | null,
): number | null {
  if (progress?.phase !== 'Downloading' || !rate || rate <= 0) return null
  if (progress.totalBytes <= 0) return null
  return Math.max(0, Math.ceil((progress.totalBytes - progress.downloadedBytes) / rate))
}

/** Whole seconds since an ISO start time, never negative. */
export function elapsedSeconds(startedAt: string, now: number): number {
  const start = Date.parse(startedAt)
  return Number.isNaN(start) ? 0 : Math.max(0, Math.floor((now - start) / 1000))
}

/** "0:42", "12:05", "1:02:03". */
export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const secs = String(total % 60).padStart(2, '0')
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${secs}`
  return `${minutes}:${secs}`
}

const STEAM_STEPS = [
  'Preparing',
  'Signing in to Steam',
  'Starting download',
  'Allocating disk space',
  'Downloading',
  'Verifying',
  'Installing files',
] as const

export type DownloadStep = { index: number; count: number; label: string }

/**
 * Where a Steam game download is: 1-based step of seven, from preparing the
 * container to installing files. Null for transfers without Steam steps.
 */
export function downloadStep(task: DownloadTask): DownloadStep | null {
  if (!/^steam:\d+$/.test(task.key)) return null
  const step = (index: number, label?: string) => ({
    index,
    count: STEAM_STEPS.length,
    label: label ?? STEAM_STEPS[index - 1],
  })
  const progress = task.progress
  if (!progress) return step(1)
  switch (progress.phase) {
    case 'Downloading':
      return step(5)
    case 'Verifying':
      return step(6)
    case 'Extracting':
      return step(7)
    case 'Ready':
      return step(7, 'Installed')
    case 'Installing': {
      const index = STEAM_STEPS.findIndex((label) => label === progress.message)
      return index > 0 ? step(index + 1) : step(1)
    }
  }
}

/** Transfers still running, in the order they started. */
export function selectActive(tasks: Record<string, DownloadTask>): DownloadTask[] {
  return Object.values(tasks).filter((task) => !isFinished(task))
}

export function selectCompleted(tasks: Record<string, DownloadTask>): DownloadTask[] {
  return Object.values(tasks).filter(isFinished)
}

/** True while any tracked transfer is still running; finished ones never block. */
export function selectBusy(tasks: Record<string, DownloadTask>): boolean {
  return selectActive(tasks).length > 0
}
