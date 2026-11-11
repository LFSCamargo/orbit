import { useEffect, useMemo, useRef, type CSSProperties, type ReactNode } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import {
  House,
  Library,
  Search,
  Settings,
  Plus,
  ChevronLeft,
  Maximize2,
  Minimize2,
} from 'lucide-react'
import type { ControllerFamily } from '@/controllers/ControllerMapping'
import { glyphFor } from '@/controllers/ControllerGlyphs'
import { Focusable } from '@/components/focus/Focusable'
import { LiquidGlass } from '@/components/ui/liquid-glass'
import { useUiStore } from '@/stores/ui.store'
import { resolveNavScreen, backTarget, focusRestoreId } from '@/lib/navigation'
import { focusManager } from '@/controllers/FocusManager'
import { glassTint } from '@/lib/backdropLighting'
import { useBackdropTransition } from '@/hooks/useBackdropTransition'
import { homeHero } from '@/modules/home/lib/homeHero'
import { ShellBackdrop } from './ShellBackdrop'
import { useActiveTheme } from '@/hooks/useActiveTheme'
import { useGames } from '@/hooks/useGames'
import { artworkPreview } from '@/lib/artwork'
import { isBrandedTheme } from '@/themes/catalog'
import { OrbitMark, ThemeBrand } from '@/themes/ThemeBrand'
import './macos.css'

const items = [
  { id: 'home', label: 'Play', icon: House },
  { id: 'library', label: 'Library', icon: Library },
  { id: 'search', label: 'Search', icon: Search },
  { id: 'settings', label: 'Settings', icon: Settings },
] as const

export function MacosShell({
  children,
  family,
}: {
  children: ReactNode
  family: ControllerFamily
}) {
  const screen = useUiStore((s) => s.screen)
  const previous = useUiStore((s) => s.previousScreen)
  const navigate = useUiStore((s) => s.setScreen)
  const addGame = useUiStore((s) => s.openAddGame)
  const fullscreen = useUiStore((s) => s.fullscreen)
  const setFullscreen = useUiStore((s) => s.setFullscreen)
  const selected = resolveNavScreen(screen)
  const reduce = useReducedMotion()
  const theme = useActiveTheme()
  const branded = isBrandedTheme(theme)
  const heroGameId = useUiStore((s) => s.heroGameId)
  const { data: games = [] } = useGames()
  const heroGame = useMemo(
    () => (screen === 'home' ? homeHero(games, heroGameId) : undefined),
    [games, heroGameId, screen],
  )
  const backdrop = useBackdropTransition(heroGame, theme.branding?.wallpaper)
  const paintedImage = backdrop.active ?? (reduce ? null : backdrop.outgoing)
  const glassStyle = paintedImage
    ? ({ '--glass-backdrop-tint': glassTint(paintedImage.lighting) } as CSSProperties)
    : undefined
  const heroLogo = heroGame ? artworkPreview(heroGame.artwork, 'logo') : undefined
  const pendingFocus = useRef<{ screen: string; id: string } | null>(null)
  useEffect(() => {
    const pending = pendingFocus.current
    if (!pending || pending.screen !== screen) return
    let frame = 0
    let attempts = 0
    // Route exit animations finish before the destination's focusables register.
    const restore = () => {
      focusManager.setFocus(pending.id)
      if (focusManager.getFocusedId() === pending.id || ++attempts >= 90) {
        pendingFocus.current = null
      } else frame = requestAnimationFrame(restore)
    }
    frame = requestAnimationFrame(restore)
    return () => {
      cancelAnimationFrame(frame)
      if (pendingFocus.current === pending) pendingFocus.current = null
    }
  }, [screen])
  return (
    <div
      className="macos-shell"
      data-macos-shell
      data-console-home={screen === 'home'}
      data-fullscreen={fullscreen}
      data-wallpaper={Boolean(theme.branding?.wallpaper)}
      style={glassStyle}
    >
      <div className="macos-wallpaper" aria-hidden>
        <span />
        <span />
      </div>
      <ShellBackdrop backdrop={backdrop} reducedMotion={Boolean(reduce)} />
      <header className="macos-console-header">
        <div className="macos-brand">
          {screen === 'home' && heroLogo && !branded ? (
            <img
              src={heroLogo}
              alt=""
              className="macos-header-game-logo"
              aria-hidden="true"
              draggable={false}
            />
          ) : (
            <ThemeBrand branding={theme.branding} />
          )}
        </div>
        <LiquidGlass surface="toolbar" className="macos-navigation" radius={999}>
          <nav aria-label="Main navigation">
            {items.map(({ id, label, icon: Icon }, index) => (
              <Focusable
                key={id}
                focusId={`macos-nav-${id}`}
                group="macos-nav"
                order={index}
                noScale
                aria-current={selected === id ? 'page' : undefined}
                onClick={() => navigate(id)}
                className="macos-nav-link"
                aria-label={label}
              >
                {selected === id && (
                  <motion.span
                    layoutId="macos-selection"
                    className="macos-selection"
                    transition={{ duration: reduce ? 0 : 0.25 }}
                  />
                )}
                <Icon size={18} />
                <span>{label}</span>
              </Focusable>
            ))}
          </nav>
        </LiquidGlass>
        <LiquidGlass surface="toolbar" className="macos-utilities" radius={999}>
          <Focusable
            focusId="macos-toolbar-add"
            group="macos-tools"
            order={0}
            noScale
            onClick={addGame}
            aria-label="Add games"
            className="macos-tool"
          >
            <Plus size={20} />
          </Focusable>
          <Focusable
            focusId="macos-window-fullscreen"
            group="macos-tools"
            order={1}
            noScale
            onClick={() => setFullscreen(!fullscreen)}
            aria-label={fullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
            className="macos-tool"
          >
            {fullscreen ? <Minimize2 size={19} /> : <Maximize2 size={19} />}
          </Focusable>
        </LiquidGlass>
      </header>
      <main className="macos-main">
        {!items.some((item) => item.id === screen) && (
          <div className="macos-route-back">
            <Focusable
              focusId="macos-back"
              group="macos-back"
              order={0}
              noScale
              onClick={() => {
                const target = backTarget(screen, previous)
                if (screen === 'game-details') {
                  const id = focusRestoreId(target, useUiStore.getState().selectedGameId)
                  if (id) pendingFocus.current = { screen: target, id }
                }
                navigate(target)
              }}
              className="macos-back"
            >
              <ChevronLeft size={18} />
              Back
            </Focusable>
          </div>
        )}
        {children}
      </main>
      <footer className="macos-console-footer">
        <span>{theme.branding?.tagline ?? 'Your collection. Your escape.'}</span>
        {branded && <OrbitMark />}
        <span>
          <kbd>{glyphFor(family, 'confirm')}</kbd> Select{' '}
          <kbd>{glyphFor(family, 'back')}</kbd> Back{' '}
          <span className="macos-section-hint">LB / RB · Sections</span>
        </span>
      </footer>
    </div>
  )
}
