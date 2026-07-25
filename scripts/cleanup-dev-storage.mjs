#!/usr/bin/env node
/**
 * Report and reclaim dev storage used by Orbit (Rust target, build artifacts, test output).
 * Usage:
 *   node scripts/cleanup-dev-storage.mjs          # report only
 *   node scripts/cleanup-dev-storage.mjs --clean    # safe project cleanup
 *   node scripts/cleanup-dev-storage.mjs --deep     # + yarn cache + cargo cache prune
 */

import { execSync } from 'node:child_process'
import { existsSync, readdirSync, rmSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, relative } from 'node:path'

const root = join(import.meta.dirname, '..')
const args = new Set(process.argv.slice(2))
const clean = args.has('--clean') || args.has('--deep')
const deep = args.has('--deep')

function dirSize(path) {
  if (!existsSync(path)) return 0
  let total = 0
  const stack = [path]
  while (stack.length) {
    const current = stack.pop()
    let entries
    try {
      entries = readdirSync(current, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      const full = join(current, entry.name)
      try {
        if (entry.isDirectory()) stack.push(full)
        else if (entry.isFile()) total += statSync(full).size
      } catch {
        /* skip unreadable */
      }
    }
  }
  return total
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const value = bytes / 1024 ** index
  return `${value.toFixed(index === 0 ? 0 : 1)} ${units[index]}`
}

function rel(path) {
  return relative(root, path) || '.'
}

function run(cmd, cwd = root) {
  execSync(cmd, { cwd, stdio: 'inherit' })
}

const projectPaths = [
  join(root, 'src-tauri/target'),
  join(root, 'node_modules'),
  join(root, 'dist'),
  join(root, 'test-results'),
  join(root, 'playwright-report'),
  join(root, 'release'),
  join(root, 'playwright/.cache'),
]

const appSupport = join(homedir(), 'Library/Application Support/Orbit')
const appSupportPaths = [
  join(appSupport, 'orbit.sqlite3'),
  join(appSupport, 'orbit.sqlite3-wal'),
  join(appSupport, 'orbit.sqlite3-shm'),
  join(appSupport, 'orbit.db'),
]

const globalPaths = [
  join(homedir(), '.cargo/registry'),
  join(homedir(), '.cargo/git'),
  join(homedir(), 'Library/Caches/Yarn'),
  join(homedir(), 'Library/Caches/ms-playwright'),
]

console.log('Orbit dev storage report\n')

let projectTotal = 0
console.log('Project (repo):')
for (const path of projectPaths) {
  const size = dirSize(path)
  projectTotal += size
  if (size > 0) console.log(`  ${formatBytes(size).padStart(8)}  ${rel(path)}`)
}
console.log(`  ${formatBytes(projectTotal).padStart(8)}  total tracked\n`)

console.log('App data (~/Library/Application Support/Orbit):')
let appTotal = 0
for (const path of appSupportPaths) {
  if (!existsSync(path)) continue
  const size = statSync(path).size
  appTotal += size
  console.log(`  ${formatBytes(size).padStart(8)}  ${path.replace(homedir(), '~')}`)
}
console.log(`  ${formatBytes(appTotal).padStart(8)}  total\n`)

console.log('Global dev caches (optional --deep cleanup):')
for (const path of globalPaths) {
  const size = dirSize(path)
  if (size > 0)
    console.log(`  ${formatBytes(size).padStart(8)}  ${path.replace(homedir(), '~')}`)
}

if (!clean) {
  console.log('\nRun `yarn clean` to remove Rust target + build/test artifacts.')
  console.log('Run `yarn clean:deep` to also prune global yarn/cargo caches.')
  process.exit(0)
}

console.log('\nCleaning project artifacts…')

const targetDir = join(root, 'src-tauri/target')
if (existsSync(join(root, 'src-tauri/Cargo.toml'))) {
  try {
    run('cargo clean --manifest-path src-tauri/Cargo.toml')
  } catch {
    console.warn('  cargo clean failed (continuing with directory removal)')
  }
}
if (existsSync(targetDir)) {
  rmSync(targetDir, { recursive: true, force: true })
  console.log(`  removed ${rel(targetDir)}`)
}

for (const path of projectPaths) {
  if (path.endsWith('target') || path.endsWith('node_modules')) continue
  if (existsSync(path)) {
    rmSync(path, { recursive: true, force: true })
    console.log(`  removed ${rel(path)}`)
  }
}

if (deep) {
  console.log('\nDeep cleanup (global caches)…')
  try {
    run('yarn cache clean')
  } catch {
    console.warn('  yarn cache clean failed (continuing)')
  }
  try {
    run('cargo cache -a')
  } catch {
    console.warn('  cargo cache not installed — skip or: cargo install cargo-cache')
  }
}

console.log(
  '\nDone. Next `yarn tauri:dev` / `yarn tauri:build` will do a full Rust rebuild.',
)
