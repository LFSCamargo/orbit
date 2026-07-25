import { useState } from 'react'
import { ArrowLeft, EyeOff, Heart, Pencil, Play, Square, Trash2 } from 'lucide-react'
import { motion } from 'framer-motion'
import { ConfirmDialog } from '@/components/feedback/ConfirmDialog'
import { Focusable } from '@/components/focus/Focusable'
import { focusManager } from '@/controllers/FocusManager'
import { useGame, useGameActions } from '@/hooks/useGames'
import { backTarget, focusRestoreId } from '@/lib/navigation'
import { AchievementList } from '@/modules/game-details/components/AchievementList'
import { DetailsHero } from '@/modules/game-details/components/DetailsHero'
import { MetaGrid } from '@/modules/game-details/components/MetaGrid'
import { useSessionStore } from '@/stores/session.store'
import { useUiStore } from '@/stores/ui.store'
import { useThemeLayout } from '@/themes/useThemeLayout'

export function GameDetailsPage() {
  const selectedGameId = useUiStore((s) => s.selectedGameId)
  const previousScreen = useUiStore((s) => s.previousScreen)
  const setScreen = useUiStore((s) => s.setScreen)
  const openGameEdit = useUiStore((s) => s.openGameEdit)
  const setSelectedGameId = useUiStore((s) => s.setSelectedGameId)
  const setHeroGameId = useUiStore((s) => s.setHeroGameId)
  const { data: game, isLoading } = useGame(selectedGameId)
  const { launch, stop, favorite, hide, remove } = useGameActions()
  const activeSession = useSessionStore((s) => s.activeSession)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const layout = useThemeLayout()

  const isSwitch = layout === 'switch'
  const isPs5 = layout === 'ps5'
  const isThemedShell = isSwitch || isPs5
  const pageShell = isSwitch
    ? 'px-8 py-4 text-[var(--switch-ink)]'
    : isPs5
      ? 'px-8 py-4 text-[var(--ps5-ink)]'
      : 'orbit-route px-10 pb-16 pt-2'

  const goBack = (gameId?: string | null) => {
    const target = backTarget('game-details', previousScreen)
    setScreen(target)
    focusManager.restoreFocus(
      focusRestoreId(
        layout,
        target,
        gameId ?? selectedGameId,
        game?.provider,
        game?.lastPlayedAt,
      ),
    )
  }

  if (isLoading) {
    return (
      <div
        className={
          isSwitch
            ? 'px-8 py-4 text-[var(--switch-muted)]'
            : isPs5
              ? 'px-8 py-4 text-[var(--ps5-muted)]'
              : 'px-10 pt-28 text-orbit-muted'
        }
      >
        Loading game…
      </div>
    )
  }

  if (!game) {
    return (
      <div className={isSwitch || isPs5 ? 'px-8 py-4' : 'px-10 pt-28'}>
        <p
          className={
            isSwitch
              ? 'text-[var(--switch-muted)]'
              : isPs5
                ? 'text-[var(--ps5-muted)]'
                : 'text-orbit-muted'
          }
        >
          Game not found.
        </p>
        <Focusable
          focusId="details-back-missing"
          group="details-actions"
          order={0}
          noScale
          noRing
          onClick={() => goBack()}
          className="mt-4 rounded-card bg-white/10 px-4 py-2"
        >
          Back
        </Focusable>
      </div>
    )
  }

  const isRunning = activeSession?.gameId === game.id
  const achievements = game.achievements ?? []

  return (
    <motion.div
      className={pageShell}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.35 }}
    >
      <DetailsHero game={game} layout={layout} />

      <div className={`flex flex-wrap gap-3 ${isThemedShell ? 'pt-6' : 'px-10 pt-8'}`}>
        <Focusable
          focusId="details-back"
          group="details-actions"
          order={0}
          noScale
          noRing
          onClick={() => goBack(game.id)}
          className="inline-flex items-center gap-2 rounded-card bg-white/10 px-5 py-3"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </Focusable>

        {isRunning ? (
          <Focusable
            focusId="details-stop"
            group="details-actions"
            order={1}
            noScale
            noRing
            onClick={() => activeSession && stop.mutate(activeSession.id)}
            className="inline-flex items-center gap-2 rounded-card bg-rose-500/90 px-6 py-3 font-semibold"
          >
            <Square className="h-4 w-4 fill-current" />
            Stop
          </Focusable>
        ) : (
          <Focusable
            focusId="details-play"
            group="details-actions"
            order={1}
            noScale
            noRing
            onClick={() => launch.mutate(game.id)}
            className={`inline-flex items-center gap-2 rounded-card px-6 py-3 font-semibold ${
              isPs5
                ? 'bg-white text-black'
                : isSwitch
                  ? 'bg-[var(--switch-cyan)] text-black'
                  : 'bg-orbit-accent text-orbit-canvas'
            }`}
          >
            <Play className="h-4 w-4 fill-current" />
            Play
          </Focusable>
        )}

        <Focusable
          focusId="details-favorite"
          group="details-actions"
          order={2}
          noScale
          noRing
          onClick={() => favorite.mutate(game.id)}
          className="inline-flex items-center gap-2 rounded-card bg-white/10 px-5 py-3"
        >
          <Heart
            className={`h-4 w-4 ${game.favorite ? 'fill-rose-400 text-rose-400' : ''}`}
          />
          Favorite
        </Focusable>

        <Focusable
          focusId="details-edit"
          group="details-actions"
          order={3}
          noScale
          noRing
          onClick={() => openGameEdit(game.id)}
          className="inline-flex items-center gap-2 rounded-card bg-white/10 px-5 py-3"
        >
          <Pencil className="h-4 w-4" />
          Edit properties
        </Focusable>

        <Focusable
          focusId="details-hide"
          group="details-actions"
          order={4}
          noScale
          noRing
          onClick={() => hide.mutate({ gameId: game.id, hidden: !game.hidden })}
          className="inline-flex items-center gap-2 rounded-card bg-white/10 px-5 py-3"
        >
          <EyeOff className="h-4 w-4" />
          {game.hidden ? 'Unhide' : 'Hide'}
        </Focusable>

        <Focusable
          focusId="details-delete"
          group="details-actions"
          order={5}
          noScale
          noRing
          disabled={isRunning}
          onClick={() => setConfirmDelete(true)}
          className="inline-flex items-center gap-2 rounded-card bg-rose-500/10 px-5 py-3 text-rose-300 disabled:opacity-40"
        >
          <Trash2 className="h-4 w-4" />
          {isRunning ? 'Stop before deleting' : 'Delete'}
        </Focusable>
      </div>

      <MetaGrid game={game} themed={isThemedShell} />

      <AchievementList achievements={achievements} themed={isThemedShell} />

      <ConfirmDialog
        open={confirmDelete}
        title={`Delete ${game.title}?`}
        description="This removes the game and its Orbit play history. It will not uninstall or delete the game files, and you can import it again later."
        confirmLabel="Delete game"
        busy={remove.isPending}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => {
          void remove.mutateAsync(game.id).then(() => {
            setConfirmDelete(false)
            setSelectedGameId(null)
            setHeroGameId(null)
            setScreen('library')
          })
        }}
      />
    </motion.div>
  )
}
