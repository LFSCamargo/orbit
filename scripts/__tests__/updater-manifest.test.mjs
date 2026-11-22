import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { buildManifest } from '../updater-manifest.mjs'

test('latest.json points at this release download and carries the signature', () => {
  const manifest = buildManifest({
    version: '2.2.0',
    signature: 'dW50cnVzdGVkIGNvbW1lbnQ=\n',
    archiveName: 'Orbit-2.2.0-aarch64.app.tar.gz',
    notes: 'Faster controller navigation.',
    pubDate: '2026-11-21T12:00:00.000Z',
  })
  assert.deepEqual(manifest, {
    version: '2.2.0',
    notes: 'Faster controller navigation.',
    pub_date: '2026-11-21T12:00:00.000Z',
    platforms: {
      'darwin-aarch64': {
        signature: 'dW50cnVzdGVkIGNvbW1lbnQ=',
        url: 'https://github.com/LFSCamargo/orbit/releases/download/v2.2.0/Orbit-2.2.0-aarch64.app.tar.gz',
      },
    },
  })
})

test('a bad version, archive name or empty signature is refused', () => {
  const base = {
    version: '2.2.0',
    signature: 'sig',
    archiveName: 'Orbit-2.2.0-aarch64.app.tar.gz',
    pubDate: '2026-11-21T12:00:00.000Z',
  }
  assert.throws(() => buildManifest({ ...base, version: 'v2.2' }))
  assert.throws(() => buildManifest({ ...base, archiveName: '../evil.app.tar.gz' }))
  assert.throws(() => buildManifest({ ...base, archiveName: 'Orbit.dmg' }))
  assert.throws(() => buildManifest({ ...base, signature: ' ' }))
})

test('the CLI writes latest.json and falls back to default notes', () => {
  const dir = mkdtempSync(join(tmpdir(), 'orbit-manifest-'))
  const sig = join(dir, 'Orbit-2.2.0-aarch64.app.tar.gz.sig')
  writeFileSync(sig, 'c2lnbmF0dXJl')
  const out = join(dir, 'latest.json')
  execFileSync(process.execPath, [
    'scripts/updater-manifest.mjs',
    '--version',
    '2.2.0',
    '--sig',
    sig,
    '--archive',
    'Orbit-2.2.0-aarch64.app.tar.gz',
    '--notes',
    join(dir, 'missing.md'),
    '--out',
    out,
  ])
  const written = JSON.parse(readFileSync(out, 'utf8'))
  assert.equal(written.platforms['darwin-aarch64'].signature, 'c2lnbmF0dXJl')
  assert.match(written.notes, /Orbit 2\.2\.0/)
})
