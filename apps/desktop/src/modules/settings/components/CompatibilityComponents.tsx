import { useMemo, useState } from 'react'
import { clsx } from 'clsx'
import {
  AlertCircle,
  Check,
  Cpu,
  Download,
  FileDown,
  Layers,
  LoaderCircle,
  RefreshCw,
} from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { getCompatibilityCatalog, getComponentStatus } from '@/lib/tauri'
import { Focusable } from '@/components/focus/Focusable'
import { DownloadProgress } from '@/components/ui/download-progress'
import type {
  ActiveComponents,
  CatalogComponent,
  InstalledComponent,
  WineInstallation,
} from '@/types/runtime'
import { useComponentBrowseStore } from '@/stores/component-browse.store'
import { useActiveComponents } from '../hooks/useActiveComponents'
import { useComponentViews } from '../hooks/useComponentViews'
import { useComponentInstall } from '../hooks/useComponentInstall'
import { ComponentVersionPicker, type ComponentVersion } from './ComponentVersionPicker'
import { buttonClass } from '@/components/ui/button'
import { SkeletonPanel } from '@/components/feedback/Skeleton'

const graphicsIds = new Set(['dxvk', 'dxmt', 'gptk'])

const ROW_GROUP = clsx(
  'settings-row-group overflow-hidden rounded-[18px] border border-orbit-foreground/10',
  'bg-orbit-foreground/[0.035] shadow-[inset_0_1px_0_rgb(var(--orbit-foreground)/0.035)]',
)

const COMPAT_ROW = clsx(
  'compatibility-component grid min-h-[78px] grid-cols-[34px_minmax(0,1fr)_minmax(130px,34%)] items-center gap-3.5 p-4',
  'even:bg-orbit-foreground/[0.035] hover:bg-orbit-foreground/[0.055]',
  'max-[700px]:grid-cols-[36px_minmax(0,1fr)]',
  'max-[700px]:[&>button]:col-start-2 max-[700px]:[&>button]:w-full max-[700px]:[&>button]:text-left',
)

const COMPONENT_ICON =
  'compatibility-component-icon grid size-[34px] place-items-center rounded-xl border border-orbit-border bg-orbit-foreground/[0.04] text-orbit-foreground/70'

const SECONDARY_BUTTON = clsx(
  'settings-secondary-button flex items-center gap-2 whitespace-nowrap rounded-[10px] border border-orbit-border bg-orbit-foreground/[0.06] px-3.5 py-2.5 text-xs font-semibold',
  'disabled:cursor-not-allowed disabled:opacity-40',
)

const PRIMARY_BUTTON = clsx(
  buttonClass({ size: 'sm', className: 'settings-primary-button' }),
  'disabled:cursor-not-allowed disabled:opacity-40',
)

export function CompatibilityComponents({
  managed,
  managedVersion,
}: {
  managedVersion: string
  managed: WineInstallation | null
}) {
  const { data, isFetching, error, refetch } = useQuery({
    queryKey: ['compatibility-catalog'],
    queryFn: () => getCompatibilityCatalog(),
    staleTime: 6 * 60 * 60 * 1000,
  })
  const { data: installed } = useQuery({
    queryKey: ['component-status'],
    queryFn: () => getComponentStatus(),
  })
  const installs = useComponentInstall()
  const { actives, select, error: activeError } = useActiveComponents()
  const installedByKey = useMemo(() => {
    const map = new Map<string, InstalledComponent>()
    for (const component of installed ?? []) {
      map.set(JSON.stringify([component.id, component.version]), component)
    }
    return map
  }, [installed])

  const components = data?.components ?? []
  const groups = [
    {
      id: 'wine',
      label: 'Compatibility layer',
      help: 'Choose a Wine version to view or install it.',
      components: components.filter((item) => item.id.startsWith('wine-')),
    },
    {
      id: 'graphics',
      label: 'Graphics engine',
      help: 'DirectX 10 / 11 / 12 · Pick an engine and version, then install it to unlock it in Game graphics.',
      components: components.filter((item) => graphicsIds.has(item.id)),
    },
    ...components
      .filter((item) => !item.id.startsWith('wine-') && !graphicsIds.has(item.id))
      .map((item) => ({
        id: item.id,
        label: item.name,
        help: item.technology,
        components: [item],
      })),
  ]

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold">Compatibility components</h3>
          <p className="mt-1 text-xs text-orbit-muted">
            Available versions and installation status.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Focusable
            focusId="runtime-catalog-refresh"
            group="runtimes"
            order={3}
            noScale
            disabled={isFetching}
            onClick={() => void refetch()}
            className={SECONDARY_BUTTON}
          >
            <RefreshCw size={13} className={isFetching ? 'animate-spin' : undefined} />
            Refresh
          </Focusable>
        </div>
      </div>
      {!data &&
        (error ? (
          <p role="status" className="text-sm text-orbit-muted">
            {String(error)}
          </p>
        ) : (
          <SkeletonPanel label="Loading online versions" rows={4} />
        ))}
      {activeError && (
        <p role="alert" className="text-xs leading-relaxed text-red-400">
          Could not read which component versions are active: {activeError}
        </p>
      )}
      {data?.warnings.map((warning) => (
        <p key={warning} role="status" className="text-xs text-orbit-muted">
          {warning}
        </p>
      ))}
      {data && (
        <div className={ROW_GROUP}>
          {groups
            .filter((group) => group.components.length)
            .map((group) => (
              <ComponentRow
                key={group.id}
                {...group}
                managed={managed}
                managedVersion={managedVersion}
                installedByKey={installedByKey}
                installs={installs}
                active={actives}
                onSelect={select}
              />
            ))}
        </div>
      )}
      {data && (
        <p className="text-xs leading-relaxed text-orbit-muted">
          Install a component version to unlock its graphics backend. Apple GPTK versions
          come from the community binary releases and from Apple packages already on this
          Mac; Apple's Homebrew formula installs only its current official build.
        </p>
      )}
    </div>
  )
}

type Installs = ReturnType<typeof useComponentInstall>

function ComponentRow({
  id,
  label,
  help,
  components,
  managed,
  managedVersion,
  installedByKey,
  installs,
  active,
  onSelect,
}: {
  id: string
  label: string
  help: string
  components: CatalogComponent[]
  managed: WineInstallation | null
  managedVersion: string
  installedByKey: Map<string, InstalledComponent>
  installs: Installs
  active: ActiveComponents
  onSelect: (component: string, version: string) => Promise<string>
}) {
  // Memory keeps the row while this window is open. SQLite is what comes back
  // after that copy is gone, including a tab change that remounts this row.
  const memory = useComponentBrowseStore((state) => state.views[id] ?? '')
  const setView = useComponentBrowseStore((state) => state.setView)
  const savedViews = useComponentViews()
  const selected = memory || savedViews.views[id] || ''
  const [selectError, setSelectError] = useState('')

  const versions: ComponentVersion[] = components.flatMap((component) =>
    component.versions.map((release) => {
      const key = JSON.stringify([component.id, release.version])
      const installed =
        installedByKey.has(key) ||
        (component.id === 'gptk' &&
          Array.from(installedByKey.values()).some(
            (installedItem) =>
              installedItem.id === component.id &&
              release.version.startsWith(`${installedItem.version} ·`),
          ))
      return { key, component, release, installed }
    }),
  )

  // A managed Wine install counts as the pinned stable version.
  const wineManagedKey = useMemo(() => {
    if (id !== 'wine' || !managed) return null
    return (
      versions.find((v) => v.component.id === 'wine-stable' && v.installed)?.key ??
      JSON.stringify(['wine-stable', managedVersion])
    )
  }, [id, managed, managedVersion, versions])

  const installedVersionOf = (version: ComponentVersion): string | undefined => {
    const exact = installedByKey.get(version.key)
    if (exact) return exact.version
    if (version.component.id !== 'gptk') return undefined
    // GPTK catalog labels are "<installed version> · <source>", so recover the
    // stored version from the first matching installed entry.
    return Array.from(installedByKey.values()).find(
      (item) =>
        item.id === version.component.id &&
        version.release.version.startsWith(`${item.version} ·`),
    )?.version
  }

  function isActive(version: ComponentVersion): boolean {
    const stored = installedVersionOf(version)
    return Boolean(stored) && active[version.component.id] === stored
  }

  const current =
    versions.find((version) => version.key === selected) ??
    versions.find(isActive) ??
    versions.find((version) => version.installed) ??
    (wineManagedKey
      ? versions.find((version) => version.key === wineManagedKey)
      : undefined) ??
    versions[0]

  const choose = async (key: string) => {
    const version = versions.find((item) => item.key === key)
    if (!version) return
    setView(id, key)
    setSelectError('')
    try {
      await savedViews.remember(id, key)
    } catch (caught) {
      setSelectError(String(caught))
      return
    }
    const stored = installedVersionOf(version)
    // Browsing a version that is not installed is only a view change; making a
    // version active requires it to be installed, which the Rust side re-checks.
    if (!stored) return
    setSelectError(await onSelect(version.component.id, stored))
  }

  if (!savedViews.ready) {
    return (
      <div className={COMPAT_ROW}>
        <p className="text-sm font-medium">{label}</p>
      </div>
    )
  }

  const downloadable = current?.component.downloadable ?? false
  const hasHomebrew = Boolean(current?.release.homebrewFormula)
  const hasLocalPackage = Boolean(current?.release.localPackage)
  const hasAsset = Boolean(current?.release.asset.url)

  const task = current
    ? installs.taskFor(current.component.id, current.release.version)
    : undefined
  const inFlight = Boolean(task) && task?.progress?.phase !== 'Ready'
  const failure = current
    ? installs.failureFor(current.component.id, current.release.version)
    : ''

  const install = async () => {
    if (!current) return
    if (hasLocalPackage && current.release.localPackage) {
      await installs.importLocal(current.release.localPackage)
      return
    }
    if (hasHomebrew && current.release.homebrewFormula) {
      await installs.installHomebrew(current.release.homebrewFormula)
      return
    }
    if (!downloadable || !hasAsset) return
    await installs.installCatalogComponent({
      id: current.component.id,
      version: current.release.version,
      url: current.release.asset.url,
      size: current.release.asset.size,
      sha256: current.release.asset.sha256,
    })
  }

  const installed = current?.installed ?? false
  const showInstall =
    current && !installed && (hasAsset || hasHomebrew || hasLocalPackage)
  const buttonLabel = hasLocalPackage
    ? 'Import local file'
    : hasHomebrew
      ? 'Install · Homebrew'
      : 'Install'

  return (
    <div className={COMPAT_ROW}>
      <span className={COMPONENT_ICON} aria-hidden="true">
        {id === 'wine' ? <Layers size={18} /> : <Cpu size={18} />}
      </span>
      <div className="min-w-0 flex-1 space-y-2">
        <div>
          <p className="text-sm font-medium">{label}</p>
          <p className="mt-1 text-xs leading-relaxed text-orbit-muted">{help}</p>
          {current && (
            <span
              className="compatibility-status mt-[7px] inline-flex items-center gap-[5px] text-[11px] text-orbit-muted data-[ready=true]:text-[#86d6ab]"
              data-ready={installed}
            >
              {installed && <Check size={12} />}
              {installed
                ? 'Installed · Ready'
                : hasLocalPackage
                  ? current.release.localPackage?.digestVerified
                    ? 'Found locally · SHA-256 verified'
                    : 'Found locally · digest not pinned'
                  : current.release.asset.size > 0
                    ? `${Math.round(current.release.asset.size / 1_000_000)} MB · Not installed`
                    : 'Apple license required · Not installed'}
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
        {!inFlight && current && isActive(current) && (
          <p className="text-xs text-orbit-muted">
            Games use this version on their next launch.
          </p>
        )}
      </div>
      <div className="flex flex-col items-end gap-2">
        <ComponentVersionPicker
          label={label}
          versions={versions}
          value={current?.key ?? ''}
          onChange={(key) => void choose(key)}
        />
        {(showInstall || (failure && !inFlight)) && (
          <Focusable
            focusId={`runtime-install-${id}`}
            group="runtimes"
            order={4}
            noScale
            disabled={inFlight}
            onClick={() => {
              if (current && failure && !inFlight)
                installs.dismiss(current.component.id, current.release.version)
              void install()
            }}
            className={PRIMARY_BUTTON}
          >
            {inFlight ? (
              <LoaderCircle size={12} className="animate-spin" />
            ) : failure ? (
              <RefreshCw size={12} />
            ) : hasLocalPackage ? (
              <FileDown size={12} />
            ) : (
              <Download size={12} />
            )}
            {inFlight ? 'Working…' : failure ? 'Retry' : buttonLabel}
          </Focusable>
        )}
      </div>
    </div>
  )
}
