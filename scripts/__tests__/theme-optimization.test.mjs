import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readdir, readFile, stat } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = resolve('apps/desktop/src-tauri/assets/bundled-themes')
async function inventory() {
  const files = []
  for (const dir of await readdir(root)) {
    for (const name of await readdir(resolve(root, dir))) {
      const path = resolve(root, dir, name)
      files.push([
        path,
        createHash('sha256')
          .update(await readFile(path))
          .digest('hex'),
      ])
    }
  }
  return files
}
test('all bundled theme images are WebP and optimization retries preserve bytes', async () => {
  const before = await inventory()
  assert.equal(before.length, 32)
  for (const [file] of before) assert.match(file, /\.webp$/)
  const sizes = await Promise.all(before.map(([file]) => stat(file)))
  assert.ok(sizes.reduce((sum, file) => sum + file.size, 0) < 6 * 1024 * 1024)
  const result = execFileSync(process.execPath, ['scripts/optimize-theme-artwork.mjs'], {
    encoding: 'utf8',
  })
  assert.match(result, /already optimized/i)
  assert.deepEqual(await inventory(), before)
})

test('bundling without an API key retains optimized offline images', async () => {
  const before = await inventory()
  const result = execFileSync(process.execPath, ['scripts/bundle-theme-artwork.mjs'], {
    encoding: 'utf8',
    env: { ...process.env, STEAMGRIDDB_API_KEY: '' },
  })
  assert.match(result, /preserving existing artwork/i)
  assert.deepEqual(await inventory(), before)
})
