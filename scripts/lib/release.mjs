import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export const SEMVER_RE = /^(\d+)\.(\d+)\.(\d+)(?:-([\w.+-]+))?$/

export const DEFAULT_GITHUB_REPO = 'LFSCamargo/orbit'

export function parseSemver(version) {
  const match = version.match(SEMVER_RE)
  if (!match) return null
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] ?? null,
    raw: version,
  }
}

export function formatSemver({ major, minor, patch, prerelease }) {
  return prerelease ? `${major}.${minor}.${patch}-${prerelease}` : `${major}.${minor}.${patch}`
}

export function bumpSemver(current, kind) {
  const parsed = parseSemver(current)
  if (!parsed) throw new Error(`Invalid semver: ${current}`)

  if (kind === 'patch') {
    return formatSemver({ ...parsed, patch: parsed.patch + 1, prerelease: null })
  }
  if (kind === 'minor') {
    return formatSemver({ major: parsed.major, minor: parsed.minor + 1, patch: 0, prerelease: null })
  }
  if (kind === 'major') {
    return formatSemver({ major: parsed.major + 1, minor: 0, patch: 0, prerelease: null })
  }

  if (!parseSemver(kind)) {
    throw new Error(`Unknown bump kind: ${kind}`)
  }
  return kind
}

export function readVersion(root) {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  return pkg.version
}

export function syncVersion(root, version) {
  if (!parseSemver(version)) {
    throw new Error(`Invalid semver: ${version}`)
  }

  const pkgPath = join(root, 'package.json')
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
  pkg.version = version
  writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`)

  const tauriPath = join(root, 'src-tauri/tauri.conf.json')
  const tauri = JSON.parse(readFileSync(tauriPath, 'utf8'))
  tauri.version = version
  writeFileSync(tauriPath, `${JSON.stringify(tauri, null, 2)}\n`)

  const cargoPath = join(root, 'src-tauri/Cargo.toml')
  const cargo = readFileSync(cargoPath, 'utf8')
  if (!/^version = "[^"]+"/m.test(cargo)) {
    throw new Error('Could not find version field in src-tauri/Cargo.toml')
  }
  writeFileSync(cargoPath, cargo.replace(/^version = "[^"]+"/m, `version = "${version}"`))

  return version
}

export function todayIso() {
  return new Date().toISOString().slice(0, 10)
}

export function changelogEntry(version, date, summary, githubRepo = DEFAULT_GITHUB_REPO) {
  return `## [${version}] - ${date}

${summary}

### Added

-

### Changed

-

### Fixed

-

[${version}]: https://github.com/${githubRepo}/releases/tag/v${version}
`
}

export function releaseNotesEntry(version, summary, githubRepo = DEFAULT_GITHUB_REPO) {
  return `Orbit **${version}** — ${summary}

## Highlights

-

## What's included

### Added

-

### Changed

-

### Fixed

-

## Install

**Requirements:** macOS 12+, Apple Silicon (CI publishes \`aarch64\` builds).

1. Download **\`Orbit-${version}-aarch64.dmg\`** below
2. Open the DMG and drag **Orbit** to Applications
3. Launch from Applications — grant permissions if macOS prompts for file access

Verify downloads with \`SHA256SUMS.txt\`.

## Build from source

\`\`\`bash
git clone https://github.com/${githubRepo}.git
cd orbit
yarn install
yarn tauri:dev
yarn release:macos
\`\`\`

See [RUNNING.md](https://github.com/${githubRepo}/blob/main/RUNNING.md) and [docs/THEMES.md](https://github.com/${githubRepo}/blob/main/docs/THEMES.md).

## Full changelog

[CHANGELOG.md](https://github.com/${githubRepo}/blob/main/CHANGELOG.md)
`
}

export function insertChangelogEntry(root, entry, version) {
  const changelogPath = join(root, 'CHANGELOG.md')
  if (!existsSync(changelogPath)) {
    writeFileSync(
      changelogPath,
      `# Changelog

All notable changes to Orbit are documented in this file.

Release notes for GitHub Releases live in [\`.github/release-notes/\`](.github/release-notes/).

${entry}`,
    )
    return changelogPath
  }

  const content = readFileSync(changelogPath, 'utf8')
  const marker = `## [${version}]`
  if (content.includes(marker)) {
    throw new Error(`CHANGELOG.md already contains a section for ${version}`)
  }

  const lines = content.split('\n')
  const firstReleaseIdx = lines.findIndex((line) => /^## \[\d]/.test(line))
  const insertAt = firstReleaseIdx === -1 ? lines.length : firstReleaseIdx
  const updated = [...lines.slice(0, insertAt), entry.trimEnd(), '', ...lines.slice(insertAt)].join('\n')
  writeFileSync(changelogPath, updated.endsWith('\n') ? updated : `${updated}\n`)
  return changelogPath
}

export function writeReleaseNotes(root, version, entry) {
  const notesDir = join(root, '.github/release-notes')
  mkdirSync(notesDir, { recursive: true })
  const notesPath = join(notesDir, `${version}.md`)
  if (existsSync(notesPath)) {
    throw new Error(`Release notes already exist: ${notesPath}`)
  }
  writeFileSync(notesPath, entry.endsWith('\n') ? entry : `${entry}\n`)
  return notesPath
}
