import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { verifyUpdaterSignature } from '../lib/updater.mjs'

const fixture = JSON.parse(
  readFileSync(new URL('./fixtures/updater-signature.json', import.meta.url), 'utf8'),
)
const data = Buffer.from(fixture.data)

test('a Tauri updater signature verifies against the key that made it', () => {
  assert.equal(
    verifyUpdaterSignature({
      data,
      signature: fixture.signature,
      pubkey: fixture.pubkey,
    }),
    true,
  )
})

test('another key, changed bytes or a changed trusted comment fail', () => {
  // Regression guard: a release signed with a key other than the one in
  // tauri.conf.json is rejected by every installed Orbit.
  assert.equal(
    verifyUpdaterSignature({
      data,
      signature: fixture.signature,
      pubkey: fixture.otherPubkey,
    }),
    false,
  )
  assert.equal(
    verifyUpdaterSignature({
      data: Buffer.from(`${fixture.data}!`),
      signature: fixture.signature,
      pubkey: fixture.pubkey,
    }),
    false,
  )
  const lines = Buffer.from(fixture.signature, 'base64').toString('utf8').split('\n')
  lines[2] = lines[2].replace('data.txt', 'evil.txt')
  assert.equal(
    verifyUpdaterSignature({
      data,
      signature: Buffer.from(lines.join('\n')).toString('base64'),
      pubkey: fixture.pubkey,
    }),
    false,
  )
})

test('an empty or malformed key or signature fails instead of throwing', () => {
  assert.equal(
    verifyUpdaterSignature({ data, signature: '', pubkey: fixture.pubkey }),
    false,
  )
  assert.equal(
    verifyUpdaterSignature({ data, signature: fixture.signature, pubkey: '' }),
    false,
  )
  assert.equal(
    verifyUpdaterSignature({ data, signature: 'bm90IGEgc2ln', pubkey: fixture.pubkey }),
    false,
  )
})
