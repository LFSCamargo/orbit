import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { SearchX } from 'lucide-react'
import { afterEach, expect, it, vi } from 'vitest'
import { EmptyState } from '../EmptyState'

afterEach(cleanup)

it('reads as a status with a title, a hint and an action that fixes it', () => {
  const clear = vi.fn()
  render(
    <EmptyState
      icon={SearchX}
      title="No games match “zelda”"
      description="Try another title, or search every platform."
      actions={[
        { label: 'Clear search', focusId: 'empty-clear', group: 'g', onClick: clear },
      ]}
    />,
  )
  const status = screen.getByRole('status')
  expect(status).toHaveTextContent('No games match “zelda”')
  expect(status).toHaveTextContent('Try another title, or search every platform.')
  fireEvent.click(screen.getByRole('button', { name: 'Clear search' }))
  expect(clear).toHaveBeenCalled()
})

it('has a compact size for tables and small cards, without actions', () => {
  render(<EmptyState size="sm" icon={SearchX} title="Nothing matches" />)
  const status = screen.getByRole('status')
  expect(status).toHaveAttribute('data-size', 'sm')
  expect(screen.queryByRole('button')).not.toBeInTheDocument()
})
