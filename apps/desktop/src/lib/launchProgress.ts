export const LAUNCH_STEPS = [
  { id: 'resolve', label: 'Finding the Windows install' },
  { id: 'runtime', label: 'Checking Steam for Windows' },
  { id: 'container', label: 'Preparing the game container' },
  { id: 'compatibility', label: 'Applying compatibility' },
  { id: 'steam', label: 'Seeding Steam into the container' },
  { id: 'login', label: 'Using the saved Steam login' },
  { id: 'cloud', label: 'Copying Steam Cloud saves' },
  { id: 'prefix', label: 'Preparing the Windows environment' },
  { id: 'graphics', label: 'Applying graphics settings' },
  { id: 'spawn', label: 'Starting the game' },
  { id: 'running', label: 'Game is running' },
] as const

export type LaunchStepId = (typeof LAUNCH_STEPS)[number]['id']

export type LaunchProgress = {
  gameId: string
  step: string
  message: string
  index: number
  total: number
  failed: boolean
  /** Display title; set when `gameId` is a synthetic `steam-windows:` handle. */
  title?: string | null
}

export type LaunchStepStatus = 'done' | 'current' | 'pending' | 'failed'

export function launchStepIndex(step: string) {
  const index = LAUNCH_STEPS.findIndex((item) => item.id === step)
  return index >= 0 ? index : 0
}

export function launchStepStatus(
  progress: Pick<LaunchProgress, 'step' | 'failed'>,
  stepId: string,
): LaunchStepStatus {
  const current = launchStepIndex(progress.step)
  const index = launchStepIndex(stepId)
  if (progress.failed && index === current) return 'failed'
  if (index < current) return 'done'
  if (index === current) return 'current'
  return 'pending'
}

export function launchStepLabel(step: string) {
  return LAUNCH_STEPS.find((item) => item.id === step)?.label ?? 'Launching…'
}

/** One caption on the banner: current stage, or the error. */
export function playExitMessage(code: number) {
  if (code === 53) {
    return 'Steam was not ready. If a Steam update window is open, wait for it to finish or close it, then press Play. Otherwise sign in again from Settings → Steam.'
  }
  return `The game exited with code ${code}. Open Compatibility diagnostics for details.`
}

export function launchCaption(progress: Pick<LaunchProgress, 'message' | 'failed'>) {
  const message = progress.message.trim()
  if (progress.failed) return message
  if (message.endsWith('…') || message.endsWith('...')) return message
  return `${message}…`
}
