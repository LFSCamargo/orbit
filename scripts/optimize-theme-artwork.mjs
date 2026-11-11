#!/usr/bin/env node
/** Optimize the shipped theme bundle. cwebp is a build-time tool, never an app dependency. */
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { cp, copyFile, mkdtemp, readdir, rename, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const ASSETS = join(ROOT, 'apps/desktop/src-tauri/assets/bundled-themes')
const OUTPUTS = ['logo.webp', 'hero.webp', 'preview-logo.webp', 'preview-hero.webp']
const entries = (await readdir(ASSETS, { withFileTypes: true })).filter((entry) =>
  entry.isDirectory(),
)
if (entries.length > 32) throw new Error('Theme bundle exceeds the supported size')
const legacySource = (dir, slot) =>
  ['png', 'jpg'].some((ext) => existsSync(join(dir, `${slot}.${ext}`)))
const work = entries.filter((entry) => {
  const dir = join(ASSETS, entry.name)
  return (
    OUTPUTS.some((file) => !existsSync(join(dir, file))) ||
    legacySource(dir, 'logo') ||
    legacySource(dir, 'hero')
  )
})
if (!work.length) {
  console.log('All theme images are already optimized.')
} else {
  execFileSync('cwebp', ['-version'], { stdio: 'ignore' })
  const stage = await mkdtemp(join(tmpdir(), 'orbit-theme-optimization-'))
  execFileSync(
    'cargo',
    [
      'run',
      '--manifest-path',
      join(ROOT, 'apps/desktop/src-tauri/Cargo.toml'),
      '-p',
      'orbit-images',
      '--example',
      'optimize_bundled',
      '--',
      ASSETS,
      stage,
    ],
    { cwd: ROOT, stdio: 'inherit' },
  )
  let before = 0
  let after = 0
  // Keep a recovery copy outside the shipped project before replacing its source assets.
  const backup = await mkdtemp(join(tmpdir(), 'orbit-theme-originals-'))
  await cp(ASSETS, backup, { recursive: true })
  for (const entry of work) {
    const dir = join(ASSETS, entry.name)
    const temporary = join(stage, entry.name)
    const changed = { logo: legacySource(dir, 'logo'), hero: legacySource(dir, 'hero') }
    for (const file of await readdir(dir)) before += (await stat(join(dir, file))).size
    const jobs = [
      ['logo', 'logo.png', 'logo.webp', ['-lossless', '-z', '9']],
      ['hero', 'hero.png', 'hero.webp', ['-q', '86', '-m', '6', '-sharp_yuv']],
      ['logo', 'preview-logo.png', 'preview-logo.webp', ['-lossless', '-z', '9']],
      [
        'hero',
        'preview-hero.jpg',
        'preview-hero.webp',
        ['-q', '84', '-m', '6', '-sharp_yuv'],
      ],
    ]
    for (const [slot, source, target, options] of jobs) {
      if (!changed[slot] && existsSync(join(dir, target))) continue
      const encoded = join(temporary, target)
      execFileSync(
        'cwebp',
        ['-quiet', '-mt', ...options, join(temporary, source), '-o', encoded],
        { stdio: 'inherit' },
      )
      const pending = join(dir, `.${target}.tmp`)
      await copyFile(encoded, pending)
      await rename(pending, join(dir, target))
    }
    // Remove only obsolete generated image names once every replacement exists.
    if (OUTPUTS.every((file) => existsSync(join(dir, file)))) {
      for (const slot of ['logo', 'hero', 'preview-logo', 'preview-hero']) {
        for (const extension of ['png', 'jpg', 'svg']) {
          await rm(join(dir, `${slot}.${extension}`), { force: true })
        }
      }
    }
    for (const file of OUTPUTS) after += (await stat(join(dir, file))).size
  }
  console.log(
    `Optimized ${work.length} themes: ${before} → ${after} bytes. Recovery copy: ${backup}`,
  )
}
