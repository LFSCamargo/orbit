#!/usr/bin/env node
/**
 * Writes latest.json (Tauri updater manifest) for a signed Orbit build.
 * Usage: node scripts/updater-manifest.mjs --version 2.6.1 --arch aarch64 \
 *   --archive release/2.6.1/Orbit-2.6.1-aarch64.app.tar.gz \
 *   --notes-file .github/release-notes/2.6.1.md --out release/2.6.1/latest.json
 * The signature is read from <archive>.sig. With --config (tauri.conf.json) the
 * archive is first verified against the updater pubkey installed Orbits trust.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { basename } from 'node:path'
import { parseArgs } from 'node:util'
import { updaterManifest, verifyUpdaterSignature } from './lib/updater.mjs'

const { values } = parseArgs({
  options: {
    version: { type: 'string' },
    arch: { type: 'string' },
    archive: { type: 'string' },
    'notes-file': { type: 'string' },
    out: { type: 'string' },
    config: { type: 'string' },
  },
})

try {
  for (const name of ['version', 'arch', 'archive', 'out']) {
    if (!values[name]) throw new Error(`--${name} is required`)
  }
  const signature = readFileSync(`${values.archive}.sig`, 'utf8')
  if (values.config) {
    const pubkey = JSON.parse(readFileSync(values.config, 'utf8')).plugins?.updater
      ?.pubkey
    if (!pubkey) throw new Error(`${values.config} has no updater pubkey`)
    const data = readFileSync(values.archive)
    if (!verifyUpdaterSignature({ data, signature, pubkey })) {
      throw new Error(
        'The archive is not signed by the key in tauri.conf.json; installed Orbits would reject it',
      )
    }
    console.log('    signature verified against tauri.conf.json')
  }
  const manifest = updaterManifest({
    version: values.version,
    arch: values.arch,
    archive: basename(values.archive),
    signature,
    notes: values['notes-file'] ? readFileSync(values['notes-file'], 'utf8') : '',
    pubDate: new Date().toISOString(),
  })
  writeFileSync(values.out, `${JSON.stringify(manifest, null, 2)}\n`)
  console.log(`    ${values.out}`)
} catch (error) {
  console.error(`error: ${error.message}`)
  process.exit(1)
}
