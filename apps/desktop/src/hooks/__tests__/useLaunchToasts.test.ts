import { afterEach, expect, it, vi } from 'vitest'
import type { LaunchProgress } from '@/lib/launchProgress'
import { syncLaunchToast } from '../useLaunchToasts'

vi.mock('@/lib/toast', () => ({
  notify: { progress: vi.fn(), success: vi.fn(), error: vi.fn(), dismiss: vi.fn() },
}))
import { notify } from '@/lib/toast'

afterEach(() => vi.clearAllMocks())

const launch = (step: string, extra: Partial<LaunchProgress> = {}): LaunchProgress => ({
  gameId: 'steam-windows:312990',
  title: 'The Expendabros',
  step,
  message: '',
  index: 0,
  total: 11,
  failed: false,
  ...extra,
})

it('shows each start-up step, then running', () => {
  syncLaunchToast(null, launch('login'))
  expect(notify.progress).toHaveBeenCalledWith({
    id: 'game-launch',
    title: 'The Expendabros',
    caption: 'Step 6 of 10 · Using the saved Steam login',
    message: undefined,
    value: 60,
  })
  syncLaunchToast(launch('login'), launch('running'))
  expect(notify.success).toHaveBeenCalledWith(
    { title: 'The Expendabros', message: 'Game is running' },
    { id: 'game-launch' },
  )
})

it('reports the failed step and clears a cancelled start', () => {
  syncLaunchToast(
    launch('steam'),
    launch('steam', { failed: true, message: 'Steam did not sign in for this game.' }),
  )
  expect(notify.error).toHaveBeenCalledWith(
    {
      title: 'The Expendabros did not start',
      message: 'Steam did not sign in for this game.',
    },
    { id: 'game-launch' },
  )
  syncLaunchToast(launch('container'), null)
  expect(notify.dismiss).toHaveBeenCalledWith('game-launch')
})
