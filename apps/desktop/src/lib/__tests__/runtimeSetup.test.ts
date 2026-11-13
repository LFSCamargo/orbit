import { expect, it, vi } from 'vitest'
import { installWindowsCompatibility } from '../tauri'

it('explains the desktop requirement without constructing a native channel in browser preview', async () => {
  await expect(installWindowsCompatibility(vi.fn())).rejects.toThrow(
    'Managed downloads require the Orbit desktop app.',
  )
})
