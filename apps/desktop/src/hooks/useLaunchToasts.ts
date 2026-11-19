import { useEffect } from 'react'
import {
  LAUNCH_STEP_COUNT,
  LAUNCH_STEPS,
  launchStepIndex,
  launchStepPercent,
  type LaunchProgress,
} from '@/lib/launchProgress'
import { notify } from '@/lib/toast'
import { useLaunchStore } from '@/stores/launch.store'

const LAUNCH_TOAST = 'game-launch'

/**
 * Applies one launch change to its toast: each startup step with its place
 * in the sequence, then "running", or the step that failed. O(1).
 */
export function syncLaunchToast(
  previous: LaunchProgress | null,
  next: LaunchProgress | null,
) {
  if (!next) {
    if (previous && !previous.failed && previous.step !== 'running')
      notify.dismiss(LAUNCH_TOAST)
    return
  }
  if (previous === next) return
  const title = next.title ?? 'Your game'
  if (next.failed) {
    notify.error(
      { title: `${title} did not start`, message: next.message },
      { id: LAUNCH_TOAST },
    )
    return
  }
  if (next.step === 'running') {
    notify.success({ title, message: 'Game is running' }, { id: LAUNCH_TOAST })
    return
  }
  const index = launchStepIndex(next.step)
  const count = LAUNCH_STEP_COUNT
  notify.progress({
    id: LAUNCH_TOAST,
    title,
    caption: `Step ${index + 1} of ${count} · ${LAUNCH_STEPS[index].label}`,
    message:
      next.message && next.message !== LAUNCH_STEPS[index].label
        ? next.message
        : undefined,
    value: launchStepPercent(next.step),
  })
}

/** Mount once: mirrors game start-up as a toast. */
export function useLaunchToasts() {
  useEffect(
    () =>
      useLaunchStore.subscribe((next, previous) =>
        syncLaunchToast(previous.launch, next.launch),
      ),
    [],
  )
}
