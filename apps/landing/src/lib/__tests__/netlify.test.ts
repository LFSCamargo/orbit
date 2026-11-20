// @vitest-environment node

import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'
import { resolve } from 'node:path'
import { expect, it } from 'vitest'

const root = fileURLToPath(new URL('../../../../../', import.meta.url))
const landing = JSON.parse(
  readFileSync(resolve(root, 'apps/landing/package.json'), 'utf8'),
) as {
  nx: { name: string }
}

function buildSettings() {
  const config = readFileSync(resolve(root, 'netlify.toml'), 'utf8')
  const block = config.split('[build]')[1]?.split(/^\[/m)[0] ?? ''
  const setting = (key: string) =>
    new RegExp(`^\\s*${key}\\s*=\\s*"([^"]+)"`, 'm').exec(block)?.[1]
  return {
    base: setting('base'),
    command: setting('command'),
    publish: setting('publish'),
  }
}

it('runs the existing landing Nx project rather than its npm package name', () => {
  const { command } = buildSettings()
  const target = /^yarn nx run ([^: ]+):build$/.exec(command ?? '')
  expect(target).not.toBeNull()
  expect(target?.[1]).toBe(landing.nx.name)
})

it('keeps workspace installation at the root and publishes the landing Next.js output', () => {
  const { base, publish } = buildSettings()
  expect(base).toBe('.')
  expect(publish).toBeDefined()
  expect(resolve(root, base ?? '', publish ?? '')).toBe(
    resolve(root, 'apps/landing/.next'),
  )
})
