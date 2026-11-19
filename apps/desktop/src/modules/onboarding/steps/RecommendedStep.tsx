import { useQuery, useQueryClient } from '@tanstack/react-query'
import { clsx } from 'clsx'
import {
  Folder,
  FolderOpen,
  Gauge,
  Plus,
  RefreshCw,
  ScanSearch,
  X,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import { useState } from 'react'
import { Focusable } from '@/components/focus/Focusable'
import { buttonClass } from '@/components/ui/button'
import { useLibraryPaths } from '@/hooks/useLibraryPaths'
import { getCompatibilitySettings, updateCompatibilitySettings } from '@/lib/tauri'
import { usePreferencesStore } from '@/stores/preferences.store'
import type { CompatibilitySettings } from '@/types/runtime'
import { OnboardingFooter } from '../components/OnboardingFooter'
import { StepHeader } from '../components/StepHeader'
import { BADGE, BADGE_HOT, ONBOARDING_PANEL, PANEL_ROWS } from '../components/styles'

type Draft = {
  performance: boolean
  gptk: boolean
  autoUpdateRuntimes: boolean
  scanOnStartup: boolean
}

const TOGGLES: { key: keyof Draft; label: string; help: string; icon: LucideIcon }[] = [
  {
    key: 'performance',
    icon: Zap,
    label: 'Optimize game performance',
    help: 'MSync and Rosetta AVX for faster Windows games',
  },
  {
    key: 'gptk',
    icon: Gauge,
    label: 'Prefer Apple Game Porting Toolkit',
    help: 'D3DMetal for DirectX 11 and 12 when installed',
  },
  {
    key: 'autoUpdateRuntimes',
    icon: RefreshCw,
    label: 'Update runtimes automatically',
    help: 'Newer compatibility components at startup',
  },
  {
    key: 'scanOnStartup',
    icon: ScanSearch,
    label: 'Scan for new games on startup',
    help: 'Find newly installed games each launch',
  },
]

/** `/Users/name/…` reads as `~/…`. */
function displayPath(path: string) {
  return path.replace(/^\/Users\/[^/]+/, '~')
}

function fromSettings(settings: CompatibilitySettings) {
  return {
    performance: settings.synchronization === 'msync' && settings.avx,
    // Automatic picks GPTK first when it is installed.
    gptk: settings.graphics === 'auto' || settings.graphics === 'd3dmetal',
  }
}

/** On keeps Automatic (GPTK first, falling back); off uses Wine's own
 * translation, which never needs an extra component.
 */
function toSettings(
  settings: CompatibilitySettings,
  draft: Draft,
): CompatibilitySettings {
  return {
    ...settings,
    synchronization: draft.performance ? 'msync' : 'default',
    avx: draft.performance,
    graphics: draft.gptk
      ? settings.graphics === 'd3dmetal'
        ? 'd3dmetal'
        : 'auto'
      : 'wine',
  }
}

export function RecommendedStep({
  onNext,
  onBack,
}: {
  onNext: () => void
  onBack: () => void
}) {
  const queryClient = useQueryClient()
  const settings = useQuery({
    queryKey: ['compatibility-settings'],
    queryFn: getCompatibilitySettings,
  })
  const preferences = usePreferencesStore((s) => s.preferences)
  const updatePreferences = usePreferencesStore((s) => s.update)
  const library = useLibraryPaths()
  const [edits, setEdits] = useState<Partial<Draft>>({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const draft: Draft = {
    performance: true,
    gptk: true,
    ...(settings.data && fromSettings(settings.data)),
    autoUpdateRuntimes: preferences.autoUpdateRuntimes,
    scanOnStartup: preferences.scanOnStartup,
    ...edits,
  }

  const save = async () => {
    setSaving(true)
    setError('')
    try {
      if (settings.data) {
        const next = await updateCompatibilitySettings(toSettings(settings.data, draft))
        queryClient.setQueryData(['compatibility-settings'], next)
      }
      await updatePreferences({
        autoUpdateRuntimes: draft.autoUpdateRuntimes,
        scanOnStartup: draft.scanOnStartup,
      })
      onNext()
    } catch (caught) {
      setError(`Could not save these settings: ${String(caught)}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <StepHeader
        title="Recommended Settings"
        subtitle="Apply our recommended settings for the best performance and compatibility. You can change these later in Settings."
      />
      <div className="mx-auto mt-[clamp(12px,3.4cqh,28px)] grid w-full max-w-[960px] grid-cols-2 gap-5 max-[900px]:grid-cols-1">
        <section
          aria-label="Performance and compatibility"
          className={clsx(ONBOARDING_PANEL, 'px-2 py-1')}
        >
          <ul className={PANEL_ROWS}>
            {TOGGLES.map(({ key, label, help, icon: Icon }, index) => (
              <li key={key}>
                <Focusable
                  focusId={`onboarding-toggle-${key}`}
                  group="onboarding"
                  order={index}
                  noScale
                  noRing
                  role="switch"
                  aria-checked={draft[key]}
                  aria-labelledby={`onboarding-${key}`}
                  onClick={() =>
                    setEdits((current) => ({ ...current, [key]: !draft[key] }))
                  }
                  className="flex w-full items-center gap-3.5 rounded-[12px] px-3 py-[clamp(9px,2.2cqh,15px)] text-left transition hover:bg-white/[0.04]"
                >
                  <Icon
                    size={22}
                    strokeWidth={1.6}
                    aria-hidden="true"
                    className="shrink-0 text-white/85"
                  />
                  <span className="min-w-0 flex-1">
                    <span
                      id={`onboarding-${key}`}
                      className="block text-[14px] font-semibold text-white"
                    >
                      {label}
                    </span>
                    <span className="block truncate text-[14px] text-white/50">
                      {help}
                    </span>
                  </span>
                  <span
                    aria-hidden="true"
                    className={clsx(
                      'relative h-[28px] w-[48px] shrink-0 rounded-full transition',
                      draft[key]
                        ? 'bg-[rgb(var(--orbit-fire-via))] shadow-[0_0_12px_rgb(var(--orbit-fire-via)/0.45)]'
                        : 'bg-white/20',
                    )}
                  >
                    <span
                      className={clsx(
                        'absolute top-[3px] size-[22px] rounded-full bg-white shadow transition-[left]',
                        draft[key] ? 'left-[23px]' : 'left-[3px]',
                      )}
                    />
                  </span>
                </Focusable>
              </li>
            ))}
          </ul>
        </section>

        <section
          aria-labelledby="onboarding-paths"
          className={clsx(ONBOARDING_PANEL, 'flex flex-col px-4 py-3.5')}
        >
          <div className="flex items-center gap-3.5 px-1">
            <FolderOpen
              size={24}
              strokeWidth={1.5}
              aria-hidden="true"
              className="text-white/85"
            />
            <div>
              <h2 id="onboarding-paths" className="text-[17px] font-semibold text-white">
                Library Paths
              </h2>
              <p className="text-[14px] text-white/50">
                Where Orbit will look for your games.
              </p>
            </div>
          </div>
          <ul className="mt-3 space-y-2">
            <li className="flex items-center gap-3 rounded-[11px] border border-white/10 bg-white/[0.04] px-4 py-3 text-[15px]">
              <Folder size={17} aria-hidden="true" className="text-white/55" />
              <span className="flex-1 truncate">Steam libraries</span>
              <span className={clsx(BADGE, BADGE_HOT)}>Default</span>
            </li>
            {library.paths.map((path, index) => (
              <li
                key={path}
                className="flex items-center gap-3 rounded-[11px] border border-white/10 bg-white/[0.04] px-4 py-2 text-[15px]"
              >
                <Folder size={17} aria-hidden="true" className="text-white/55" />
                <span className="flex-1 truncate" title={path}>
                  {displayPath(path)}
                </span>
                <Focusable
                  focusId={`onboarding-path-remove-${index}`}
                  group="onboarding"
                  order={10 + index}
                  noScale
                  noRing
                  aria-label={`Remove ${path}`}
                  disabled={library.saving}
                  onClick={() => library.remove(path)}
                  className="grid size-7 place-items-center rounded-full text-white/60 hover:bg-white/10 hover:text-white"
                >
                  <X size={14} aria-hidden="true" />
                </Focusable>
              </li>
            ))}
          </ul>
          <Focusable
            focusId="onboarding-path-add"
            group="onboarding"
            order={10 + library.paths.length}
            noScale
            noRing
            disabled={!library.loaded || library.saving}
            onClick={() => void library.browse('Choose a folder with games')}
            className={buttonClass({
              variant: 'secondary',
              className: 'mt-4 self-start bg-white/[0.07] px-5 text-[15px] font-medium',
            })}
          >
            <Plus size={16} aria-hidden="true" /> Add Path
          </Focusable>
          {library.error && (
            <p role="alert" className="mt-2 text-[14px] text-rose-300">
              {library.error}
            </p>
          )}
        </section>
      </div>
      {error && (
        <p role="alert" className="mt-3 text-center text-[14px] text-rose-300">
          {error}
        </p>
      )}
      <OnboardingFooter
        onBack={onBack}
        primary={{
          label: 'Continue',
          onClick: () => void save(),
          busy: saving,
        }}
      />
    </>
  )
}
