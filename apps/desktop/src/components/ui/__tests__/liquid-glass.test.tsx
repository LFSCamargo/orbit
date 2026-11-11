import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LiquidGlass } from '../liquid-glass'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('LiquidGlass fallbacks', () => {
  it('keeps content usable without browser refraction APIs', () => {
    vi.stubGlobal('CSS', undefined)
    render(
      <LiquidGlass data-testid="glass">
        <button>Library</button>
      </LiquidGlass>,
    )
    expect(screen.getByTestId('glass')).toHaveAttribute('data-glass-mode', 'simple')
    expect(screen.getByRole('button', { name: 'Library' })).toBeVisible()
  })
  it('uses an opaque panel when transparency is reduced', () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({ matches: true })),
    )
    render(<LiquidGlass data-testid="glass">Your games</LiquidGlass>)
    expect(screen.getByTestId('glass')).toHaveAttribute('data-glass-mode', 'opaque')
    expect(screen.getByTestId('glass')).toHaveStyle({ backdropFilter: 'none' })
  })
})

it('renders glass without allocating a distortion canvas, observer, or SVG filter', () => {
  const observer = vi.fn()
  const canvas = vi.spyOn(HTMLCanvasElement.prototype, 'getContext')
  vi.stubGlobal('ResizeObserver', observer)
  vi.stubGlobal('CSS', { supports: () => true })
  const { container } = render(<LiquidGlass data-testid="glass">Library</LiquidGlass>)
  expect(screen.getByTestId('glass')).toHaveAttribute('data-glass-mode', 'simple')
  expect(container.querySelector('svg, filter, canvas')).toBeNull()
  expect(observer).not.toHaveBeenCalled()
  expect(canvas).not.toHaveBeenCalled()
  canvas.mockRestore()
})

it('responds to transparency changes while the app is open', () => {
  const query = new EventTarget() as EventTarget & { matches: boolean }
  query.matches = false
  vi.stubGlobal('matchMedia', () => query)
  render(<LiquidGlass data-testid="glass">Settings</LiquidGlass>)
  expect(screen.getByTestId('glass')).toHaveAttribute('data-glass-mode', 'simple')
  act(() => {
    query.matches = true
    query.dispatchEvent(new Event('change'))
  })
  expect(screen.getByTestId('glass')).toHaveAttribute('data-glass-mode', 'opaque')
})
