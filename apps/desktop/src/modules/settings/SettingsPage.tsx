import type { ReactNode } from 'react'
import { LayoutGrid, Library, Palette, Clock, Plus, Play, ArrowRight } from 'lucide-react'
import { Focusable } from '@/components/focus/Focusable'
import { LiquidGlass } from '@/components/ui/liquid-glass'
import { useFullscreen } from '@/hooks/useFullscreen'
import { useGames } from '@/hooks/useGames'
import { useActiveTheme } from '@/hooks/useActiveTheme'
import { gameTileImage } from '@/lib/artwork'
import { useUiStore, type SettingsTab } from '@/stores/ui.store'
import { ThemePage } from '@/themes/ThemePage'
import { ImportsSection } from '@/modules/imports/ImportsPage'
import { ApiKeySettings } from '@/modules/settings/components/ApiKeySettings'
import { LibrarySettings } from '@/modules/settings/components/LibrarySettings'
import { ThemeSettings } from '@/modules/settings/components/ThemeSettings'

const TABS: { id: SettingsTab; label: string; icon: typeof LayoutGrid }[] = [
  { id: 'general', label: 'General', icon: LayoutGrid },
  { id: 'themes', label: 'Themes', icon: Palette },
  { id: 'library', label: 'Library', icon: Library },
]

function formatPlaytime(seconds: number): string {
  const hours = Math.floor(seconds / 3600)
  if (hours < 1) return `${Math.floor(seconds / 60)}m`
  return `${hours}h`
}

export function SettingsPage() {
  const { fullscreen, setFullscreen } = useFullscreen()
  const activeTab = useUiStore((s) => s.settingsTab)
  const setActiveTab = useUiStore((s) => s.setSettingsTab)

  return (
    <ThemePage title="Settings" subtitle="Preferences, themes, and library management.">
      <div className="settings-layout">
        <LiquidGlass className="settings-tabs" radius={24}>
          <nav aria-label="Settings sections">
            {TABS.map(({ id, label, icon: Icon }, index) => (
              <Focusable
                key={id}
                focusId={`settings-tab-${id}`}
                group="settings-nav"
                order={index}
                noScale
                noRing
                aria-pressed={activeTab === id}
                onClick={() => setActiveTab(id)}
                className={`settings-tab orbit-glass-control w-full text-left ${activeTab === id ? 'settings-tab-active' : ''}`}
              >
                <Icon size={16} />
                {label}
              </Focusable>
            ))}
          </nav>
        </LiquidGlass>

        <LiquidGlass className="settings-content" radius={24}>
          <main className="settings-content-scroll" aria-live="polite">
            {activeTab === 'general' && (
              <div className="settings-view" data-testid="settings-general-view">
                <section className="settings-panel">
                  <div className="settings-panel-header">
                    <LayoutGrid size={18} />
                    <h2>General</h2>
                  </div>
                  <SettingsCard>
                    <div className="settings-row">
                      <div>
                        <h3 className="settings-row-title">Fullscreen</h3>
                        <p className="settings-row-desc">
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
                <section className="settings-panel">
                  <div className="settings-panel-header">
                    <LayoutGrid size={18} />
                    <h2>Metadata & artwork</h2>
                  </div>
                  <SettingsCard>
                    <ApiKeySettings />
                  </SettingsCard>
                </section>
              </div>
            )}

            {activeTab === 'themes' && (
              <section className="settings-panel" data-testid="settings-themes-view">
                <div className="settings-panel-header">
                  <Palette size={18} />
                  <h2>Themes</h2>
                </div>
                <SettingsCard>
                  <ThemeSettings />
                </SettingsCard>
              </section>
            )}

            {activeTab === 'library' && (
              <div className="settings-view" data-testid="settings-library-view">
                <section className="settings-panel">
                  <div className="settings-panel-header">
                    <Library size={18} />
                    <h2>Library</h2>
                  </div>
                  <SettingsCard>
                    <ImportsSection />
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

function SettingsInsights() {
  const theme = useActiveTheme()
  const { data: games = [] } = useGames()
  const openGameDetails = useUiStore((s) => s.openGameDetails)
  const openAddGame = useUiStore((s) => s.openAddGame)
  const setScreen = useUiStore((s) => s.setScreen)
  const visibleGames = games.filter((game) => !game.hidden)
  const recentGame = visibleGames.reduce<(typeof visibleGames)[number] | undefined>(
    (latest, game) => {
      if (!game.lastPlayedAt) return latest
      if (!latest?.lastPlayedAt) return game
      return game.lastPlayedAt > latest.lastPlayedAt ? game : latest
    },
    undefined,
  )
  const recentCover = recentGame ? gameTileImage(recentGame.artwork, 'square') : undefined

  return (
    <LiquidGlass className="settings-insights" radius={24}>
      <section
        className="settings-insight-section"
        aria-labelledby="settings-active-theme"
      >
        <p className="settings-insight-eyebrow">ACTIVE THEME</p>
        <h2 id="settings-active-theme" className="settings-insight-title">
          {theme.name}
        </h2>
        <div className="settings-theme-swatches" aria-label="Active theme colors">
          {[theme.colors.canvas, theme.colors.accent, theme.colors.focus].map((color) => (
            <span key={color} style={{ background: `rgb(${color})` }} />
          ))}
        </div>
      </section>

      {recentGame && (
        <section
          className="settings-insight-section"
          aria-labelledby="settings-last-played"
        >
          <p className="settings-insight-eyebrow">JUMP BACK IN</p>
          {recentCover && (
            <img className="settings-recent-cover" src={recentCover} alt="" />
          )}
          <h2 id="settings-last-played" className="settings-insight-title">
            {recentGame.title}
          </h2>
          <p className="settings-insight-copy">
            <Clock size={13} />
            {formatPlaytime(recentGame.totalPlaytimeSeconds)} played
          </p>
          <Focusable
            focusId="settings-recent-game"
            group="settings-insights"
            order={0}
            noScale
            onClick={() => openGameDetails(recentGame.id)}
            className="settings-insight-action orbit-glass-control"
          >
            <Play size={14} fill="currentColor" />
            View game
            <ArrowRight size={14} />
          </Focusable>
        </section>
      )}

      <section
        className="settings-insight-section"
        aria-labelledby="settings-quick-actions"
      >
        <p className="settings-insight-eyebrow" id="settings-quick-actions">
          QUICK ACTIONS
        </p>
        <Focusable
          focusId="settings-quick-add"
          group="settings-insights"
          order={1}
          noScale
          onClick={openAddGame}
          className="settings-insight-action orbit-glass-control"
        >
          <Plus size={15} />
          Add a game
        </Focusable>
        <Focusable
          focusId="settings-quick-library"
          group="settings-insights"
          order={2}
          noScale
          onClick={() => setScreen('library')}
          className="settings-insight-action orbit-glass-control"
        >
          <Library size={15} />
          Browse library
          <ArrowRight size={14} />
        </Focusable>
      </section>
    </LiquidGlass>
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
      <div className="settings-card-inner">{children}</div>
    </div>
  )
}
