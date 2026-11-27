import { useState } from 'react'
import {
  AlertCircle,
  Check,
  Download,
  Layers,
  LoaderCircle,
  RefreshCw,
} from 'lucide-react'
import { Focusable } from '@/components/focus/Focusable'
import { DownloadProgress } from '@/components/ui/download-progress'
import { useDownloadStore } from '@/lib/downloadProgress'
import type { CatalogComponent, OrbitWineVersion } from '@/types/runtime'
import { ORBIT_WINE_KEY } from '../hooks/useOrbitWineSetup'
import { useOrbitWineVersions } from '../hooks/useOrbitWineVersions'
import { ComponentVersionPicker, type ComponentVersion } from './ComponentVersionPicker'
import {
  COMPAT_ROW,
  COMPONENT_ICON,
  COMPONENT_STATUS,
  PRIMARY_BUTTON,
} from './compatibilityRowStyles'

const LABEL = 'Windows games runtime'

/** The picker shows catalog entries; Orbit Wine builds read as one. */
const ORBIT_WINE: CatalogComponent = {
  id: 'orbit-wine',
  name: 'Orbit Wine',
  technology: 'Orbit Wine',
  sourceUrl: '',
  distribution: 'Orbit releases',
  downloadable: true,
  versions: [],
}

function asPickerVersion(build: OrbitWineVersion): ComponentVersion {
  return {
    key: build.version,
    component: ORBIT_WINE,
    release: {
      version: build.version,
      prerelease: false,
      asset: { name: '', url: '', size: build.sizeBytes ?? 0, sha256: null },
      homebrewFormula: null,
      localPackage: null,
    },
    installed: build.installed,
  }
}

function statusText(build: OrbitWineVersion): string {
  if (build.installed) return build.active ? 'Installed · In use' : 'Installed · Ready'
  return build.sizeBytes
    ? `${Math.round(build.sizeBytes / 1_000_000)} MB · Not installed`
    : 'Not installed'
}

/** Which Orbit Wine build Windows games play with. Choosing an installed
 * build switches to it; a published build installs only on request.
 */
export function OrbitWineRuntimeRow() {
  const { data, error, select, install } = useOrbitWineVersions()
  const task = useDownloadStore((state) => state.tasks[ORBIT_WINE_KEY])
  const failure = useDownloadStore((state) => state.failures[ORBIT_WINE_KEY] ?? '')
  const [viewed, setViewed] = useState('')
  const [selectError, setSelectError] = useState('')

  const builds = data?.versions ?? []
  const current =
    builds.find((build) => build.version === viewed) ??
    builds.find((build) => build.active) ??
    builds.find((build) => build.installed) ??
    builds[0]
  const inFlight = Boolean(task) && task?.progress?.phase !== 'Ready'

  const choose = async (version: string) => {
    const build = builds.find((item) => item.version === version)
    if (!build) return
    setViewed(version)
    setSelectError('')
    // Browsing a build that is not installed only changes the view.
    if (build.installed && !build.active) setSelectError(await select(version))
  }

  const showInstall = current && !current.installed && current.sizeBytes !== null

  return (
    <div className={COMPAT_ROW}>
      <span className={COMPONENT_ICON} aria-hidden="true">
        <Layers size={18} />
      </span>
      <div className="min-w-0 flex-1 space-y-2">
        <div>
          <p className="text-sm font-medium">{LABEL}</p>
          <p className="mt-1 text-xs leading-relaxed text-orbit-muted">
            Orbit Wine · The Wine build every Windows game plays with.
          </p>
          {current && (
            <span className={COMPONENT_STATUS} data-ready={current.installed}>
              {current.installed && <Check size={12} />}
              {statusText(current)}
            </span>
          )}
        </div>
        {inFlight && task && <DownloadProgress task={task} />}
        {(failure || selectError) && !inFlight && (
          <p
            role="alert"
            className="flex items-start gap-1.5 text-xs leading-relaxed text-red-400"
          >
            <AlertCircle size={13} className="mt-0.5 shrink-0" />
            <span>{failure || selectError}</span>
          </p>
        )}
        {(error || data?.error) && (
          <p role="status" className="text-xs leading-relaxed text-orbit-muted">
            Published versions are unavailable: {String(error ?? data?.error)}
          </p>
        )}
        {!inFlight && current?.active && viewed && !selectError && (
          <p className="text-xs text-orbit-muted">
            Games use this version on their next launch.
          </p>
        )}
      </div>
      <div className="flex flex-col items-end gap-2">
        <ComponentVersionPicker
          label={LABEL}
          versions={builds.map(asPickerVersion)}
          value={current?.version ?? ''}
          onChange={(version) => void choose(version)}
        />
        {current && (showInstall || (failure && !inFlight)) && (
          <Focusable
            focusId="runtime-install-orbit-wine"
            group="runtimes"
            order={4}
            noScale
            disabled={inFlight}
            onClick={() => void install(current.version)}
            className={PRIMARY_BUTTON}
          >
            {inFlight ? (
              <LoaderCircle size={12} className="animate-spin" />
            ) : failure ? (
              <RefreshCw size={12} />
            ) : (
              <Download size={12} />
            )}
            {inFlight ? 'Working…' : failure ? 'Retry' : 'Install'}
          </Focusable>
        )}
      </div>
    </div>
  )
}
