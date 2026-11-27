import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { RepairAction } from '../RepairAction'

vi.mock('@/lib/tauri', () => ({ repairSteamGame: vi.fn() }))
import { repairSteamGame } from '@/lib/tauri'
vi.mock('@/lib/toast', () => ({ notify: { success: vi.fn(), error: vi.fn() } }))
import { notify } from '@/lib/toast'

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

it('queues a repair and points to Downloads', async () => {
  vi.mocked(repairSteamGame).mockResolvedValue('queued')
  render(<RepairAction appId="2322010" title="God of War Ragnarök" order={3} />)
  fireEvent.click(screen.getByRole('button', { name: /Repair installation/ }))
  await waitFor(() => expect(repairSteamGame).toHaveBeenCalledWith('2322010'))
  await waitFor(() =>
    expect(notify.success).toHaveBeenCalledWith({
      title: 'Repair started',
      message: 'Steam is checking God of War Ragnarök. Progress shows in Downloads.',
    }),
  )
})

it('reports why a repair could not start', async () => {
  vi.mocked(repairSteamGame).mockRejectedValue(
    new Error('Close your game first, then repair it.'),
  )
  render(<RepairAction appId="2322010" title="God of War Ragnarök" order={3} />)
  fireEvent.click(screen.getByRole('button', { name: /Repair installation/ }))
  await waitFor(() =>
    expect(notify.error).toHaveBeenCalledWith({
      title: 'Could not repair the game',
      message: 'Close your game first, then repair it.',
    }),
  )
})

it('is unavailable while the game runs', () => {
  render(<RepairAction appId="2322010" title="God of War Ragnarök" order={3} disabled />)
  expect(screen.getByRole('button', { name: /Repair installation/ })).toBeDisabled()
  expect(screen.getByText('End your session first')).toBeTruthy()
})
