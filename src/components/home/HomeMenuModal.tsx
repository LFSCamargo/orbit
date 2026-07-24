import { useEffect, useMemo } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Home, LayoutGrid, LogOut, Play, Settings, Square, X } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Focusable } from '@/components/focus/Focusable'
import type { ControllerFamily } from '@/controllers/ControllerMapping'
import { glyphFor } from '@/controllers/ControllerGlyphs'
import { useModalFocus } from '@/hooks/useModalFocus'
import { useGameActions } from '@/hooks/useGames'
import { hideOrbitWindow, quitOrbit } from '@/lib/tauri'
import { useSessionStore } from '@/stores/session.store'
import { useUiStore } from '@/stores/ui.store'
import { useThemeLayout } from '@/themes/useThemeLayout'
import type { AppScreen } from '@/types/game'

interface MenuItem {
  id: string
  label: string
  description: string
  icon: LucideIcon
  tone?: 'danger'
  action: () => void
}

export function HomeMenuModal({ family }: { family: ControllerFamily }) {
  const open = useUiStore((s) => s.homeMenuOpen)
  const closeHomeMenu = useUiStore((s) => s.closeHomeMenu)
  const setScreen = useUiStore((s) => s.setScreen)
  const activeSession = useSessionStore((s) => s.activeSession)
  const { stop } = useGameActions()
  const layout = useThemeLayout()

  const items = useMemo(() => {
    const navigate = (screen: AppScreen) => {
      setScreen(screen)
      closeHomeMenu()
    }

    if (activeSession) {
      return [
        {
          id: 'home-menu-resume',
          label: 'Return to game',
          description: 'Hide Orbit and keep playing',
          icon: Play,
          action: () => {
            closeHomeMenu()
            void hideOrbitWindow()
          },
        },
        {
          id: 'home-menu-stop',
          label: 'Stop game',
          description: 'End the current session',
          icon: Square,
          action: () => {
            closeHomeMenu()
            stop.mutate(activeSession.id)
          },
        },
        {
          id: 'home-menu-quit',
          label: 'Quit Orbit',
          description: 'Close the launcher',
          icon: LogOut,
          tone: 'danger' as const,
          action: () => {
            closeHomeMenu()
            void quitOrbit()
          },
        },
      ] satisfies MenuItem[]
    }

    return [
      {
        id: 'home-menu-continue',
        label: 'Continue',
        description: 'Return to what you were doing',
        icon: Play,
        action: closeHomeMenu,
      },
      {
        id: 'home-menu-home',
        label: 'Home',
        description: 'Go to the main screen',
        icon: Home,
        action: () => navigate('home'),
      },
      {
        id: 'home-menu-library',
        label: 'Library',
        description: 'Browse your game collection',
        icon: LayoutGrid,
        action: () => navigate('library'),
      },
      {
        id: 'home-menu-settings',
        label: 'Settings',
        description: 'Themes, imports, and preferences',
        icon: Settings,
        action: () => navigate('settings'),
      },
      {
        id: 'home-menu-quit',
        label: 'Quit Orbit',
        description: 'Close the launcher',
        icon: LogOut,
        tone: 'danger' as const,
        action: () => {
          closeHomeMenu()
          void quitOrbit()
        },
      },
    ] satisfies MenuItem[]
  }, [activeSession, closeHomeMenu, setScreen, stop])

  useModalFocus(open, 'home-menu', items[0]?.id ?? 'home-menu-continue')

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopImmediatePropagation()
        closeHomeMenu()
      }
    }
    window.addEventListener('keydown', onKeyDown, { capture: true })
    return () => window.removeEventListener('keydown', onKeyDown, { capture: true })
  }, [open, closeHomeMenu])

  const shellClass =
    layout === 'switch'
      ? 'text-[var(--switch-ink)]'
      : layout === 'ps5'
        ? 'text-[var(--ps5-ink)]'
        : 'text-orbit-foreground'

  const panelClass =
    layout === 'switch'
      ? 'rounded-[2rem] border border-[var(--switch-border)] bg-[var(--switch-surface)]'
      : layout === 'ps5'
        ? 'rounded-[1.75rem] border border-[var(--ps5-border)] bg-[var(--ps5-panel)]'
        : 'orbit-panel rounded-theme'

  const mutedClass =
    layout === 'switch'
      ? 'text-[var(--switch-muted)]'
      : layout === 'ps5'
        ? 'text-[var(--ps5-muted)]'
        : 'text-orbit-muted'

  const accentClass =
    layout === 'switch'
      ? 'bg-[#ff4d6d] text-white'
      : layout === 'ps5'
        ? 'bg-white/15 text-white'
        : 'bg-orbit-accent text-orbit-canvas'

  const confirmGlyph = glyphFor(family, 'confirm')
  const backGlyph = glyphFor(family, 'back')

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/75 px-6 backdrop-blur-md"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={closeHomeMenu}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 18 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            className={`w-full max-w-md p-6 ${panelClass} ${shellClass}`}
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Orbit menu"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p
                  className={`text-xs font-semibold uppercase tracking-[0.2em] ${mutedClass}`}
                >
                  Orbit
                </p>
                <h2 className="mt-2 font-display text-2xl font-semibold tracking-tight">
                  Quick menu
                </h2>
                <p className={`mt-1 text-sm ${mutedClass}`}>Choose where to go next</p>
              </div>
              <Focusable
                focusId="home-menu-close"
                group="home-menu"
                order={items.length}
                onClick={closeHomeMenu}
                className={`inline-flex h-10 w-10 items-center justify-center rounded-full ${mutedClass} bg-white/5`}
                aria-label="Close menu"
              >
                <X className="h-5 w-5" />
              </Focusable>
            </div>

            <ul className="mt-6 space-y-2">
              {items.map((item, index) => {
                const Icon = item.icon
                const danger = item.tone === 'danger'
                return (
                  <li key={item.id}>
                    <Focusable
                      focusId={item.id}
                      group="home-menu"
                      order={index}
                      noRing
                      onClick={item.action}
                      className={`flex w-full items-center gap-4 rounded-card px-4 py-3.5 text-left transition-colors ${
                        danger
                          ? "[&[data-focused='true']]:bg-rose-500/20"
                          : "[&[data-focused='true']]:bg-white/10"
                      }`}
                    >
                      <span
                        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
                          danger ? 'bg-rose-500/15 text-rose-400' : accentClass
                        }`}
                      >
                        <Icon className="h-5 w-5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold">{item.label}</span>
                        <span className={`mt-0.5 block text-sm ${mutedClass}`}>
                          {item.description}
                        </span>
                      </span>
                    </Focusable>
                  </li>
                )
              })}
            </ul>

            <p className={`mt-5 text-center text-xs ${mutedClass}`}>
              {confirmGlyph} Select · {backGlyph} Close
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
