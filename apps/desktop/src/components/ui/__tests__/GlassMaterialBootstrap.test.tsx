import { cleanup, render, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, expect, it, vi } from 'vitest'
import { getGlassMaterial, isTauriRuntime } from '@/lib/tauri'
import { GlassMaterialBootstrap } from '../GlassMaterialBootstrap'
import { LiquidGlass } from '../liquid-glass'

vi.mock('@/lib/tauri', () => ({ getGlassMaterial: vi.fn(), isTauriRuntime: vi.fn() }))

afterEach(() => {
  cleanup()
  vi.resetAllMocks()
})

it('loads one Rust material for multiple panels and releases the root style', async () => {
  vi.mocked(isTauriRuntime).mockReturnValue(true)
  vi.mocked(getGlassMaterial).mockResolvedValue({
    grain: 'data:image/png;base64,fixture',
    toolbarBlur: 12,
    panelBlur: 8,
  })
  const { unmount } = render(
    <QueryClientProvider client={new QueryClient()}>
      <GlassMaterialBootstrap />
      <LiquidGlass>Library</LiquidGlass>
      <LiquidGlass>Settings</LiquidGlass>
    </QueryClientProvider>,
  )
  await waitFor(() =>
    expect(document.documentElement.style.getPropertyValue('--glass-grain')).toContain(
      'data:image/png;base64,fixture',
    ),
  )
  expect(getGlassMaterial).toHaveBeenCalledTimes(1)
  expect(document.documentElement.style.getPropertyValue('--glass-panel-blur')).toBe(
    '8px',
  )
  unmount()
  expect(document.documentElement.style.getPropertyValue('--glass-grain')).toBe('')
})

it('keeps browser preview usable without a native material request', () => {
  vi.mocked(isTauriRuntime).mockReturnValue(false)
  render(
    <QueryClientProvider client={new QueryClient()}>
      <GlassMaterialBootstrap />
      <LiquidGlass>Library</LiquidGlass>
    </QueryClientProvider>,
  )
  expect(getGlassMaterial).not.toHaveBeenCalled()
})
