/**
 * Tauri updater manifest (latest.json) for an Orbit release. Orbit reads it
 * from https://github.com/<repo>/releases/latest/download/latest.json, so it
 * is attached to the release marked latest; Orbit Wine releases are never
 * marked latest.
 */
import { createHash, createPublicKey, verify } from 'node:crypto'

const REPOSITORY = 'LFSCamargo/orbit'

const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/
const ARCHES = {
  aarch64: ['darwin-aarch64'],
  x86_64: ['darwin-x86_64'],
  universal: ['darwin-aarch64', 'darwin-x86_64'],
}

/** The download URL of one asset of release `v<version>`. */
export function releaseAssetUrl(version, file, repository = REPOSITORY) {
  if (!SEMVER.test(version)) throw new Error(`Invalid version: ${version}`)
  if (!/^[\w.-]+$/.test(file)) throw new Error(`Invalid asset name: ${file}`)
  return `https://github.com/${repository}/releases/download/v${version}/${file}`
}

// Sections of a GitHub release note that only make sense on the release page.
const PAGE_ONLY = /^##\s+(install|build from source|full changelog)\b/im

/** Release notes for the in-app update dialog: everything before the
 * install, build and changelog sections, which only fit the release page. */
export function inAppNotes(markdown) {
  const text = String(markdown ?? '')
  const match = PAGE_ONLY.exec(text)
  return (match ? text.slice(0, match.index) : text).trim()
}

/**
 * The manifest for one signed `.app.tar.gz`. `arch` is the build's label
 * (aarch64, x86_64 or universal); a universal build serves both Mac kinds.
 */
export function updaterManifest({ version, notes, pubDate, arch, archive, signature }) {
  const platforms = ARCHES[arch]
  if (!platforms) throw new Error(`Unknown architecture: ${arch}`)
  const sig = String(signature ?? '').trim()
  if (!sig) throw new Error('The updater signature is empty; was the build signed?')
  const date = new Date(pubDate)
  if (Number.isNaN(date.getTime())) throw new Error(`Invalid date: ${pubDate}`)
  const url = releaseAssetUrl(version, archive)
  return {
    version,
    notes: inAppNotes(notes),
    pub_date: date.toISOString().replace(/\.\d{3}Z$/, 'Z'),
    platforms: Object.fromEntries(
      platforms.map((platform) => [platform, { signature: sig, url }]),
    ),
  }
}

/** The non-comment lines of a base64-encoded minisign file. */
function minisignLines(base64) {
  return Buffer.from(String(base64 ?? '').trim(), 'base64')
    .toString('utf8')
    .split('\n')
    .map((line) => line.trim())
}

// DER prefix of an Ed25519 public key (SubjectPublicKeyInfo).
const ED25519_SPKI = Buffer.from('302a300506032b6570032100', 'hex')

/**
 * Whether `signature` (a Tauri `.sig`: base64 of a minisign signature) signs
 * `data` with `pubkey` (tauri.conf.json's updater pubkey: base64 of a
 * minisign public key), as installed Orbits check it: the key ids match, the
 * Ed25519 signature of the (BLAKE2b-prehashed) data verifies, and so does the
 * global signature over it and its trusted comment. Never throws.
 */
export function verifyUpdaterSignature({ data, signature, pubkey }) {
  try {
    const pub = Buffer.from(minisignLines(pubkey)[1] ?? '', 'base64')
    const [, sigLine, trusted, globalLine] = minisignLines(signature)
    const sig = Buffer.from(sigLine ?? '', 'base64')
    const global = Buffer.from(globalLine ?? '', 'base64')
    if (pub.length !== 42 || sig.length !== 74 || global.length !== 64) return false
    if (!trusted?.startsWith('trusted comment: ')) return false
    if (pub.subarray(0, 2).toString() !== 'Ed') return false
    if (!sig.subarray(2, 10).equals(pub.subarray(2, 10))) return false
    const algorithm = sig.subarray(0, 2).toString()
    if (algorithm !== 'ED' && algorithm !== 'Ed') return false
    const key = createPublicKey({
      key: Buffer.concat([ED25519_SPKI, pub.subarray(10)]),
      format: 'der',
      type: 'spki',
    })
    const message =
      algorithm === 'ED' ? createHash('blake2b512').update(data).digest() : data
    const signed = sig.subarray(10)
    const comment = Buffer.from(trusted.slice('trusted comment: '.length))
    return (
      verify(null, message, key, signed) &&
      verify(null, Buffer.concat([signed, comment]), key, global)
    )
  } catch {
    return false
  }
}
