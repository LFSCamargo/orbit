import { useSettingsControllerFocus } from './hooks/useSettingsControllerFocus'
import { AnimatedSettingsNav } from '@/components/ui/animated-settings-nav'
import { CompatibilityGlobalSettings } from './components/CompatibilityGlobalSettings'
import { RuntimeSettings } from './components/RuntimeSettings'
import { SettingsInsights } from './components/SettingsInsights'
import type { ReactNode } from 'react'
import { clsx } from 'clsx'
import { LayoutGrid, Library, Palette, Play, Monitor, Gamepad2 } from 'lucide-react'
import { Focusable } from '@/components/focus/Focusable'
import { LiquidGlass } from '@/components/ui/liquid-glass'
import { useFullscreen } from '@/hooks/useFullscreen'
import { useUiStore, type SettingsTab } from '@/stores/ui.store'
import { ThemePage } from '@/themes/ThemePage'
import { ApiKeySettings } from '@/modules/settings/components/ApiKeySettings'
import { LibrarySettings } from '@/modules/settings/components/LibrarySettings'
import { SteamLibraryFolders } from '@/modules/settings/components/SteamLibraryFolders'
import { SteamSettings } from '@/modules/settings/components/SteamSettings'
import { ThemeSettings } from '@/modules/settings/components/ThemeSettings'

const TABS: { id: SettingsTab; label: string; icon: typeof LayoutGrid }[] = [
  { id: 'general', label: 'General', icon: LayoutGrid },
  { id: 'themes', label: 'Themes', icon: Palette },
  { id: 'library', label: 'Library', icon: Library },
  { id: 'steam', label: 'Steam', icon: Gamepad2 },
  { id: 'graphics', label: 'Game graphics', icon: Monitor },
  { id: 'runtimes', label: 'Compatibility', icon: Play },
]

const SETTINGS_LAYOUT = clsx(
  'settings-layout grid h-full min-h-0 w-full flex-1 grid-rows-[minmax(0,1fr)] items-stretch !gap-[18px] [&>*]:min-w-0',
  'max-[520px]:grid-cols-1 max-[520px]:grid-rows-[auto_minmax(0,1fr)]',
  'max-[1179px]:grid-cols-[minmax(140px,22fr)_minmax(0,78fr)]',
  'min-[1180px]:grid-cols-[clamp(144px,12vw,190px)_minmax(0,1fr)_clamp(178px,15vw,235px)]',
)

const SETTINGS_TABS = clsx(
  'settings-tabs flex min-h-0 flex-col justify-between !px-2.5 !py-3.5',
  'max-[520px]:!p-1.5',
)

const SETTINGS_CONTENT = clsx(
  'settings-content relative h-full min-h-0 overflow-hidden rounded-[24px]',
  'max-[520px]:rounded-[18px]',
)

const SETTINGS_SCROLL = clsx(
  'settings-content-scroll h-full overflow-x-hidden overflow-y-auto overscroll-contain',
  '!p-[clamp(18px,2.5vw,36px)] [scroll-padding:24px]',
  '![mask-image:none] ![-webkit-mask-image:none]',
  '[scrollbar-color:#ffffff25_transparent] [scrollbar-width:thin]',
  'max-[520px]:!p-[18px]',
)

const PANEL =
  'settings-panel scroll-mt-0 [&+.settings-panel]:mt-0 [&+.settings-panel]:pt-0'
const PANEL_HEADER =
  'settings-panel-header !mb-6 flex !flex-col !items-start !gap-2 !p-0 text-orbit-foreground'
const PANEL_TITLE =
  'settings-panel-title flex items-center gap-2.5 [&>svg]:shrink-0 [&>svg]:text-orbit-accent'
const PANEL_H2 =
  '!m-0 !text-[clamp(22px,2vw,28px)] !font-semibold !leading-none !tracking-[-0.035em] !normal-case'
const SETTINGS_VIEW = 'settings-view flex flex-col gap-7'
const CARD_INNER = 'settings-card-inner !px-0 !py-5'
const ROW_TITLE = 'settings-row-title font-display text-[17px] font-semibold text-white'
const ROW_DESC = 'settings-row-desc mt-1 max-w-[520px] text-[13px] text-[#ffffffa0]'
const SETTINGS_ROW =
  'settings-row flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between'

export function SettingsPage() {
  const controllerRoot = useSettingsControllerFocus()
  const { fullscreen, setFullscreen } = useFullscreen()
  const activeTab = useUiStore((s) => s.settingsTab)
  const setActiveTab = useUiStore((s) => s.setSettingsTab)
  const setScreen = useUiStore((s) => s.setScreen)
  const tab = TABS.some((item) => item.id === activeTab) ? activeTab : 'general'

  return (
    <ThemePage
      title="Settings"
      subtitle="Preferences, themes, and library management."
      className="flex h-full min-h-0 flex-1 flex-col overflow-hidden pb-3"
    >
      <div ref={controllerRoot} className={SETTINGS_LAYOUT}>
        <LiquidGlass className={SETTINGS_TABS} radius={24}>
          <div>
            <header className="settings-nav-heading px-3.5 pb-7 pt-3 max-[520px]:hidden">
              <p className="text-[10px] font-semibold tracking-[0.14em] text-orbit-muted">
                MAKE IT YOURS
              </p>
              <h1 className="mt-[7px] text-[25px] font-[650] tracking-[-0.04em]">
                Settings
              </h1>
            </header>
            <AnimatedSettingsNav items={TABS} value={tab} onChange={setActiveTab} />
          </div>
          <p className="settings-nav-caption px-3.5 pb-2 pt-4 text-[11px] text-orbit-muted max-[520px]:hidden">
            Your games. Your setup.
          </p>
        </LiquidGlass>

        <LiquidGlass className={SETTINGS_CONTENT} radius={24}>
          <main className={SETTINGS_SCROLL}>
            <p className="settings-breadcrumb mb-[22px] mt-0.5 text-[10px] font-semibold tracking-[0.14em] text-orbit-muted max-[520px]:mb-4">
              SETTINGS / {TABS.find((item) => item.id === tab)?.label.toUpperCase()}
            </p>
            {tab === 'general' && (
              <div className={SETTINGS_VIEW} data-testid="settings-general-view">
                <section className={PANEL}>
                  <div className={PANEL_HEADER}>
                    <div className={PANEL_TITLE}>
                      <LayoutGrid size={20} />
                      <h2 className={PANEL_H2}>General</h2>
                    </div>
                  </div>
                  <SettingsCard>
                    <div className={SETTINGS_ROW}>
                      <div>
                        <h3 className={ROW_TITLE}>Fullscreen</h3>
                        <p className={ROW_DESC}>
                          Borderless fullscreen suited for couch play. Toggle with F11.
                        </p>
                      </div>
                      <Focusable
                        focusId="settings-fullscreen"
                        group="settings"
                        order={0}
                        noScale
                        noRing
                        onClick={() => setFullscreen(!fullscreen)}
                        className="rounded-card bg-orbit-accent px-5 py-2.5 text-sm font-semibold text-orbit-canvas"
                      >
                        {fullscreen ? 'On' : 'Off'}
                      </Focusable>
                    </div>
                  </SettingsCard>
                </section>
                <section className={PANEL}>
                  <div className={PANEL_HEADER}>
                    <div className={PANEL_TITLE}>
                      <LayoutGrid size={20} />
                      <h2 className={PANEL_H2}>Metadata & artwork</h2>
                    </div>
                  </div>
                  <SettingsCard>
                    <ApiKeySettings />
                  </SettingsCard>
                </section>
              </div>
            )}

            {tab === 'graphics' && (
              <section className={PANEL}>
                <div className={PANEL_HEADER}>
                  <div className={PANEL_TITLE}>
                    <Monitor size={20} />
                    <h2 className={PANEL_H2}>Default game graphics</h2>
                  </div>
                  <p className="m-0 text-[13px] font-normal leading-[1.6] text-orbit-muted">
                    One starting point for all your Windows games.
                  </p>
                </div>
                <CompatibilityGlobalSettings />
              </section>
            )}

            {tab === 'runtimes' && <RuntimeSettings />}

            {tab === 'themes' && (
              <section className={PANEL} data-testid="settings-themes-view">
                <div className={PANEL_HEADER}>
                  <div className={PANEL_TITLE}>
                    <Palette size={20} />
                    <h2 className={PANEL_H2}>Themes</h2>
                  </div>
                </div>
                <SettingsCard>
                  <ThemeSettings />
                </SettingsCard>
              </section>
            )}

            {tab === 'steam' && <SteamSettings />}

            {tab === 'library' && (
              <div className={SETTINGS_VIEW} data-testid="settings-library-view">
                <section className={PANEL}>
                  <div className={PANEL_HEADER}>
                    <div className={PANEL_TITLE}>
                      <Library size={20} />
                      <h2 className={PANEL_H2}>Library</h2>
                    </div>
                  </div>
                  <SettingsCard>
                    <SteamLibraryFolders />
                  </SettingsCard>
                  <SettingsCard className="mt-4">
                    <Focusable
                      focusId="imports-switch-library"
                      group="settings-library"
                      order={20}
                      noScale
                      onClick={() => setScreen('switch-library')}
                      className="block rounded-card bg-white/5 p-5 text-left"
                    >
                      <h3 className="font-display text-lg font-semibold">
                        Switch content visualizer
                      </h3>
                      <p className="mt-2 text-sm text-orbit-muted">
                        See base games, updates, and DLC for titles already in your
                        library.
                      </p>
                    </Focusable>
                  </SettingsCard>
                  <SettingsCard className="mt-4">
                    <LibrarySettings />
                  </SettingsCard>
                </section>
              </div>
            )}
          </main>
        </LiquidGlass>

        <SettingsInsights />
      </div>
    </ThemePage>
  )
}

function SettingsCard({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div className={className}>
      <div className={CARD_INNER}>{children}</div>
    </div>
  )
}
