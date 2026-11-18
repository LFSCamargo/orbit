import { describe, expect, it } from 'vitest'
import type { CompatibilityCatalog, InstalledComponent } from '@/types/runtime'
import type { DownloadTask } from '@/lib/downloadProgress'
import { ORBIT_WINE_KEY } from '@/modules/settings/hooks/useOrbitWineSetup'
import { buildSetupRows, rowStatus, setupSummary, type SetupRow } from '../setupPlan'

const v = (version: string, url = `https://x/${version}`, prerelease = false) => ({
  version,
  prerelease,
  asset: { name: version, url, size: 100, sha256: 'abc' },
  homebrewFormula: null,
  localPackage: null,
})

const catalog: CompatibilityCatalog = {
  fetchedAt: '',
  warnings: [],
  components: [
    ['gptk', [v('3.0 · Apple official via Homebrew', ''), v('v3.0-3', undefined, true)]],
    ['dxmt', [v('v0.70'), v('v0.60')]],
    ['dxvk', [v('v2.4')]],
    ['moltenvk', [v('v1.3.0')]],
  ].map(([id, versions]) => ({
    id: id as string,
    name: id as string,
    technology: '',
    sourceUrl: '',
    distribution: '',
    downloadable: true,
    versions: versions as ReturnType<typeof v>[],
  })),
}

const installed = (id: string, version: string): InstalledComponent => ({
  id,
  version,
  kind: 'dxmt',
  path: '',
  installedAt: '',
})

const task = (key: string, progress: DownloadTask['progress']): DownloadTask => ({
  key,
  label: key,
  progress,
  startedAt: '',
})

describe('buildSetupRows', () => {
  const rows = buildSetupRows(catalog, [], false)
  const byId = Object.fromEntries(rows.map((r) => [r.id, r]))

  it('lists Wine, GPTK, DXMT and DXVK + MoltenVK in that order', () => {
    expect(rows.map((r) => r.id)).toEqual(['wine', 'gptk', 'dxmt', 'dxvk'])
    expect(byId.gptk.note).toMatch(/Apple license/)
  })

  it('badges each row, with Wine required and DXVK optional', () => {
    expect(rows.map((r) => r.badge)).toEqual([
      'required',
      'recommended',
      'latest',
      'optional',
    ])
    expect(rows.map((r) => r.selectedByDefault)).toEqual([true, true, true, false])
  })

  it('installs Orbit Wine and its container, not plain Wine, and the rest from the catalog', () => {
    expect(byId.wine.name).toBe('Orbit Wine')
    expect(byId.wine.description).toMatch(/container/i)
    expect(byId.wine.parts).toEqual([{ key: ORBIT_WINE_KEY, orbitWine: true }])
    expect(byId.dxmt.parts[0].spec).toMatchObject({ id: 'dxmt', version: 'v0.70' })
  })

  it('takes a downloadable GPTK build, even a prerelease, over Homebrew entries', () => {
    expect(byId.gptk.parts[0].spec).toMatchObject({ id: 'gptk', version: 'v3.0-3' })
  })

  it('installs MoltenVK with DXVK, unless MoltenVK is already there', () => {
    expect(byId.dxvk.parts.map((p) => p.spec?.id)).toEqual(['moltenvk', 'dxvk'])
    const withMolten = buildSetupRows(catalog, [installed('moltenvk', 'v1.2')], false)
    expect(withMolten.find((r) => r.id === 'dxvk')?.parts.map((p) => p.spec?.id)).toEqual(
      ['dxvk'],
    )
  })

  it('marks rows installed from what is on disk', () => {
    const rows2 = buildSetupRows(
      catalog,
      [installed('dxmt', 'v0.60'), installed('dxvk', 'v2'), installed('moltenvk', 'v1')],
      true,
    )
    const ids = rows2.filter((r) => r.installed).map((r) => r.id)
    expect(ids).toEqual(['wine', 'dxmt', 'dxvk'])
  })

  it('marks catalog components it cannot download as unavailable', () => {
    const offline = buildSetupRows(undefined, [], false)
    expect(offline.find((r) => r.id === 'wine')?.available).toBe(true)
    expect(offline.filter((r) => !r.available).map((r) => r.id)).toEqual([
      'gptk',
      'dxmt',
      'dxvk',
    ])
  })
})

describe('rowStatus', () => {
  const rows = buildSetupRows(catalog, [], false)
  const dxvk = rows.find((r) => r.id === 'dxvk') as SetupRow
  const dxmt = rows.find((r) => r.id === 'dxmt') as SetupRow
  const keys = dxvk.parts.map((p) => p.key)

  it('reports a running part with its percentage', () => {
    const tasks = {
      [keys[0]]: task(keys[0], {
        phase: 'Downloading',
        component: 'moltenvk',
        downloadedBytes: 50,
        totalBytes: 100,
      }),
    }
    expect(rowStatus(dxvk, { tasks, failures: {}, queued: new Set() })).toEqual({
      kind: 'installing',
      percent: 25,
    })
  })

  it('is installed once every part is ready', () => {
    const ready = { phase: 'Ready' as const, component: '', message: 'Ready' }
    const tasks = Object.fromEntries(keys.map((k) => [k, task(k, ready)]))
    expect(rowStatus(dxvk, { tasks, failures: {}, queued: new Set() }).kind).toBe(
      'installed',
    )
  })

  it('reports the failure message of a failed part', () => {
    const failures = { [dxmt.parts[0].key]: 'checksum mismatch' }
    expect(rowStatus(dxmt, { tasks: {}, failures, queued: new Set() })).toEqual({
      kind: 'failed',
      message: 'checksum mismatch',
    })
  })

  it('is queued while waiting its turn, idle otherwise', () => {
    expect(
      rowStatus(dxmt, { tasks: {}, failures: {}, queued: new Set(['dxmt']) }).kind,
    ).toBe('queued')
    expect(rowStatus(dxmt, { tasks: {}, failures: {}, queued: new Set() }).kind).toBe(
      'idle',
    )
  })
})

describe('setupSummary', () => {
  it('counts the run and averages its progress', () => {
    const summary = setupSummary([
      { id: 'wine', status: { kind: 'installed' } },
      { id: 'gptk', status: { kind: 'installing', percent: 50 } },
      { id: 'dxmt', status: { kind: 'queued' } },
      { id: 'dxvk', status: { kind: 'queued' } },
    ])
    expect(summary).toMatchObject({ total: 4, completed: 1, current: 2, percent: 38 })
    expect(summary.failed).toEqual([])
  })

  it('lists failures and treats an empty run as done', () => {
    const summary = setupSummary([
      { id: 'wine', status: { kind: 'installed' } },
      { id: 'gptk', status: { kind: 'failed', message: 'offline' } },
    ])
    expect(summary.failed).toEqual(['gptk'])
    expect(setupSummary([])).toMatchObject({ total: 0, percent: 100 })
  })
})
