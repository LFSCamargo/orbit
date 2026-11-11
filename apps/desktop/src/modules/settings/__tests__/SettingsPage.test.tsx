import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SettingsPage } from '../SettingsPage'
import { useUiStore } from '@/stores/ui.store'

vi.mock('@/hooks/useFullscreen', () => ({
  useFullscreen: () => ({ fullscreen: true, setFullscreen: vi.fn() }),
}))
vi.mock('@/hooks/useGames', () => ({
  useGames: () => ({ data: [] }),
}))
vi.mock('@/hooks/useActiveTheme', () => ({
  useActiveTheme: () => ({
    id: 'liquid-glass',
    name: 'Liquid Glass',
    colors: { canvas: '6 6 8', accent: '249 115 22', focus: '250 204 21' },
  }),
}))
vi.mock('@/modules/settings/components/ThemeSettings', () => ({
  ThemeSettings: () => <div>Theme settings view</div>,
}))
vi.mock('@/modules/settings/components/ApiKeySettings', () => ({
  ApiKeySettings: () => <div>API settings view</div>,
}))
vi.mock('@/modules/settings/components/LibrarySettings', () => ({
  LibrarySettings: () => <div>Library settings view</div>,
}))
vi.mock('@/modules/imports/ImportsPage', () => ({
  ImportsSection: () => <div>Import games view</div>,
}))

describe('SettingsPage tabs', () => {
  beforeEach(() => {
    useUiStore.setState({ settingsTab: 'general', screen: 'settings' })
  })

  afterEach(cleanup)

  it('keeps one explicit active tab and swaps only the middle panel', () => {
    render(<SettingsPage />)
    expect(screen.queryByRole('button', { name: /back/i })).not.toBeInTheDocument()
    const themes = screen.getByRole('button', { name: 'Themes' })
    const general = screen.getByRole('button', { name: 'General' })

    expect(general).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('API settings view')).toBeInTheDocument()
    expect(screen.queryByText('Theme settings view')).not.toBeInTheDocument()

    fireEvent.click(themes)

    expect(themes).toHaveAttribute('aria-pressed', 'true')
    expect(general).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByText('Theme settings view')).toBeInTheDocument()
    expect(screen.queryByText('API settings view')).not.toBeInTheDocument()
    expect(useUiStore.getState().settingsTab).toBe('themes')
  })

  it('restores the active tab after leaving and reopening settings', () => {
    useUiStore.setState({ settingsTab: 'themes' })
    const { unmount } = render(<SettingsPage />)
    expect(screen.getByText('Theme settings view')).toBeInTheDocument()

    unmount()
    render(<SettingsPage />)

    expect(screen.getByRole('button', { name: 'Themes' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByText('Theme settings view')).toBeInTheDocument()
  })
})
