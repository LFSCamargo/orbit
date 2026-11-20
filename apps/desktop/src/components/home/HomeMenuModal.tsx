import { useEffect, useMemo, useRef, useState, type ComponentType } from 'react'
import { clsx } from 'clsx'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Home, LayoutGrid, LogOut, Play, Settings, Square, Undo2, X } from 'lucide-react'
import { XboxIcon } from '@/components/brand/AccountIcons'
import { Focusable } from '@/components/focus/Focusable'
import type { ControllerFamily } from '@/controllers/ControllerMapping'
import { glyphFor } from '@/controllers/ControllerGlyphs'
import { useModalFocus } from '@/hooks/useModalFocus'
import { useOverlayBack } from '@/controllers/overlayStack'
import { useGame, useGameActions } from '@/hooks/useGames'
import { XBOX_CLOUD_ENABLED } from '@/lib/features'
import { hideOrbitWindow, openXboxCloud, quitOrbit } from '@/lib/tauri'
import { usePreferencesStore } from '@/stores/preferences.store'
import { useSessionStore } from '@/stores/session.store'
import { useUiStore } from '@/stores/ui.store'
import { useXcloudPlayerStore } from '@/stores/xcloudPlayer.store'
import { SessionArtwork } from '@/components/session/SessionArtwork'
import { formatPlaytime } from '@/lib/format'
import type { AppScreen } from '@/types/game'

interface MenuItem {
  id: string
  label: string
  description: string
  icon: ComponentType<{ className?: string }>
  tone?: 'danger'
  action: () => void
}

const sessionActionClass = clsx(
  'session-action orbit-glass-control flex w-full items-center gap-[15px] rounded-2xl border px-[18px] text-left text-orbit-foreground',
  'transition-[background,border-color] duration-200 disabled:opacity-50 motion-reduce:transition-none',
)

export function HomeMenuModal({ family }: { family: ControllerFamily }) {
  const open = useUiStore((s) => s.homeMenuOpen)
  const closeHomeMenu = useUiStore((s) => s.closeHomeMenu)
  const setScreen = useUiStore((s) => s.setScreen)
  const activeSession = useSessionStore((s) => s.activeSession)
  const cloudStream = useXcloudPlayerStore((s) => s.stream)
  const { stop } = useGameActions()
  const xboxCloudConnected =
    usePreferencesStore((s) => s.preferences.xboxCloudConnected) && XBOX_CLOUD_ENABLED
  const { data: game } = useGame(activeSession?.gameId ?? null)
  const reduce = useReducedMotion()
  const dialogRef = useRef<HTMLDivElement>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  useOverlayBack(open, closeHomeMenu)

  const items = useMemo(() => {
    const navigate = (screen: AppScreen) => {
      setScreen(screen)
      closeHomeMenu()
    }

    // A cloud game is paused behind this menu; the connection stays up.
    if (cloudStream) {
      const cloud = useXcloudPlayerStore.getState()
      return [
        {
          id: 'home-menu-cloud-continue',
          label: 'Continue',
          description: 'Go back into the game',
          icon: Play,
          action: () => {
            cloud.resume()
            closeHomeMenu()
          },
        },
        {
          id: 'home-menu-cloud-stop',
          label: 'Stop game',
          description: 'End the cloud stream',
          tone: 'danger' as const,
          icon: Square,
          action: () => {
            cloud.close()
            closeHomeMenu()
          },
        },
        {
          id: 'home-menu-cloud-orbit',
          label: 'Back to Orbit',
          description: 'Keep the game paused in the background',
          icon: Undo2,
          action: closeHomeMenu,
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
          label: 'Stop game',
          description: 'Close the game and save session time',
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
      ...(xboxCloudConnected
        ? [
            {
              id: 'home-menu-xbox',
              label: 'Xbox Cloud Gaming',
              description: 'Stream Game Pass games',
              icon: XboxIcon,
              action: () => {
                closeHomeMenu()
                void openXboxCloud().catch(() =>
                  setActionError('Could not open Xbox Cloud Gaming.'),
                )
              },
            },
          ]
        : []),
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
  }, [activeSession, cloudStream, closeHomeMenu, setScreen, stop, xboxCloudConnected])

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
          className={clsx(
            'quick-menu-overlay fixed inset-0 z-[120] flex items-center justify-center bg-[#050811b8] p-6 max-[700px]:p-4',
            '[@media(prefers-reduced-transparency:reduce)]:bg-[#050811ee]',
          )}
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
            className={clsx(
              'quick-menu orbit-glass relative isolate max-h-[calc(100dvh-48px)] w-full max-w-[800px] overflow-auto rounded-[30px] border border-[#ffffff35] bg-orbit-panel/60 text-orbit-foreground shadow-[0_16px_40px_#0005]',
              'max-[700px]:max-h-[calc(100dvh-32px)] motion-reduce:[&_*]:!transition-none',
            )}
            data-theme="macos"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Orbit menu"
          >
            <header
              className={clsx(
                'quick-menu-hero relative isolate min-h-[180px] overflow-hidden border-b border-[#ffffff15] bg-[linear-gradient(90deg,#070b13e0,#070b1355)] px-8 py-[30px]',
                'max-[700px]:min-h-[160px] max-[700px]:px-6 max-[700px]:py-[26px]',
              )}
            >
              <SessionArtwork game={activeSession ? game : null} className="opacity-50" />
              <div
                className={clsx(
                  'session-brand flex items-center gap-2.5 text-[11px] tracking-[0.22em] text-white/60',
                )}
              >
                <img src="/orbit.svg" alt="" className="size-7" />
                {activeSession || cloudStream
                  ? 'SESSION CONTROLS'
                  : 'MAKE YOURSELF AT HOME'}
              </div>
              <h2
                className={clsx(
                  'mt-3.5 max-w-[85%] font-display text-[30px] font-semibold leading-[1.15] tracking-[-0.045em] text-white max-[700px]:text-[26px]',
                )}
              >
                {cloudStream
                  ? cloudStream.title
                  : activeSession
                    ? (game?.title ?? 'Your game is running')
                    : 'A moment for you.'}
              </h2>
              <p className={clsx('mt-[9px] text-xs text-[#ffffff90]')}>
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
                className={clsx(
                  'quick-menu-close orbit-glass-control absolute right-5 top-5 grid size-9 place-items-center rounded-full bg-[#ffffff0c] text-[#ffffffa0]',
                )}
                aria-label="Close menu"
              >
                <X size={18} />
              </Focusable>
            </header>
            <ul
              className={clsx(
                'quick-menu-list grid grid-cols-2 gap-2.5 p-6 max-[700px]:grid-cols-1 max-[700px]:p-[18px]',
              )}
            >
              {items.map((item, index) => {
                const Icon = item.icon
                const busy = item.id === 'home-menu-stop' && stop.isPending
                const first = index === 0
                const last = index === items.length - 1
                return (
                  <li
                    key={item.id}
                    className={clsx(
                      first && 'col-span-full',
                      last && 'col-span-full mt-1 border-t border-[#ffffff10] pt-3.5',
                    )}
                  >
                    <Focusable
                      focusId={item.id}
                      group="home-menu"
                      order={index}
                      noScale
                      disabled={stop.isPending}
                      onClick={item.action}
                      className={clsx(
                        sessionActionClass,
                        last
                          ? 'border-transparent bg-transparent py-2.5'
                          : first
                            ? 'session-action-primary border-orbit-accent/25 bg-orbit-accent/15 py-[18px] hover:border-[#ffffff55] hover:bg-[#ffffff12] data-[focused=true]:border-[#ffffff55] data-[focused=true]:bg-[#ffffff12]'
                            : 'border-[#ffffff15] bg-[#ffffff06] py-[18px] hover:border-[#ffffff55] hover:bg-[#ffffff12] data-[focused=true]:border-[#ffffff55] data-[focused=true]:bg-[#ffffff12]',
                        item.tone === 'danger' && 'session-action-danger text-[#ffb5c4]',
                      )}
                    >
                      <Icon className="size-5 shrink-0" />
                      <span>
                        <strong
                          className={clsx(
                            'block font-semibold',
                            last ? 'text-xs' : 'text-sm',
                          )}
                        >
                          {busy ? 'Stopping…' : item.label}
                        </strong>
                        <small className="mt-1 block text-[11px] font-normal opacity-60">
                          {item.description}
                        </small>
                      </span>
                    </Focusable>
                  </li>
                )
              })}
            </ul>
            {(actionError || stop.error) && (
              <p
                role="alert"
                className={clsx(
                  'session-error mt-[15px] px-6 pb-4 text-xs leading-[1.6] text-[#ffb5c4]',
                )}
              >
                {actionError || String(stop.error)}
              </p>
            )}
            <footer
              className={clsx(
                'quick-menu-hints flex items-center justify-between px-6 pb-[22px] text-[10px] text-orbit-muted',
              )}
            >
              <span className="flex items-center gap-2">
                {game && activeSession
                  ? `${formatPlaytime(game.totalPlaytimeSeconds)} total playtime`
                  : 'Always ready for one more game.'}
              </span>
              <span className="flex items-center gap-2">
                <kbd className="rounded-[5px] border border-[#ffffff30] px-[5px] py-0.5 [font:inherit]">
                  {confirmGlyph}
                </kbd>
                Select
                <kbd className="rounded-[5px] border border-[#ffffff30] px-[5px] py-0.5 [font:inherit]">
                  {backGlyph}
                </kbd>
                Close
              </span>
            </footer>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
