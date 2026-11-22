import { downloadPercent, type DownloadTask } from '@/lib/downloadProgress'
import { ORBIT_WINE_KEY } from '@/modules/settings/hooks/useOrbitWineSetup'
import { componentTaskKey } from '@/modules/settings/hooks/useComponentInstall'
import type {
  CatalogComponent,
  CompatibilityCatalog,
  ComponentSpec,
  InstalledComponent,
} from '@/types/runtime'

export type SetupRowId = 'wine' | 'gptk' | 'dxmt' | 'dxvk'

/** One install behind a row: Orbit Wine with its container, or a catalog component. */
interface SetupPart {
  /** Download-store task key, shared with Settings and the downloads sidebar. */
  key: string
  orbitWine?: true
  spec?: ComponentSpec
}

export type SetupBadge = 'required' | 'recommended' | 'latest' | 'optional'

export interface SetupRow {
  id: SetupRowId
  name: string
  description: string
  badge: SetupBadge
  /** Checked when Setup opens; required rows cannot be unchecked. */
  selectedByDefault: boolean
  note?: string
  installed: boolean
  /** Every part has something to install. */
  available: boolean
  parts: SetupPart[]
}

export type RowStatus =
  | { kind: 'installed' }
  | { kind: 'installing'; percent: number | null }
  | { kind: 'queued' }
  | { kind: 'failed'; message: string }
  | { kind: 'idle' }

/** First stable release with a download; a prerelease only when that is all
 * there is (GPTK community builds are betas). Catalog order is newest first.
 */
function newestDownloadable(component?: CatalogComponent): ComponentSpec | undefined {
  const versions = component?.versions.filter((v) => v.asset.url) ?? []
  const pick = versions.find((v) => !v.prerelease) ?? versions[0]
  if (!component || !pick) return undefined
  return {
    id: component.id,
    version: pick.version,
    url: pick.asset.url,
    size: pick.asset.size,
    sha256: pick.asset.sha256,
  }
}

function catalogPart(
  catalog: CompatibilityCatalog | undefined,
  id: string,
): SetupPart | null {
  const spec = newestDownloadable(catalog?.components.find((c) => c.id === id))
  return spec ? { key: componentTaskKey(spec.id, spec.version), spec } : null
}

/** The compatibility stack onboarding offers, from the catalog and what is installed. */
export function buildSetupRows(
  catalog: CompatibilityCatalog | undefined,
  installed: InstalledComponent[],
  /** Orbit Wine is installed and its base container is ready. */
  orbitWineReady: boolean,
): SetupRow[] {
  const has = (id: string) => installed.some((component) => component.id === id)
  const row = (
    base: Omit<SetupRow, 'available' | 'parts' | 'installed'>,
    ids: string[],
  ): SetupRow => {
    const missing = ids.filter((id) => !has(id))
    const parts = missing.map((id) => catalogPart(catalog, id))
    return {
      ...base,
      installed: missing.length === 0,
      available: parts.every(Boolean),
      parts: parts.filter((part): part is SetupPart => part !== null),
    }
  }
  return [
    {
      id: 'wine',
      name: 'Orbit Wine',
      description:
        'Wine built for Orbit, with MSync, D3DMetal and Game Mode, plus the game container it runs in',
      badge: 'required',
      selectedByDefault: true,
      installed: orbitWineReady,
      available: true,
      parts: [{ key: ORBIT_WINE_KEY, orbitWine: true }],
    },
    row(
      {
        id: 'gptk',
        name: 'Game Porting Toolkit',
        description: 'D3DMetal: DirectX 11 and 12 translation to Apple Metal',
        badge: 'recommended',
        selectedByDefault: true,
        note: 'Apple license required',
      },
      ['gptk'],
    ),
    row(
      {
        id: 'dxmt',
        name: 'DXMT',
        description: 'DirectX 10 and 11 translation to Apple Metal',
        badge: 'latest',
        selectedByDefault: true,
      },
      ['dxmt'],
    ),
    row(
      {
        id: 'dxvk',
        name: 'DXVK + MoltenVK',
        description: 'DirectX 9, 10 and 11 through Vulkan on Metal',
        badge: 'optional',
        selectedByDefault: false,
      },
      ['moltenvk', 'dxvk'],
    ),
  ]
}

export function rowStatus(
  row: SetupRow,
  {
    tasks,
    failures,
    queued,
  }: {
    tasks: Record<string, DownloadTask>
    failures: Record<string, string>
    queued: Set<SetupRowId>
  },
): RowStatus {
  if (row.installed) return { kind: 'installed' }
  const failed = row.parts.find((part) => failures[part.key])
  if (failed) return { kind: 'failed', message: failures[failed.key] }
  const parts = row.parts.map((part) => tasks[part.key])
  if (parts.length && parts.every((t) => t?.progress?.phase === 'Ready')) {
    return { kind: 'installed' }
  }
  if (parts.some((t) => t && t.progress?.phase !== 'Ready')) {
    const percents = parts.map((t) => (t ? downloadPercent(t.progress) : 0))
    const known = percents.every((p) => p !== null)
    return {
      kind: 'installing',
      percent: known
        ? Math.round((percents as number[]).reduce((a, b) => a + b, 0) / parts.length)
        : null,
    }
  }
  if (queued.has(row.id)) return { kind: 'queued' }
  return { kind: 'idle' }
}

/** "Downloading k of n" and the overall bar for the rows in one run. */
export function setupSummary(run: { id: SetupRowId; status: RowStatus }[]) {
  const total = run.length
  const percentOf = (status: RowStatus) =>
    status.kind === 'installed'
      ? 100
      : status.kind === 'installing'
        ? (status.percent ?? 0)
        : 0
  const completed = run.filter((r) => r.status.kind === 'installed').length
  const active = run.findIndex((r) => r.status.kind === 'installing')
  const pending = run.findIndex((r) => r.status.kind !== 'installed')
  return {
    total,
    completed,
    current: (active >= 0 ? active : pending >= 0 ? pending : total - 1) + 1,
    percent: total
      ? Math.round(run.reduce((sum, r) => sum + percentOf(r.status), 0) / total)
      : 100,
    failed: run.filter((r) => r.status.kind === 'failed').map((r) => r.id),
  }
}
