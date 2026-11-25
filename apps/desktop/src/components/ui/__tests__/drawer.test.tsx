import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { Drawer } from '../drawer'

afterEach(cleanup)

function renderDrawer(props: Partial<Parameters<typeof Drawer>[0]> = {}) {
  const onClose = vi.fn()
  render(
    <Drawer
      id="test-drawer"
      title="Choose artwork"
      description="Pick an image."
      closeLabel="Close artwork picker"
      onClose={onClose}
      toolbar={<input aria-label="Search" />}
      {...props}
    >
      <p>Body</p>
    </Drawer>,
  )
  return onClose
}

it('is a floating glass sheet over a blur backdrop, named by its title', () => {
  const onClose = renderDrawer()
  const dialog = screen.getByRole('dialog', { name: 'Choose artwork' })
  expect(dialog).toHaveAttribute('aria-modal', 'true')
  expect(dialog.className).toContain('orbit-glass')
  expect(dialog.className).toContain('orbit-drawer')
  expect(screen.getByText('Pick an image.')).toBeInTheDocument()
  const scrim = screen.getByTestId('test-drawer-scrim')
  expect(scrim).toHaveAttribute('aria-hidden', 'true')
  fireEvent.click(scrim)
  expect(onClose).toHaveBeenCalledTimes(1)
})

it('keeps the header and toolbar fixed while the body scrolls, with a round close', () => {
  const onClose = renderDrawer()
  const body = screen.getByTestId('test-drawer-scroll')
  expect(body.className).toContain('overflow-auto')
  expect(body).toHaveClass('pt-3.5')
  expect(body).toHaveTextContent('Body')
  const close = screen.getByRole('button', { name: 'Close artwork picker' })
  expect(body).not.toContainElement(close)
  expect(body).not.toContainElement(screen.getByRole('textbox', { name: 'Search' }))
  expect(close.className).toContain('rounded-full')
  fireEvent.click(close)
  expect(onClose).toHaveBeenCalledTimes(1)
})

it('slides from either side at the width asked for', () => {
  renderDrawer({ side: 'left', width: '960px' })
  const host = screen.getByTestId('test-drawer-host')
  expect(host).toHaveStyle({ position: 'fixed', left: '0px', width: '960px' })
  cleanup()
  renderDrawer()
  expect(screen.getByTestId('test-drawer-host')).toHaveStyle({ right: '0px' })
})
