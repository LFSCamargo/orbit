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
vi.mock('@/modules/settings/components/SteamLibraryFolders', () => ({
  SteamLibraryFolders: () => <div>Steam library folders</div>,
}))
vi.mock('@/modules/settings/components/XboxCloudSettings', () => ({
  XboxCloudSettings: () => <div>Xbox settings view</div>,
}))
vi.mock('@/modules/settings/components/MsStoreSettings', () => ({
  MsStoreSettings: () => <div>Microsoft Store settings view</div>,
}))
vi.mock('@/modules/settings/components/SteamSettings', () => ({
  SteamSettings: () => <div>Steam settings view</div>,
}))
vi.mock('@/modules/settings/components/CompatibilityGlobalSettings', () => ({
  CompatibilityGlobalSettings: () => <div data-testid="graphics-body" />,
}))
vi.mock('@/modules/settings/components/RuntimeSettings', () => ({
  RuntimeSettings: () => <div>Runtime settings view</div>,
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
    expect(screen.getByRole('button', { name: 'Steam' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Game graphics' })).toBeInTheDocument()
    expect(screen.getByText('API settings view')).toBeInTheDocument()
    expect(screen.getByText('Liquid Glass')).toBeInTheDocument()
    expect(screen.queryByText('Theme settings view')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Appearance' })).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Metadata & artwork' }),
    ).not.toBeInTheDocument()

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

  it('leaves space under the graphics header before the form', () => {
    useUiStore.setState({ settingsTab: 'graphics' })
    render(<SettingsPage />)
    const header = document.querySelector('.settings-panel-header')
    expect(header?.className).toContain('!mb-6')
    expect(
      screen.getByText('One starting point for all your Windows games.'),
    ).toBeInTheDocument()
    expect(screen.getByTestId('graphics-body')).toBeInTheDocument()
  })

  it('fills the shell column so only the middle panel scrolls', () => {
    const { container } = render(<SettingsPage />)
    expect(container.querySelector('.macos-page')).toHaveClass(
      'h-full',
      'min-h-0',
      'flex-col',
      'overflow-hidden',
    )
    expect(container.querySelector('.settings-layout')).toHaveClass('h-full', 'min-h-0')
    expect(container.querySelector('.settings-content-scroll')).toHaveClass(
      'h-full',
      'overflow-y-auto',
    )
  })
})
