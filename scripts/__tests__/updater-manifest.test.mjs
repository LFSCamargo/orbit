import { test } from 'node:test'
import assert from 'node:assert/strict'
import { inAppNotes, releaseAssetUrl, updaterManifest } from '../lib/updater.mjs'

const base = {
  version: '2.6.1',
  notes: '  Orbit **2.6.1**\n\n- Updates from inside Orbit  \n',
  pubDate: '2026-11-28T12:00:00.123Z',
  arch: 'aarch64',
  archive: 'Orbit-2.6.1-aarch64.app.tar.gz',
  signature: 'dW50cnVzdGVkIGNvbW1lbnQ=\n',
}

test('a manifest points the Mac kind at the signed archive of the release', () => {
  assert.deepEqual(updaterManifest(base), {
    version: '2.6.1',
    notes: 'Orbit **2.6.1**\n\n- Updates from inside Orbit',
    pub_date: '2026-11-28T12:00:00Z',
    platforms: {
      'darwin-aarch64': {
        signature: 'dW50cnVzdGVkIGNvbW1lbnQ=',
        url: 'https://github.com/LFSCamargo/orbit/releases/download/v2.6.1/Orbit-2.6.1-aarch64.app.tar.gz',
      },
    },
  })
})

test('a universal build serves Apple silicon and Intel Macs', () => {
  const manifest = updaterManifest({
    ...base,
    arch: 'universal',
    archive: 'Orbit-2.6.1-universal.app.tar.gz',
  })
  assert.deepEqual(Object.keys(manifest.platforms), ['darwin-aarch64', 'darwin-x86_64'])
})

test('an unsigned or malformed release is refused', () => {
  assert.throws(() => updaterManifest({ ...base, signature: '  ' }), /signature is empty/)
  assert.throws(() => updaterManifest({ ...base, arch: 'arm' }), /Unknown architecture/)
  assert.throws(() => updaterManifest({ ...base, version: 'v2.6.1' }), /Invalid version/)
  assert.throws(() => updaterManifest({ ...base, pubDate: 'soon' }), /Invalid date/)
  assert.throws(() => releaseAssetUrl('2.6.1', '../evil.tar.gz'), /Invalid asset name/)
})

test('the in-app notes leave out what only fits the release page', () => {
  const notes = [
    'Orbit **2.6.1** — Updates from inside Orbit',
    '',
    '## Highlights',
    '',
    '- Update from inside Orbit.',
    '',
    '## Install or update',
    '',
    '1. Download the DMG.',
    '',
    '## Full changelog',
    '',
    '[CHANGELOG.md](https://example.com)',
  ].join('\n')
  assert.equal(
    inAppNotes(notes),
    'Orbit **2.6.1** — Updates from inside Orbit\n\n## Highlights\n\n- Update from inside Orbit.',
  )
  assert.equal(inAppNotes('Just notes'), 'Just notes')
  assert.equal(updaterManifest({ ...base, notes }).notes, inAppNotes(notes))
})
