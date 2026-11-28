#!/usr/bin/env node
/**
 * Fails when a macOS binary links a library outside macOS (Homebrew, a
 * toolchain), which the Macs Orbit runs on do not have.
 * Usage: node scripts/check-linkage.mjs <binary>
 */
import { execFileSync } from 'node:child_process'
import { foreignLibraries } from './lib/linkage.mjs'

const binary = process.argv[2]
if (!binary) {
  console.error('Usage: node scripts/check-linkage.mjs <binary>')
  process.exit(1)
}
const foreign = foreignLibraries(
  execFileSync('otool', ['-L', binary], { encoding: 'utf8' }),
)
if (foreign.length) {
  console.error(`error: ${binary} links libraries a user's Mac does not have:`)
  for (const library of foreign) console.error(`    ${library}`)
  process.exit(1)
}
console.log('    links only macOS libraries')
