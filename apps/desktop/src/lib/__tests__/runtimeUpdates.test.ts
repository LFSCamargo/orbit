import { expect, it } from 'vitest'
import type { CatalogComponent, InstalledComponent } from '@/types/runtime'
import { runtimeUpdates } from '../runtimeUpdates'

const version = (tag: string, prerelease = false, url = `https://x/${tag}.tar.gz`) => ({
  version: tag,
  prerelease,
  asset: { name: `${tag}.tar.gz`, url, size: 10, sha256: 'abc' },
  homebrewFormula: null,
  localPackage: null,
})

const component = (
  id: string,
  versions: ReturnType<typeof version>[],
): CatalogComponent => ({
  id,
  name: id.toUpperCase(),
  technology: '',
  sourceUrl: '',
  distribution: '',
  downloadable: true,
  versions,
})

const installed = (id: string, tag: string): InstalledComponent => ({
  id,
  version: tag,
  kind: 'dxmt',
  path: `/c/${id}/${tag}`,
  installedAt: '2026-01-01T00:00:00Z',
})

it('queues the newest stable release of an installed component that is behind', () => {
  const catalog = [component('dxmt', [version('v0.70'), version('v0.60')])]
  expect(runtimeUpdates(catalog, [installed('dxmt', 'v0.60')])).toEqual([
    {
      id: 'dxmt',
      version: 'v0.70',
      url: 'https://x/v0.70.tar.gz',
      size: 10,
      sha256: 'abc',
    },
  ])
})

it('leaves an up-to-date component alone', () => {
  const catalog = [component('dxmt', [version('v0.70'), version('v0.60')])]
  expect(runtimeUpdates(catalog, [installed('dxmt', 'v0.70')])).toEqual([])
})

it('compares against the newest of several installed versions', () => {
  const catalog = [component('dxvk', [version('v2.4'), version('v2.3'), version('v2.2')])]
  expect(
    runtimeUpdates(catalog, [installed('dxvk', 'v2.2'), installed('dxvk', 'v2.4')]),
  ).toEqual([])
})

it('skips prereleases unless a prerelease is what is installed', () => {
  const catalog = [component('dxmt', [version('v0.80-beta', true), version('v0.70')])]
  expect(runtimeUpdates(catalog, [installed('dxmt', 'v0.70')])).toEqual([])
  const beta = [
    component('dxmt', [version('v0.81-beta', true), version('v0.80-beta', true)]),
  ]
  expect(runtimeUpdates(beta, [installed('dxmt', 'v0.80-beta')])[0]?.version).toBe(
    'v0.81-beta',
  )
})

it('never touches installs the catalog does not know, or versions without a download', () => {
  const catalog = [
    component('gptk', [
      version('3.0 · Apple official via Homebrew', false, ''),
      version('v3.0-2'),
    ]),
  ]
  expect(
    runtimeUpdates(catalog, [installed('gptk', '3.0 · Apple download (dmg)')]),
  ).toEqual([])
  expect(runtimeUpdates(catalog, [installed('moltenvk', 'v1.2')])).toEqual([])
})

it('never updates the pinned recommended Wine or manually registered Zink', () => {
  const catalog = [
    component('wine-stable', [version('11.1'), version('11.0_1')]),
    component('zink', [version('2'), version('1')]),
  ]
  expect(
    runtimeUpdates(catalog, [installed('wine-stable', '11.0_1'), installed('zink', '1')]),
  ).toEqual([])
})
