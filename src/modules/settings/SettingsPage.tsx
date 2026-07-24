import type { ReactNode } from 'react'
import { Focusable } from '@/components/focus/Focusable'
import { useFullscreen } from '@/hooks/useFullscreen'
import { useUiStore } from '@/stores/ui.store'
import { ThemePage } from '@/themes/ThemePage'
import { ImportsSection } from '@/modules/imports/ImportsPage'
import { ApiKeySettings } from '@/modules/settings/components/ApiKeySettings'
import { LibrarySettings } from '@/modules/settings/components/LibrarySettings'
import { ThemeSettings } from '@/modules/settings/components/ThemeSettings'

export function SettingsPage() {
  const { fullscreen, setFullscreen } = useFullscreen()
  const setScreen = useUiStore((s) => s.setScreen)

  return (
    <ThemePage
      title="Settings"
      subtitle="Controller-first launcher preferences, including fully customizable themes."
    >
      <div className="max-w-3xl space-y-4">
        <SettingRow
          title="Fullscreen"
          description="Borderless fullscreen suited for couch play. Toggle with F11."
          action={
            <Focusable
              focusId="settings-fullscreen"
              group="settings"
              order={0}
              noScale
              noRing
              onClick={() => setFullscreen(!fullscreen)}
              className="rounded-card bg-orbit-accent px-4 py-2 text-sm font-semibold text-orbit-canvas"
            >
              {fullscreen ? 'On' : 'Off'}
            </Focusable>
          }
        />

        <ThemeSettings />

        <ImportsSection />

        <ApiKeySettings />

        <LibrarySettings />

        <SettingRow
          title="Back to Home"
          description="Return to the cinematic home rows."
          action={
            <Focusable
              focusId="settings-home"
              group="settings"
              order={30}
              noScale
              noRing
              onClick={() => setScreen('home')}
              className="rounded-card bg-white/10 px-4 py-2 text-sm"
            >
              Home
            </Focusable>
          }
        />
      </div>
    </ThemePage>
  )
}

function SettingRow({
  title,
  description,
  action,
}: {
  title: string
  description: string
  action: ReactNode
}) {
  return (
    <div className="orbit-panel flex items-center justify-between gap-6 rounded-theme p-5">
      <div>
        <h2 className="font-display text-xl font-semibold">{title}</h2>
        <p className="mt-1 text-sm text-orbit-muted">{description}</p>
      </div>
      {action}
    </div>
  )
}
