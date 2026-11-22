import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readdir, readFile, stat } from 'node:fs/promises'
import { basename, resolve } from 'node:path'

const root = resolve('apps/desktop/src-tauri/assets/bundled-themes')
const SLOTS = ['hero.webp', 'logo.webp', 'preview-hero.webp', 'preview-logo.webp']
const MAX_THEMES = 32

async function inventory() {
  const files = []
  const dirs = (await readdir(root, { withFileTypes: true })).filter((entry) =>
    entry.isDirectory(),
  )
  for (const dir of dirs) {
    for (const name of await readdir(resolve(root, dir.name))) {
      const path = resolve(root, dir.name, name)
      files.push([
        path,
        createHash('sha256')
          .update(await readFile(path))
          .digest('hex'),
      ])
    }
  }
  return { dirs, files }
}

test('all bundled theme images are WebP and optimization retries preserve bytes', async () => {
  const { dirs, files: before } = await inventory()
  assert.ok(dirs.length > 0 && dirs.length <= MAX_THEMES)
  assert.equal(before.length, dirs.length * SLOTS.length)
  for (const [file] of before) {
    assert.match(file, /\.webp$/)
    assert.equal(SLOTS.includes(basename(file)), true)
  }
  const sizes = await Promise.all(before.map(([file]) => stat(file)))
  // 13 themes × 4 WebPs currently occupy ~6.6 MiB; 8 MiB still fails if PNGs sneak back in.
  assert.ok(sizes.reduce((sum, file) => sum + file.size, 0) < 8 * 1024 * 1024)
  const result = execFileSync(process.execPath, ['scripts/optimize-theme-artwork.mjs'], {
    encoding: 'utf8',
  })
  assert.match(result, /already optimized/i)
  assert.deepEqual((await inventory()).files, before)
})

test('bundling without an API key retains optimized offline images', async () => {
  const { files: before } = await inventory()
  const result = execFileSync(process.execPath, ['scripts/bundle-theme-artwork.mjs'], {
    encoding: 'utf8',
    env: { ...process.env, STEAMGRIDDB_API_KEY: '' },
  })
  assert.match(result, /preserving existing artwork/i)
  assert.deepEqual((await inventory()).files, before)
})
