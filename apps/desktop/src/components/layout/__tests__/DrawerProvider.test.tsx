import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { DrawerProvider, useDrawer } from '../DrawerProvider'

function DrawerTrigger() {
  const { openDrawer, closeDrawer } = useDrawer()
  return (
    <button
      onClick={() =>
        openDrawer(
          <div role="dialog" aria-label="Artwork picker">
            <button onClick={closeDrawer}>Close drawer</button>
          </div>,
        )
      }
    >
      Open drawer
    </button>
  )
}

afterEach(cleanup)

describe('DrawerProvider', () => {
  it('portals drawers outside transformed page stacking contexts', () => {
    const { container } = render(
      <DrawerProvider>
        <div style={{ transform: 'translateZ(0)', opacity: 0.5 }}>
          <DrawerTrigger />
        </div>
      </DrawerProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Open drawer' }))
    const dialog = screen.getByRole('dialog', { name: 'Artwork picker' })

    expect(dialog.parentElement).toBe(document.body)
    expect(container.querySelector('[role="dialog"]')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Close drawer' }))
    expect(screen.queryByRole('dialog', { name: 'Artwork picker' })).toBeNull()
  })
})
