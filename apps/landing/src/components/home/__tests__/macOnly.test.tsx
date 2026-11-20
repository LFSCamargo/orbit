import { render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { DownloadMac } from '@/components/download/DownloadMac'
import { githubRelease } from '@/lib/__tests__/fixtures'
import { parseReleases } from '@/lib/releases'
import { Hero } from '../Hero'

vi.mock('@/components/space/OrbitGlobe', () => ({ default: () => null }))

const [latest] = parseReleases([githubRelease('1.1.2')])

/** Orbit runs on macOS only; "Windows games" (played through Orbit Wine) is
 * product copy, but Orbit itself is never offered for Windows or Linux. */
it('offers Orbit for the Mac only', () => {
  const { container } = render(
    <>
      <Hero latest={latest} />
      <DownloadMac latest={latest} />
    </>,
  )
  const text = container.textContent ?? ''
  expect(text).not.toMatch(
    /Linux|for Windows(?! games)|Windows ·|· Windows|\.exe|AppImage/,
  )
  expect(screen.getByRole('list', { name: 'Plays games from' })).toHaveTextContent(
    /Steam.*Xbox Cloud Gaming.*Mac games.*Epic Games.*Soon/,
  )
  const downloads = screen.getAllByRole('link', { name: /Download for Mac/ })
  expect(downloads).toHaveLength(2)
  for (const link of downloads) expect(link.getAttribute('href')).toMatch(/aarch64\.dmg$/)
})
