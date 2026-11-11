import { parseReleases, type Release } from './releases'
import { GITHUB_REPO } from './site'

export const RELEASES_REVALIDATE_SECONDS = 600

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
