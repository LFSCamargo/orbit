import { useEffect, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { Play, Square, MoreHorizontal, Clock3 } from 'lucide-react'
import { Focusable } from '@/components/focus/Focusable'
import { ProviderBadge } from '@/components/game/ProviderBadge'
import { SessionArtwork } from '@/components/session/SessionArtwork'
import { focusManager } from '@/controllers/FocusManager'
import type { ControllerFamily } from '@/controllers/ControllerMapping'
import { glyphFor } from '@/controllers/ControllerGlyphs'
import { useGame, useGameActions } from '@/hooks/useGames'
import { formatPlaytime } from '@/lib/format'
import { hideOrbitWindow, openGameHub } from '@/lib/tauri'
import { useUiStore } from '@/stores/ui.store'
import type { GameSession } from '@/types/game'
import '@/components/session/session.css'

function elapsed(startedAt: string) {
  const start = Date.parse(startedAt)
  return Number.isFinite(start) ? Math.max(0, Math.floor((Date.now() - start) / 1000)) : 0
}

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
    <div className="session-stage" data-theme="macos">
      <SessionArtwork game={game} />
      <motion.div
        className="session-layout"
        initial={reduce ? false : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: reduce ? 0 : 0.35 }}
      >
        <section>
          <div className="session-brand">
            <img src="/orbit.svg" alt="" />
            ORBIT
          </div>
          <p className="session-kicker">
            <span className="session-live-dot" />
            SESSION IN PROGRESS
          </p>
          <h1 className="session-title">{game?.title ?? 'Your game is running'}</h1>
          <div className="session-meta">
            {game && <ProviderBadge provider={game.provider} />}
            <span className="flex items-center gap-2">
              <Clock3 size={14} />
              {formatPlaytime(seconds)} this session
            </span>
          </div>
          <p className="session-footer">Your game keeps running while you’re here.</p>
        </section>
        <section className="session-actions orbit-glass" aria-label="Session controls">
          <h2>Take a breather.</h2>
          <p>Pick up where you left off, or wrap up for now.</p>
          <div className="mt-6 grid gap-3">
            <Focusable
              focusId="playing-resume"
              group="playing-actions"
              order={0}
              noScale
              disabled={stop.isPending}
              className="session-action orbit-glass-control session-action-primary"
              onClick={() => {
                setError(null)
                void hideOrbitWindow().catch(() =>
                  setError('Could not return to the game. Try selecting its window.'),
                )
              }}
            >
              <Play />
              <span>
                <strong>Return to game</strong>
                <small>Keep your adventure going</small>
              </span>
            </Focusable>
            <Focusable
              focusId="playing-stop"
              group="playing-actions"
              order={1}
              noScale
              disabled={stop.isPending}
              className="session-action orbit-glass-control session-action-danger"
              onClick={() => stop.mutate(session.id)}
            >
              <Square />
              <span>
                <strong>
                  {stop.isPending
                    ? 'Finishing…'
                    : session.provider === 'gamehub'
                      ? 'End session tracking'
                      : 'Stop game'}
                </strong>
                <small>
                  {session.provider === 'gamehub'
                    ? 'Saves time; game and GameHub keep running'
                    : 'Close the game and save session time'}
                </small>
              </span>
            </Focusable>
            <Focusable
              focusId="playing-menu"
              group="playing-actions"
              order={2}
              noScale
              disabled={stop.isPending}
              className="session-action orbit-glass-control"
              onClick={openMenu}
            >
              <MoreHorizontal />
              <span>
                <strong>More options</strong>
                <small>Open the Orbit menu</small>
              </span>
            </Focusable>
          </div>
          {(error || stop.error) && (
            <p className="session-error" role="alert">
              {error || String(stop.error)}
            </p>
          )}
          {session.provider === 'gamehub' && (
            <Focusable
              focusId="playing-gamehub-manage"
              group="playing-actions"
              order={3}
              noScale
              disabled={stop.isPending}
              className="session-footer underline"
              onClick={() =>
                void openGameHub(true).catch(() => setError('Could not open GameHub.'))
              }
            >
              Close or manage the game in GameHub ↗
            </Focusable>
          )}
          <p className="session-footer">
            {glyphFor(family, 'confirm')} Select · {glyphFor(family, 'menu')} Menu · Your
            session time is tracked automatically.
          </p>
        </section>
      </motion.div>
    </div>
  )
}
