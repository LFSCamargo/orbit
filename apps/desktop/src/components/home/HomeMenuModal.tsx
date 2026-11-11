import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Home, LayoutGrid, LogOut, Play, Settings, Square, X } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Focusable } from '@/components/focus/Focusable'
import type { ControllerFamily } from '@/controllers/ControllerMapping'
import { glyphFor } from '@/controllers/ControllerGlyphs'
import { useModalFocus } from '@/hooks/useModalFocus'
import { useGame, useGameActions } from '@/hooks/useGames'
import { hideOrbitWindow, quitOrbit } from '@/lib/tauri'
import { useSessionStore } from '@/stores/session.store'
import { useUiStore } from '@/stores/ui.store'
import { SessionArtwork } from '@/components/session/SessionArtwork'
import { formatPlaytime } from '@/lib/format'
import '@/components/session/session.css'
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
  const { data: game } = useGame(activeSession?.gameId ?? null)
  const reduce = useReducedMotion()
  const dialogRef = useRef<HTMLDivElement>(null)
  const [actionError, setActionError] = useState<string | null>(null)

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
            setActionError(null)
            void hideOrbitWindow()
              .then(closeHomeMenu)
              .catch(() =>
                setActionError('Could not return to the game. Try selecting its window.'),
              )
          },
        },
        {
          id: 'home-menu-stop',
          label:
            activeSession.provider === 'gamehub' ? 'End session tracking' : 'Stop game',
          description:
            activeSession.provider === 'gamehub'
              ? 'Saves time; game and GameHub keep running'
              : 'Close the game and save session time',
          tone: 'danger' as const,
          icon: Square,
          action: () => {
            stop.mutate(activeSession.id, { onSuccess: closeHomeMenu })
          },
        },
        {
          id: 'home-menu-quit',
          label: 'Quit Orbit',
          description: 'Close the launcher',
          icon: LogOut,
          tone: 'danger' as const,
          action: () => {
            void quitOrbit().catch(() =>
              setActionError('Could not quit Orbit. Try the application menu.'),
            )
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
          void quitOrbit().catch(() =>
            setActionError('Could not quit Orbit. Try the application menu.'),
          )
        },
      },
    ] satisfies MenuItem[]
  }, [activeSession, closeHomeMenu, setScreen, stop])

  useModalFocus(open, 'home-menu', items[0]?.id ?? 'home-menu-continue')

  useEffect(() => {
    if (!open) return
    setActionError(null)
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.isComposing || event.keyCode === 229) return
      if (event.key === 'Tab') {
        const controls = dialogRef.current?.querySelectorAll<HTMLButtonElement>(
          'button:not(:disabled)',
        )
        if (controls?.length) {
          const first = controls[0],
            last = controls[controls.length - 1]
          if (
            event.shiftKey &&
            (document.activeElement === first ||
              !dialogRef.current?.contains(document.activeElement))
          ) {
            event.preventDefault()
            last.focus()
          } else if (
            !event.shiftKey &&
            (document.activeElement === last ||
              !dialogRef.current?.contains(document.activeElement))
          ) {
            event.preventDefault()
            first.focus()
          }
        }
      }
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopImmediatePropagation()
        closeHomeMenu()
      }
    }
    window.addEventListener('keydown', onKeyDown, { capture: true })
    return () => window.removeEventListener('keydown', onKeyDown, { capture: true })
  }, [open, closeHomeMenu])

  useEffect(() => {
    if (!open) return
    const previous = document.activeElement as HTMLElement | null
    const frame = requestAnimationFrame(() =>
      dialogRef.current?.querySelector<HTMLButtonElement>('li button')?.focus(),
    )
    return () => {
      cancelAnimationFrame(frame)
      if (previous?.isConnected) previous.focus()
    }
  }, [open])

  const confirmGlyph = glyphFor(family, 'confirm')
  const backGlyph = glyphFor(family, 'back')

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="quick-menu-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduce ? 0 : 0.2 }}
          onClick={closeHomeMenu}
        >
          <motion.div
            ref={dialogRef}
            initial={reduce ? false : { opacity: 0, scale: 0.97, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduce ? 0 : 0.25 }}
            className="quick-menu orbit-glass"
            data-theme="macos"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Orbit menu"
          >
            <header className="quick-menu-hero">
              <SessionArtwork game={activeSession ? game : null} />
              <div className="session-brand">
                <img src="/orbit.svg" alt="" />
                {activeSession ? 'SESSION CONTROLS' : 'MAKE YOURSELF AT HOME'}
              </div>
              <h2>
                {activeSession
                  ? (game?.title ?? 'Your game is running')
                  : 'A moment for you.'}
              </h2>
              <p>
                {activeSession
                  ? 'Your game is still running. Return when you’re ready.'
                  : 'Your games, your settings, your next adventure.'}
              </p>
              <Focusable
                focusId="home-menu-close"
                group="home-menu"
                order={items.length}
                noScale
                onClick={closeHomeMenu}
                className="quick-menu-close orbit-glass-control"
                aria-label="Close menu"
              >
                <X size={18} />
              </Focusable>
            </header>
            <ul className="quick-menu-list">
              {items.map((item, index) => {
                const Icon = item.icon
                const busy = item.id === 'home-menu-stop' && stop.isPending
                return (
                  <li key={item.id}>
                    <Focusable
                      focusId={item.id}
                      group="home-menu"
                      order={index}
                      noScale
                      disabled={stop.isPending}
                      onClick={item.action}
                      className={`session-action orbit-glass-control ${index === 0 ? 'session-action-primary' : ''} ${item.tone === 'danger' ? 'session-action-danger' : ''}`}
                    >
                      <Icon />
                      <span>
                        <strong>{busy ? 'Stopping…' : item.label}</strong>
                        <small>{item.description}</small>
                      </span>
                    </Focusable>
                  </li>
                )
              })}
            </ul>
            {(actionError || stop.error) && (
              <p role="alert" className="session-error px-6 pb-4">
                {actionError || String(stop.error)}
              </p>
            )}
            <footer className="quick-menu-hints">
              <span>
                {game && activeSession
                  ? `${formatPlaytime(game.totalPlaytimeSeconds)} total playtime`
                  : 'Always ready for one more game.'}
              </span>
              <span>
                <kbd>{confirmGlyph}</kbd>Select<kbd>{backGlyph}</kbd>Close
              </span>
            </footer>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
