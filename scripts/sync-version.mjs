#!/usr/bin/env node
/**
 * Sync version across package.json, tauri.conf.json, and Cargo.toml.
 * Usage: node scripts/sync-version.mjs 0.1.0
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const version = process.argv[2]
if (!version || !/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(version)) {
  console.error('Usage: node scripts/sync-version.mjs <semver>')
  console.error('Example: node scripts/sync-version.mjs 0.1.0')
  process.exit(1)
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

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
  console.error('Could not find version field in src-tauri/Cargo.toml')
  process.exit(1)
}
const updatedCargo = cargo.replace(/^version = "[^"]+"/m, `version = "${version}"`)
writeFileSync(cargoPath, updatedCargo)

console.log(`Synced version to ${version}`)
