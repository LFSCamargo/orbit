import { useEffect, useState } from 'react'
import { clsx } from 'clsx'
import { motion, useReducedMotion } from 'framer-motion'
import { Play, Square, MoreHorizontal, Clock3 } from 'lucide-react'
import appIcon from '@/assets/brand/app-icon.png'
import { Focusable } from '@/components/focus/Focusable'
import { ProviderBadge } from '@/components/game/ProviderBadge'
import { SessionArtwork } from '@/components/session/SessionArtwork'
import { focusManager } from '@/controllers/FocusManager'
import type { ControllerFamily } from '@/controllers/ControllerMapping'
import { glyphFor } from '@/controllers/ControllerGlyphs'
import { useGame, useGameActions } from '@/hooks/useGames'
import { formatPlaytime } from '@/lib/format'
import { hideOrbitWindow } from '@/lib/tauri'
import { useUiStore } from '@/stores/ui.store'
import type { GameSession } from '@/types/game'

function elapsed(startedAt: string) {
  const start = Date.parse(startedAt)
  return Number.isFinite(start) ? Math.max(0, Math.floor((Date.now() - start) / 1000)) : 0
}

const sessionActionClass = clsx(
  'session-action orbit-glass-control flex w-full items-center gap-[15px] rounded-2xl border px-[18px] py-[18px] text-left text-orbit-foreground',
  'transition-[background,border-color] duration-200 hover:border-[#ffffff55] hover:bg-[#ffffff12]',
  'data-[focused=true]:border-[#ffffff55] data-[focused=true]:bg-[#ffffff12] disabled:opacity-50 motion-reduce:transition-none',
)

export function PlayingScreen({
  session,
  family,
}: {
  session: GameSession
  family: ControllerFamily
}) {
  const { data: game } = useGame(session.gameId)
  const { stop } = useGameActions()
  const reduce = useReducedMotion()
  const [seconds, setSeconds] = useState(() => elapsed(session.startedAt))
  const [error, setError] = useState<string | null>(null)
  const openMenu = useUiStore((s) => s.openHomeMenu)
  useEffect(() => {
    const timer = window.setInterval(() => setSeconds(elapsed(session.startedAt)), 1000)
    return () => window.clearInterval(timer)
  }, [session.startedAt])
  useEffect(() => {
    const timer = window.setTimeout(() => focusManager.setFocus('playing-resume'), 80)
    return () => window.clearTimeout(timer)
  }, [session.id])
  return (
    <div
      className={clsx(
        'session-stage relative isolate flex h-dvh items-center justify-center overflow-auto bg-orbit-canvas p-[clamp(24px,5vw,80px)] text-orbit-foreground',
        "after:pointer-events-none after:absolute after:inset-0 after:-z-[1] after:bg-[linear-gradient(90deg,#070b13ee,#070b1370),linear-gradient(0deg,#070b13,transparent)] after:content-['']",
        'motion-reduce:[&_*]:!transition-none',
      )}
      data-theme="macos"
    >
      <SessionArtwork game={game} />
      <motion.div
        className={clsx(
          'session-layout grid w-full max-w-[1100px] grid-cols-[1.3fr_1fr] items-center gap-[clamp(32px,7vw,110px)] max-[700px]:max-w-[460px] max-[700px]:grid-cols-1 max-[700px]:gap-7',
        )}
        initial={reduce ? false : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: reduce ? 0 : 0.35 }}
      >
        <section>
          <div
            className={clsx(
              'session-brand flex items-center gap-2.5 text-[11px] tracking-[0.22em] text-white/60',
            )}
          >
            <img src={appIcon} alt="" className="size-7" draggable={false} />
            ORBIT
          </div>
          <p
            className={clsx(
              'session-kicker mt-14 flex items-center gap-2 text-[10px] font-semibold tracking-[0.18em] text-[#bcf4d6] max-[700px]:mt-7',
            )}
          >
            <span
              className={clsx(
                'session-live-dot size-1.5 rounded-full bg-[#90e5b5] shadow-[0_0_14px_#90e5b555]',
              )}
            />
            SESSION IN PROGRESS
          </p>
          <h1
            className={clsx(
              'session-title mb-6 mt-4 text-balance font-display text-[clamp(32px,4.6vw,66px)] font-semibold leading-[1.05] tracking-[-0.05em] text-white max-[700px]:mb-4 max-[700px]:text-[36px]',
            )}
          >
            {game?.title ?? 'Your game is running'}
          </h1>
          <div
            className={clsx(
              'session-meta flex items-center gap-3.5 text-xs text-[#ffffff9c]',
            )}
          >
            {game && <ProviderBadge provider={game.provider} />}
            <span className="flex items-center gap-2">
              <Clock3 size={14} />
              {formatPlaytime(seconds)} this session
            </span>
          </div>
          <p
            className={clsx(
              'session-footer mt-6 text-[10px] leading-[1.6] text-[#ffffff60]',
            )}
          >
            Your game keeps running while you’re here.
          </p>
        </section>
        <section
          className={clsx(
            'session-actions orbit-glass rounded-[30px] border border-[#ffffff24] bg-orbit-panel/55 p-7 shadow-[inset_0_1px_#ffffff15,0_12px_32px_#0003] max-[700px]:p-[22px]',
          )}
          aria-label="Session controls"
        >
          <h2 className={clsx('font-display text-[22px] font-[550] tracking-[-0.03em]')}>
            Take a breather.
          </h2>
          <p className={clsx('mt-2 text-xs leading-[1.7] text-orbit-muted')}>
            Pick up where you left off, or wrap up for now.
          </p>
          <div className="mt-6 grid gap-3">
            <Focusable
              focusId="playing-resume"
              group="playing-actions"
              order={0}
              noScale
              disabled={stop.isPending}
              className={clsx(
                sessionActionClass,
                'session-action-primary border-orbit-accent/25 bg-orbit-accent/15',
              )}
              onClick={() => {
                setError(null)
                void hideOrbitWindow().catch(() =>
                  setError('Could not return to the game. Try selecting its window.'),
                )
              }}
            >
              <Play className="size-5 shrink-0" />
              <span>
                <strong className="block text-sm font-semibold">Return to game</strong>
                <small className="mt-1 block text-[11px] font-normal opacity-60">
                  Keep your adventure going
                </small>
              </span>
            </Focusable>
            <Focusable
              focusId="playing-stop"
              group="playing-actions"
              order={1}
              noScale
              disabled={stop.isPending}
              className={clsx(
                sessionActionClass,
                'session-action-danger border-[#ffffff15] bg-[#ffffff06] text-[#ffb5c4]',
              )}
              onClick={() => stop.mutate(session.id)}
            >
              <Square className="size-5 shrink-0" />
              <span>
                <strong className="block text-sm font-semibold">
                  {stop.isPending ? 'Finishing…' : 'Stop game'}
                </strong>
                <small className="mt-1 block text-[11px] font-normal opacity-60">
                  Close the game and save session time
                </small>
              </span>
            </Focusable>
            <Focusable
              focusId="playing-menu"
              group="playing-actions"
              order={2}
              noScale
              disabled={stop.isPending}
              className={clsx(sessionActionClass, 'border-[#ffffff15] bg-[#ffffff06]')}
              onClick={openMenu}
            >
              <MoreHorizontal className="size-5 shrink-0" />
              <span>
                <strong className="block text-sm font-semibold">More options</strong>
                <small className="mt-1 block text-[11px] font-normal opacity-60">
                  Open the Orbit menu
                </small>
              </span>
            </Focusable>
          </div>
          {(error || stop.error) && (
            <p
              className={clsx(
                'session-error mt-[15px] text-xs leading-[1.6] text-[#ffb5c4]',
              )}
              role="alert"
            >
              {error || String(stop.error)}
            </p>
          )}
          <p
            className={clsx(
              'session-footer mt-6 text-[10px] leading-[1.6] text-[#ffffff60]',
            )}
          >
            {glyphFor(family, 'confirm')} Select · {glyphFor(family, 'menu')} Menu · Your
            session time is tracked automatically.
          </p>
        </section>
      </motion.div>
    </div>
  )
}
