import { afterEach, describe, expect, it, vi } from 'vitest'
import { githubRelease } from './fixtures'
import { fetchLatestRelease } from '../github'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('fetchLatestRelease', () => {
  it('returns the newest stable release from the shared GitHub payload', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        githubRelease('2.1.0'),
        githubRelease('2.3.0-rc.1', { prerelease: true }),
        githubRelease('2.2.0'),
      ],
    })
    vi.stubGlobal('fetch', fetchMock)

    const latest = await fetchLatestRelease()

    expect(latest?.version).toBe('2.2.0')
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/releases?per_page=100'),
      expect.objectContaining({
        next: { revalidate: 120 },
      }),
    )
  })

  it('returns undefined when GitHub is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))

    expect(await fetchLatestRelease()).toBeUndefined()
  })
})
