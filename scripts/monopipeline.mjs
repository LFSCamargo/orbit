#!/usr/bin/env node
/**
 * Orbit release pipeline — bump versions and scaffold CHANGELOG + GitHub release notes.
 *
 * Usage:
 *   node scripts/monopipeline.mjs bump <patch|minor|major|version>
 *   node scripts/monopipeline.mjs release <patch|minor|major|version> [options]
 */
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  bumpSemver,
  changelogEntry,
  DEFAULT_GITHUB_REPO,
  insertChangelogEntry,
  readVersion,
  releaseNotesEntry,
  syncVersion,
  todayIso,
  writeReleaseNotes,
} from './lib/release.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

function usage(exitCode = 1) {
  console.log(`Usage:
  yarn monopipeline bump <patch|minor|major|version>
  yarn monopipeline release <patch|minor|major|version> [options]

Commands:
  bump      Sync version across package.json, tauri.conf.json, and Cargo.toml
  release   Bump version, add CHANGELOG.md section, and create .github/release-notes/<version>.md

Options (release):
  --date <YYYY-MM-DD>     Release date (default: today)
  --summary <text>        Release summary line (default: "Orbit <version>")
  --repo <owner/name>     GitHub repo for links (default: ${DEFAULT_GITHUB_REPO})
  --skip-changelog        Do not modify CHANGELOG.md
  --skip-notes            Do not create .github/release-notes/<version>.md
  --dry-run               Print planned changes without writing files

Examples:
  yarn monopipeline bump patch
  yarn monopipeline release minor --summary "Theme polish and importer fixes"
  yarn monopipeline release 0.2.0 --date 2026-08-01
`)
  process.exit(exitCode)
}

function parseArgs(argv) {
  const positional = []
  const options = {
    date: todayIso(),
    summary: '',
    repo: DEFAULT_GITHUB_REPO,
    skipChangelog: false,
    skipNotes: false,
    dryRun: false,
  }

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--date') {
      options.date = argv[++i]
      continue
    }
    if (arg === '--summary') {
      options.summary = argv[++i] ?? ''
      continue
    }
    if (arg === '--repo') {
      options.repo = argv[++i] ?? DEFAULT_GITHUB_REPO
      continue
    }
    if (arg === '--skip-changelog') {
      options.skipChangelog = true
      continue
    }
    if (arg === '--skip-notes') {
      options.skipNotes = true
      continue
    }
    if (arg === '--dry-run') {
      options.dryRun = true
      continue
    }
    if (arg === '-h' || arg === '--help') {
      usage(0)
    }
    positional.push(arg)
  }

  return { positional, options }
}

function resolveVersion(current, target) {
  if (!target) {
    throw new Error('Missing version or bump kind (patch, minor, major, or x.y.z)')
  }
  if (target === current) {
    return current
  }
  return bumpSemver(current, target)
}

function runBump(target, options) {
  const current = readVersion(root)
  const next = resolveVersion(current, target)

  if (options.dryRun) {
    console.log(`Would bump ${current} -> ${next}`)
    return next
  }

  syncVersion(root, next)
  console.log(`Bumped ${current} -> ${next}`)
  return next
}

function runRelease(target, options) {
  const current = readVersion(root)
  const next = resolveVersion(current, target)
  const summary = options.summary || `Orbit ${next}`

  if (options.dryRun) {
    console.log(`Would release ${current} -> ${next}`)
    console.log(`Date: ${options.date}`)
    console.log(`Summary: ${summary}`)
    if (!options.skipChangelog) console.log('Would update CHANGELOG.md')
    if (!options.skipNotes) console.log(`Would create .github/release-notes/${next}.md`)
    return next
  }

  if (next !== current) {
    syncVersion(root, next)
    console.log(`Bumped ${current} -> ${next}`)
  } else {
    console.log(`Keeping version ${next}`)
  }

  if (!options.skipChangelog) {
    const path = insertChangelogEntry(
      root,
      changelogEntry(next, options.date, summary, options.repo),
      next,
    )
    console.log(`Updated ${path}`)
  }

  if (!options.skipNotes) {
    const path = writeReleaseNotes(
      root,
      next,
      releaseNotesEntry(next, summary, options.repo),
    )
    console.log(`Created ${path}`)
  }

  console.log('\nNext steps:')
  console.log(`  1. Edit CHANGELOG.md and .github/release-notes/${next}.md`)
  console.log('  2. Commit the release prep')
  console.log(`  3. git tag v${next} && git push origin v${next}`)

  return next
}

const { positional, options } = parseArgs(process.argv.slice(2))
const [command, target] = positional

if (!command) usage()

try {
  if (command === 'bump') {
    runBump(target, options)
  } else if (command === 'release') {
    runRelease(target, options)
  } else {
    usage()
  }
} catch (error) {
  console.error(`error: ${error.message}`)
  process.exit(1)
}
