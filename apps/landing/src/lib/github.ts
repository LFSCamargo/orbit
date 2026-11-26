import { isMergeCommit, parseCommitMessage, type ReleaseCommit } from './commits'
import { latestStable, parseReleases, type Release } from './releases'
import { GITHUB_REPO, GITHUB_URL } from './site'

const RELEASES_REVALIDATE_SECONDS = 120

const RELEASES_API = `https://api.github.com/repos/${GITHUB_REPO}/releases?per_page=100`

function requestHeaders(): HeadersInit {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  }
  const token = process.env.GITHUB_TOKEN
  if (token) headers.Authorization = `Bearer ${token}`
  return headers
}

/** Single cached request per revalidation window; `null` when GitHub is unreachable. */
export async function fetchReleases(): Promise<Release[] | null> {
  try {
    const response = await fetch(RELEASES_API, {
      headers: requestHeaders(),
      next: { revalidate: RELEASES_REVALIDATE_SECONDS },
    })
    if (!response.ok) return null
    return parseReleases(await response.json())
  } catch {
    return null
  }
}

export interface ReleaseComparison {
  /** GitHub's diff view between the two tags. */
  url: string
  commits: ReleaseCommit[]
  /** Pull requests merged into the release, from merge commits and squash titles. */
  pullRequests: number[]
  filesChanged: number
  additions: number
  deletions: number
}

const COMPARE_REVALIDATE_SECONDS = 3600

interface CompareCommitPayload {
  sha?: unknown
  html_url?: unknown
  commit?: { message?: unknown }
}

interface ComparePayload {
  html_url?: unknown
  commits?: CompareCommitPayload[]
  files?: { additions?: unknown; deletions?: unknown }[]
}

const SAFE_TAG = /^v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/

/** Commits and diff size between two release tags; `null` when a tag is
 * missing or GitHub is unreachable. Only GitHub URLs are kept. */
export async function fetchReleaseComparison(
  fromTag: string,
  toTag: string,
): Promise<ReleaseComparison | null> {
  if (!SAFE_TAG.test(fromTag) || !SAFE_TAG.test(toTag)) return null
  try {
    const response = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/compare/${fromTag}...${toTag}`,
      { headers: requestHeaders(), next: { revalidate: COMPARE_REVALIDATE_SECONDS } },
    )
    if (!response.ok) return null
    const payload = (await response.json()) as ComparePayload
    const commits: ReleaseCommit[] = []
    const pullRequests = new Set<number>()
    for (const item of payload.commits ?? []) {
      const message = typeof item.commit?.message === 'string' ? item.commit.message : ''
      const sha = typeof item.sha === 'string' ? item.sha : ''
      if (!sha || !message) continue
      const parsed = parseCommitMessage(message)
      if (parsed.pr) pullRequests.add(parsed.pr)
      if (isMergeCommit(message)) continue
      commits.push({
        ...parsed,
        sha,
        shortSha: sha.slice(0, 7),
        url: `${GITHUB_URL}/commit/${sha}`,
      })
    }
    const files = payload.files ?? []
    const sum = (key: 'additions' | 'deletions') =>
      files.reduce(
        (total, file) => total + (typeof file[key] === 'number' ? file[key] : 0),
        0,
      )
    return {
      url: `${GITHUB_URL}/compare/${fromTag}...${toTag}`,
      commits: commits.reverse(),
      pullRequests: [...pullRequests].sort((a, b) => b - a),
      filesChanged: files.length,
      additions: sum('additions'),
      deletions: sum('deletions'),
    }
  } catch {
    return null
  }
}

/** Shared source of truth for the newest stable release across landing routes. */
export async function fetchLatestRelease(): Promise<Release | undefined> {
  const releases = await fetchReleases()
  return releases ? latestStable(releases) : undefined
}
