import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { parseReleases } from '@/lib/releases'
import { githubRelease } from '@/lib/__tests__/fixtures'
import { ReleaseAssets } from '../ReleaseAssets'

describe('ReleaseAssets', () => {
  it('lists installers before checksums with size and a download link', () => {
    const [release] = parseReleases([githubRelease('0.3.0')])
    render(<ReleaseAssets assets={release.assets} />)

    const items = screen.getAllByRole('listitem')
    expect(items).toHaveLength(3)
    expect(
      within(items[0]).getByText('macOS disk image · Apple Silicon'),
    ).toBeInTheDocument()
    expect(within(items[0]).getByText('12.0 MB')).toBeInTheDocument()
    expect(within(items[2]).getByText('SHA-256 checksums')).toBeInTheDocument()

    const link = within(items[0]).getByRole('link', {
      name: /Download Orbit-0.3.0-aarch64.dmg/,
    })
    expect(link).toHaveAttribute(
      'href',
      'https://github.com/LFSCamargo/orbit/releases/download/v0.3.0/Orbit-0.3.0-aarch64.dmg',
    )
  })

  it('explains when a release has no files', () => {
    render(<ReleaseAssets assets={[]} />)
    expect(screen.getByText(/no downloadable files/i)).toBeInTheDocument()
  })
})
