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

  const shellClass =
    layout === 'switch'
      ? 'switch-shell bg-[var(--switch-bg)] text-[var(--switch-ink)]'
      : layout === 'ps5'
        ? 'ps5-shell bg-[var(--ps5-bg)] text-[var(--ps5-ink)]'
        : 'bg-orbit-canvas text-orbit-foreground'

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

  const stopClass =
    layout === 'switch'
      ? 'bg-[#ff4d6d] text-white'
      : layout === 'ps5'
        ? 'bg-[var(--ps5-accent)] text-[var(--ps5-bg)]'
        : 'bg-rose-500/90 text-white'

  const subtitle = useMemo(() => {
    if (!game) return 'Launching…'
    return `${formatPlaytime(elapsed)} this session`
  }, [game, elapsed])

  return (
    <div
      className={`flex h-dvh max-h-dvh flex-col items-center justify-center px-8 ${shellClass}`}
    >
      {layout === 'orbit' && <div className="theme-bg" aria-hidden />}

      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className={`relative z-10 flex w-full max-w-lg flex-col items-center px-8 py-10 text-center ${panelClass}`}
      >
        <p className={`text-xs font-semibold uppercase tracking-[0.2em] ${mutedClass}`}>
          Now playing
        </p>

        <div
          className={`mt-6 overflow-hidden shadow-hero ring-1 ring-white/10 ${
            layout === 'orbit' ? 'h-36 w-36 rounded-card' : 'square-game-art h-32 w-32 rounded-[1.25rem]'
          }`}
          style={{
            background: game ? artworkPlaceholder(game.id) : undefined,
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

        <h1 className="mt-4 font-display text-3xl font-semibold tracking-tight">{title}</h1>
        <p className={`mt-2 text-sm ${mutedClass}`}>{subtitle}</p>

        <Focusable
          focusId="playing-stop"
          group="playing-actions"
          order={0}
          noScale
          disabled={stop.isPending}
          onClick={() => stop.mutate(session.id)}
          className={`mt-8 inline-flex items-center gap-3 rounded-card px-8 py-4 text-lg font-semibold ${stopClass}`}
        >
          <Square className="h-5 w-5 fill-current" />
          {stop.isPending ? 'Stopping…' : 'Stop game'}
        </Focusable>

        <p className={`mt-6 text-xs ${mutedClass}`}>
          Orbit will return when the game closes. Press {confirmGlyph} to stop.
        </p>
      </motion.div>
    </div>
  )
}
