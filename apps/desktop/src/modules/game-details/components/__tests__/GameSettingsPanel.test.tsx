import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { Game } from '@/types/game'
import { GameSettingsPanel } from '../GameSettingsPanel'

const mutateAsync = vi.fn()

vi.mock('@/hooks/useGames', () => ({
  useGameActions: () => ({ update: { mutateAsync, isPending: false, isError: false } }),
}))
vi.mock('@/components/runtime/WineProfileEditor', () => ({
  WineProfileEditor: () => null,
}))
vi.mock('../RuntimeDiagnostics', () => ({ RuntimeDiagnostics: () => null }))
vi.mock('@/components/focus/Focusable', () => ({
  Focusable: ({
    children,
    onClick,
    disabled,
  }: {
    children: React.ReactNode
    onClick?: () => void
    disabled?: boolean
  }) => (
    <button type="button" onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
}))

const game = {
  id: 'g1',
  title: 'God of War',
  launchConfig: {
    type: 'wine',
    profile: { executable: '/Games/GodOfWar/GoW.exe', runtimePath: '/Wine/bin/wine' },
  },
} as unknown as Game

afterEach(() => {
  cleanup()
  mutateAsync.mockReset()
})

function editAndSave() {
  render(<GameSettingsPanel game={game} />)
  fireEvent.change(screen.getByRole('textbox'), {
    target: { value: '/Games/GodOfWar/GoW2.exe' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Save settings' }))
}

it('says why a save failed and that the edits are still in the form', async () => {
  // Regression: the reason was dropped, leaving "Your changes have been kept".
  mutateAsync.mockRejectedValue('File does not exist: /Orbit/orbit-wine/26.3.0/bin/wine')
  editAndSave()
  const alert = await screen.findByText(/Settings weren’t saved/)
  expect(alert.textContent).toContain('File does not exist')
  expect(alert.textContent).toContain('Your edits are still here')
})

it('confirms a save', async () => {
  mutateAsync.mockResolvedValue({})
  editAndSave()
  expect(await screen.findByText('Saved. Used the next time you play.')).toBeTruthy()
})
