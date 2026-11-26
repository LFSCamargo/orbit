import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import {
  isVersion,
  parseChangelog,
  parseReleaseNotes,
  type ChangelogRelease,
  type ReleaseNotes,
} from './changelog'

/** The repository root holds CHANGELOG.md; the landing app builds from
 * apps/landing, so look a few folders up from the working directory. */
async function readFromRepo(relative: string): Promise<string | null> {
  let dir = process.cwd()
  for (let depth = 0; depth < 4; depth += 1) {
    try {
      // The files are listed in next.config.ts outputFileTracingIncludes.
      return await readFile(
        /*turbopackIgnore: true*/ join(/*turbopackIgnore: true*/ dir, relative),
        'utf8',
      )
    } catch {
      const parent = dirname(dir)
      if (parent === dir) break
      dir = parent
    }
  }
  return null
}

let changelog: Promise<ChangelogRelease[]> | null = null

/** Every release in CHANGELOG.md, newest first; empty when it cannot be read. */
export function getChangelog(): Promise<ChangelogRelease[]> {
  changelog ??= readFromRepo('CHANGELOG.md').then((text) =>
    text ? parseChangelog(text) : [],
  )
  return changelog
}

/** The GitHub release notes written for a version, when there are any. */
export async function getReleaseNotes(version: string): Promise<ReleaseNotes | null> {
  if (!isVersion(version)) return null
  const text = await readFromRepo(join('.github', 'release-notes', `${version}.md`))
  return text ? parseReleaseNotes(text) : null
}
