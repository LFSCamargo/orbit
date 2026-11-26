import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { githubRelease } from '@/lib/__tests__/fixtures'
import { fetchLatestRelease } from '@/lib/github'
import { parseReleases } from '@/lib/releases'
import InstallPage from '../page'

vi.mock('@/lib/github', () => ({
  fetchLatestRelease: vi.fn(),
}))

describe('InstallPage', () => {
  it('renders the shared DownloadButton and install steps with the latest release', async () => {
    const [release] = parseReleases([githubRelease('2.2.0')])
    vi.mocked(fetchLatestRelease).mockResolvedValue(release)

    render(await InstallPage())

    const [link] = screen.getAllByRole('link', { name: /Download for Mac/ })
    expect(link).toHaveAttribute(
      'href',
      'https://github.com/LFSCamargo/orbit/releases/download/v2.2.0/Orbit-2.2.0-aarch64.dmg',
    )
    expect(link).toHaveTextContent('v2.2.0 · Apple Silicon · 12.0 MB')
    expect(screen.getAllByText('Orbit-2.2.0-aarch64.dmg').length).toBeGreaterThan(0)
  })

  it('opens with a dedicated hero and the three install steps', async () => {
    const [release] = parseReleases([githubRelease('2.2.0')])
    vi.mocked(fetchLatestRelease).mockResolvedValue(release)

    render(await InstallPage())

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Get Orbit runningin minutes.',
    )
    expect(screen.getByText('Installation · v2.2.0')).toBeInTheDocument()
    for (const step of ['Download', 'Drag to Applications', 'Launch and play']) {
      expect(screen.getByRole('heading', { level: 3, name: step })).toBeInTheDocument()
    }
    expect(screen.getByRole('link', { name: 'All releases' })).toHaveAttribute(
      'href',
      '/download',
    )
  })
})
