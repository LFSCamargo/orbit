import { clsx } from 'clsx'
import { Focusable } from '@/components/focus/Focusable'
import { buttonClass } from '@/components/ui/button'
import type { AppPreferences } from '@/lib/appPreferences'
import { usePreferencesStore } from '@/stores/preferences.store'
import { useUiStore } from '@/stores/ui.store'
import { AppUpdateSettings } from './AppUpdateSettings'
import { ROW_DESC, ROW_TITLE, SETTINGS_ROW } from './settingsRowStyles'

const TOGGLES: { key: keyof AppPreferences; title: string; description: string }[] = [
  {
    key: 'scanOnStartup',
    title: 'Scan for new games on startup',
    description:
      'Quietly look for new Steam, Windows Steam and Mac games each time Orbit opens.',
  },
  {
    key: 'autoUpdateRuntimes',
    title: 'Update runtimes automatically',
    description:
      'Download newer versions of installed compatibility components at startup. The recommended Wine stays pinned.',
  },
  {
    key: 'autoUpdateApp',
    title: 'Update Orbit automatically',
    description:
      'Download new Orbit versions from GitHub in the background. Orbit asks before restarting, never during a game.',
  },
]

/** Startup behaviour and the onboarding replay in Settings → General. */
export function GeneralPreferences() {
  const preferences = usePreferencesStore((s) => s.preferences)
  const update = usePreferencesStore((s) => s.update)
  const openOnboarding = useUiStore((s) => s.openOnboarding)

  return (
    <div className="flex flex-col gap-6">
      {TOGGLES.map(({ key, title, description }, index) => (
        <div key={key} className={SETTINGS_ROW}>
          <div>
            <h3 id={`pref-${key}-label`} className={ROW_TITLE}>
              {title}
            </h3>
            <p id={`pref-${key}-help`} className={ROW_DESC}>
              {description}
            </p>
          </div>
          {/* A Focusable switch (not Radix) so it has a stable id: the first
              one is where controller focus enters Settings. */}
          <Focusable
            focusId={`settings-pref-${key}`}
            group="settings"
            order={index}
            noScale
            noRing
            role="switch"
            aria-checked={preferences[key]}
            aria-labelledby={`pref-${key}-label`}
            aria-describedby={`pref-${key}-help`}
            onClick={() => void update({ [key]: !preferences[key] })}
            className={clsx(
              'inline-flex h-5 w-9 shrink-0 items-center rounded-full border-2 border-transparent shadow-sm transition-colors',
              preferences[key] ? 'bg-orbit-accent' : 'bg-white/20',
            )}
          >
            <span
              aria-hidden="true"
              className={clsx(
                'block size-4 rounded-full bg-white shadow-lg transition-transform',
                preferences[key] ? 'translate-x-4' : 'translate-x-0',
              )}
            />
          </Focusable>
        </div>
      ))}
      <AppUpdateSettings order={TOGGLES.length} />
      <div className={SETTINGS_ROW}>
        <div>
          <h3 className={ROW_TITLE}>Onboarding</h3>
          <p className={ROW_DESC}>
            Walk through setup again: components, accounts, recommended settings and a
            game scan.
          </p>
        </div>
        <Focusable
          focusId="settings-show-onboarding"
          group="settings"
          order={TOGGLES.length + 1}
          noScale
          noRing
          onClick={openOnboarding}
          className={buttonClass({ variant: 'secondary' })}
        >
          Show onboarding
        </Focusable>
      </div>
    </div>
  )
}
