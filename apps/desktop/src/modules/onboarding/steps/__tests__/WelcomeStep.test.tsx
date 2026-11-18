import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { WelcomeStep } from '../WelcomeStep'

afterEach(cleanup)

it('shows the app icon above the welcome and explains what Orbit does', () => {
  const onNext = vi.fn()
  render(<WelcomeStep onNext={onNext} />)
  const icon = screen.getByRole('img', { name: 'Orbit' })
  const title = screen.getByRole('heading', { name: 'Welcome to Orbit' })
  expect(
    icon.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy()
  const features = screen.getByRole('list', { name: 'What Orbit does' })
  expect(within(features).getAllByRole('listitem')).toHaveLength(4)
  expect(features).toHaveTextContent(/windows games on a Mac/i)
  expect(screen.getByText(/change anything later in Settings/)).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: /Get Started/ }))
  expect(onNext).toHaveBeenCalled()
})
