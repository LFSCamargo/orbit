import { useEffect } from 'react'
import {
  downloadFraction,
  downloadStatus,
  downloadStep,
  formatTimeLeft,
  formatTransferRate,
  timeLeft,
  transferredOf,
  useDownloadStore,
  type DownloadTask,
} from '@/lib/downloadProgress'
import { notify } from '@/lib/toast'
import { onboardingVisible } from '@/modules/onboarding/lib/onboardingVisibility'

type Snapshot = {
  tasks: Record<string, DownloadTask>
  failures: Record<string, string>
}

/**
 * Caption and message for a running transfer. Steam games name their step
 * ("Step 5 of 7 · Downloading") and read speed and bytes while downloading;
 * other transfers keep their one-line status.
 */
export function progressLines(task: DownloadTask): {
  caption?: string
  message?: string
} {
  const step = downloadStep(task)
  const bytes = transferredOf(task.progress)
  const speed =
    task.progress?.phase === 'Downloading' && task.rate
      ? formatTransferRate(task.rate)
      : null
  const left = timeLeft(task.progress, task.rate ?? null)
  const remaining = left === null ? null : `${formatTimeLeft(left)} left`
  if (!step) return { message: bytes ?? downloadStatus(task) }
  return {
    caption: `Step ${step.index} of ${step.count} · ${step.label}`,
    message: [speed, bytes, remaining].filter(Boolean).join(' · ') || undefined,
  }
}

/**
 * Applies one store change to the toasts. A transfer keeps one toast (keyed
 * by its task key) that moves from progress to success or error; a cancel or
 * pause removes it. O(t) over tracked transfers.
 */
export function syncDownloadToasts(previous: Snapshot, next: Snapshot) {
  for (const task of Object.values(next.tasks)) {
    if (task.progress?.phase === 'Ready') {
      if (previous.tasks[task.key]?.progress?.phase !== 'Ready')
        notify.success(
          { title: task.label, message: task.progress.message || 'Installed' },
          { id: task.key },
        )
      continue
    }
    if (previous.tasks[task.key] === task) continue
    notify.progress({
      id: task.key,
      title: task.label,
      ...progressLines(task),
      value: downloadFraction(task.progress),
    })
  }
  for (const [key, error] of Object.entries(next.failures)) {
    if (previous.failures[key] === error) continue
    const label = previous.tasks[key]?.label ?? 'Download'
    notify.error({ title: `${label} did not finish`, message: error }, { id: key })
  }
  for (const key of Object.keys(previous.tasks)) {
    if (!next.tasks[key] && !next.failures[key]) notify.dismiss(key)
  }
}

/** Mount once: mirrors every tracked download as a toast. Quiet during
 * onboarding, whose Setup step already shows each install.
 */
export function useDownloadToasts() {
  useEffect(
    () =>
      useDownloadStore.subscribe((next, previous) => {
        if (!onboardingVisible()) syncDownloadToasts(previous, next)
      }),
    [],
  )
}
