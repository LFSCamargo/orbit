#!/usr/bin/env node
/**
 * Sync version across package.json, tauri.conf.json, and Cargo.toml.
 * Usage: node scripts/sync-version.mjs 0.1.0
 */
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { syncVersion } from './lib/release.mjs'

const version = process.argv[2]
if (!version) {
  console.error('Usage: node scripts/sync-version.mjs <semver>')
  console.error('Example: node scripts/sync-version.mjs 0.1.0')
  process.exit(1)
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

try {
  syncVersion(root, version)
  console.log(`Synced version to ${version}`)
} catch (error) {
  console.error(`error: ${error.message}`)
  process.exit(1)
}
