#!/usr/bin/env node
// Writes the `latest.json` Orbit's updater reads from the newest GitHub
// release (tauri-plugin-updater's static manifest). The archive's minisign
// signature comes from the `.sig` Tauri writes beside the signed
// `.app.tar.gz`; the URL is this repository's release download path.
//
//   node scripts/updater-manifest.mjs --version 2.2.0 --sig <file.sig> \
//     --archive Orbit-2.2.0-aarch64.app.tar.gz [--notes notes.md] --out latest.json
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { DEFAULT_GITHUB_REPO, parseSemver } from './lib/release.mjs'

const ARCHIVE_RE = /^Orbit-[\w.+-]+-aarch64\.app\.tar\.gz$/

export function buildManifest({
  version,
  signature,
  archiveName,
  notes,
  pubDate,
  repo = DEFAULT_GITHUB_REPO,
}) {
  if (!parseSemver(version)) throw new Error(`Invalid version: ${version}`)
  if (!ARCHIVE_RE.test(archiveName))
    throw new Error(`Invalid archive name: ${archiveName}`)
  const trimmed = String(signature ?? '').trim()
  if (!trimmed) throw new Error('The update signature is empty')
  return {
    version,
    notes: notes?.trim() || `Orbit ${version}`,
    pub_date: pubDate,
    platforms: {
      'darwin-aarch64': {
        signature: trimmed,
        url: `https://github.com/${repo}/releases/download/v${version}/${archiveName}`,
      },
    },
  }
}

function argument(args, name) {
  const index = args.indexOf(`--${name}`)
  return index >= 0 ? args[index + 1] : undefined
}

function main(args) {
  const version = argument(args, 'version')
  const sig = argument(args, 'sig')
  const archiveName = argument(args, 'archive')
  const out = argument(args, 'out')
  const notesPath = argument(args, 'notes')
  if (!version || !sig || !archiveName || !out) {
    throw new Error(
      'Usage: updater-manifest.mjs --version <v> --sig <file> --archive <name> --out <file> [--notes <file>]',
    )
  }
  const notes =
    notesPath && existsSync(notesPath) ? readFileSync(notesPath, 'utf8') : undefined
  const manifest = buildManifest({
    version,
    signature: readFileSync(sig, 'utf8'),
    archiveName,
    notes,
    pubDate: new Date().toISOString(),
  })
  writeFileSync(out, `${JSON.stringify(manifest, null, 2)}\n`)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    main(process.argv.slice(2))
  } catch (error) {
    console.error(`error: ${error.message}`)
    process.exit(1)
  }
}
