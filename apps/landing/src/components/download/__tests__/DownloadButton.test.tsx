import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { parseReleases } from '@/lib/releases'
import { githubRelease } from '@/lib/__tests__/fixtures'
import { RELEASES_URL } from '@/lib/site'
import { DownloadButton } from '../DownloadButton'

describe('DownloadButton', () => {
  it('downloads the Apple Silicon disk image, with version and size', () => {
    const [release] = parseReleases([githubRelease('0.3.0')])
    render(<DownloadButton release={release} />)
    const link = screen.getByRole('link', { name: /Download for Mac/ })
    expect(link).toHaveAttribute(
      'href',
      'https://github.com/LFSCamargo/orbit/releases/download/v0.3.0/Orbit-0.3.0-aarch64.dmg',
    )
    expect(link).toHaveTextContent('v0.3.0 · Apple Silicon · 12.0 MB')
    expect(link.className).toContain('orbit-btn-fire')
  })

  it('sends people to GitHub when a release has no Mac download', () => {
    render(<DownloadButton release={undefined} />)
    expect(
      screen.getByRole('link', { name: /Get Orbit for Mac on GitHub/ }),
    ).toHaveAttribute('href', RELEASES_URL)
  })

  it('never offers Windows or Linux', () => {
    const [release] = parseReleases([githubRelease('0.3.0')])
    const { container } = render(<DownloadButton release={release} compact />)
    expect(container.textContent).not.toMatch(/Windows|Linux/)
  })
})
