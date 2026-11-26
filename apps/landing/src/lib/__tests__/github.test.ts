import { afterEach, describe, expect, it, vi } from 'vitest'
import { githubRelease } from './fixtures'
import { fetchLatestRelease, fetchReleaseComparison } from '../github'

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

describe('fetchReleaseComparison', () => {
  it('lists the commits between two tags, without merges, with pull requests and diff size', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        commits: [
          { sha: 'aaaaaaaaaa', commit: { message: 'feat(landing): blog (#11)' } },
          { sha: 'bbbbbbbbbb', commit: { message: 'Merge pull request #10 from org/x' } },
          { sha: 'cccccccccc', commit: { message: 'fix: focus rings' } },
        ],
        files: [
          { additions: 10, deletions: 2 },
          { additions: 5, deletions: 1 },
        ],
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const comparison = await fetchReleaseComparison('v2.2.0', 'v2.4.0')

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/compare/v2.2.0...v2.4.0'),
      expect.anything(),
    )
    expect(comparison).toMatchObject({
      url: 'https://github.com/LFSCamargo/orbit/compare/v2.2.0...v2.4.0',
      pullRequests: [11, 10],
      filesChanged: 2,
      additions: 15,
      deletions: 3,
    })
    expect(comparison?.commits.map((commit) => commit.shortSha)).toEqual([
      'ccccccc',
      'aaaaaaa',
    ])
    expect(comparison?.commits[1].url).toBe(
      'https://github.com/LFSCamargo/orbit/commit/aaaaaaaaaa',
    )
  })

  it('refuses anything but version tags and survives GitHub being down', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('offline'))
    vi.stubGlobal('fetch', fetchMock)
    expect(await fetchReleaseComparison('main', 'v2.4.0')).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(await fetchReleaseComparison('v2.2.0', 'v2.4.0')).toBeNull()
  })
})
