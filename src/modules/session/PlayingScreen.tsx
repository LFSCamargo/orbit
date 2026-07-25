import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Square } from 'lucide-react'
import { Focusable } from '@/components/focus/Focusable'
import { ProviderBadge } from '@/components/game/ProviderBadge'
import { focusManager } from '@/controllers/FocusManager'
import type { ControllerFamily } from '@/controllers/ControllerMapping'
import { glyphFor } from '@/controllers/ControllerGlyphs'
import { useGame, useGameActions } from '@/hooks/useGames'
import { gameTileImage, artworkPlaceholder } from '@/lib/artwork'
import { formatPlaytime } from '@/lib/format'
import { mediaSrc } from '@/lib/media'
import type { GameSession } from '@/types/game'
import { useThemeLayout } from '@/themes/useThemeLayout'
import { themeTokens } from '@/themes/tokens'

function sessionElapsedSeconds(startedAt: string): number {
  const start = Date.parse(startedAt)
  if (Number.isNaN(start)) return 0
  return Math.max(0, Math.floor((Date.now() - start) / 1000))
}

export function PlayingScreen({
  session,
  family,
}: {
  session: GameSession
  family: ControllerFamily
}) {
  const layout = useThemeLayout()
  const tokens = themeTokens(layout)
  const { data: game } = useGame(session.gameId)
  const { stop } = useGameActions()
  const [elapsed, setElapsed] = useState(() => sessionElapsedSeconds(session.startedAt))

  useEffect(() => {
    const timer = window.setInterval(() => {
      setElapsed(sessionElapsedSeconds(session.startedAt))
    }, 1000)
    return () => window.clearInterval(timer)
  }, [session.startedAt])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      focusManager.setFocus('playing-stop')
    }, 80)
    return () => window.clearTimeout(timer)
  }, [session.id])

  const title = game?.title ?? 'Now playing'
  const iconSrc = game ? mediaSrc(gameTileImage(game.artwork, 'square')) : undefined
  const confirmGlyph = glyphFor(family, 'confirm')

  const subtitle = useMemo(() => {
    if (!game) return 'Launching…'
    return `${formatPlaytime(elapsed)} this session`
  }, [game, elapsed])

  return (
    <div
      className={`flex h-dvh max-h-dvh flex-col items-center justify-center px-8 ${tokens.shell}`}
    >
      {layout === 'orbit' && <div className="theme-bg" aria-hidden />}

      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className={`relative z-10 flex w-full max-w-lg flex-col items-center px-8 py-10 text-center ${tokens.panel}`}
      >
        <p className={`text-xs font-semibold uppercase tracking-[0.2em] ${tokens.muted}`}>
          Now playing
        </p>

        <div
          className={`mt-6 overflow-hidden shadow-hero ring-1 ring-white/10 ${
            layout === 'orbit'
              ? 'h-36 w-36 rounded-card'
              : 'square-game-art h-32 w-32 rounded-[1.25rem]'
          }`}
          style={{
            background: iconSrc ? '#000' : game ? artworkPlaceholder(game.id) : undefined,
          }}
        >
          {iconSrc ? (
            <img src={iconSrc} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-4xl font-semibold opacity-40">
              {title.charAt(0)}
            </div>
          )}
        </div>

        {game && (
          <div className="mt-5">
            <ProviderBadge provider={game.provider} />
          </div>
        )}

        <h1 className="mt-4 font-display text-3xl font-semibold tracking-tight">
          {title}
        </h1>
        <p className={`mt-2 text-sm ${tokens.muted}`}>{subtitle}</p>

        <Focusable
          focusId="playing-stop"
          group="playing-actions"
          order={0}
          noScale
          disabled={stop.isPending}
          onClick={() => stop.mutate(session.id)}
          className={`mt-8 inline-flex items-center gap-3 rounded-card px-8 py-4 text-lg font-semibold ${tokens.danger}`}
        >
          <Square className="h-5 w-5 fill-current" />
          {stop.isPending ? 'Stopping…' : 'Stop game'}
        </Focusable>

        <p className={`mt-6 text-xs ${tokens.muted}`}>
          Orbit will return when the game closes. Press {confirmGlyph} to stop.
        </p>
      </motion.div>
    </div>
  )
}
