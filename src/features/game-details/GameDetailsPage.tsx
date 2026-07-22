import { useState, type ReactNode } from 'react'
import {
  ArrowLeft,
  Clock3,
  EyeOff,
  HardDrive,
  Heart,
  Pencil,
  Play,
  Square,
  Trash2,
  Trophy,
} from 'lucide-react'
import { motion } from 'framer-motion'
import { ConfirmDialog } from '@/components/feedback/ConfirmDialog'
import { Focusable } from '@/components/focus/Focusable'
import { ProviderBadge } from '@/components/game/ProviderBadge'
import { focusManager } from '@/controllers/FocusManager'
import { useGame, useGameActions } from '@/hooks/useGames'
import { gameTileImage } from '@/lib/artwork'
import {
  formatAchievementProgress,
  formatBytes,
  formatPlaytime,
  formatRelativeDate,
  placeholderGradient,
} from '@/lib/format'
import { mediaSrc } from '@/lib/media'
import { backTarget, focusRestoreId } from '@/lib/navigation'
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
    focusManager.restoreFocus(focusRestoreId(layout, target, gameId ?? selectedGameId))
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
        >Game not found.</p>
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
  const heroSrc = mediaSrc(game.artwork.hero)
  const coverSrc = mediaSrc(game.artwork.cover)
  const iconSrc = mediaSrc(game.artwork.icon)
  const tileSrc = gameTileImage(game.artwork, layout === 'switch' || layout === 'ps5' ? 'square' : 'portrait')
  const hero = heroSrc || placeholderGradient(game.id)
  const achievements = game.achievements ?? []
  const unlocked = achievements.filter((item) => item.unlocked).length

  const heroFade = isPs5
    ? 'linear-gradient(180deg, var(--ps5-bg) 0%, transparent 28%, transparent 55%, var(--ps5-bg) 100%)'
    : isSwitch
      ? 'linear-gradient(180deg, var(--switch-bg) 0%, transparent 28%, transparent 55%, var(--switch-bg) 100%)'
      : undefined

  return (
    <motion.div
      className={pageShell}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.35 }}
    >
      <div
        className={`relative overflow-hidden ${
          isThemedShell ? 'min-h-[36vh] rounded-2xl ring-1 ring-white/10' : 'min-h-[48vh]'
        }`}
        style={{
          backgroundImage: heroSrc
            ? isThemedShell
              ? `url(${heroSrc})`
              : `linear-gradient(180deg, rgba(4,6,10,0.35), rgba(4,6,10,0.92)), url(${heroSrc})`
            : hero,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      >
        {isThemedShell ? (
          <>
            <div className="details-hero-scrim pointer-events-none absolute inset-0 bg-black/50" aria-hidden />
            <div
              className="pointer-events-none absolute inset-0"
              style={{ background: heroFade }}
              aria-hidden
            />
          </>
        ) : (
          <div className="absolute inset-0 bg-gradient-to-r from-orbit-canvas via-orbit-canvas/70 to-transparent" />
        )}
        <div
          className={`relative z-10 flex items-end gap-8 ${
            isThemedShell ? 'min-h-[36vh] px-6 pb-8 pt-6' : 'min-h-[48vh] px-10 pb-10 pt-28'
          }`}
        >
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
              className={`hidden shrink-0 overflow-hidden sm:block ${
                isSwitch || isPs5 ? 'square-game-art' : 'shadow-hero ring-1 ring-white/10'
              } ${
              layout === 'switch' || layout === 'ps5'
                ? 'h-40 w-40 rounded-[1.25rem]'
                : 'h-72 w-52 rounded-card'
            }`}
            style={{ background: placeholderGradient(game.id) }}
          >
            {(layout === 'switch' || layout === 'ps5' ? tileSrc || iconSrc : coverSrc) && (
              <img
                src={(layout === 'switch' || layout === 'ps5' ? tileSrc || iconSrc : coverSrc)!}
                alt=""
                className="h-full w-full object-cover"
              />
            )}
          </motion.div>
          <div className="max-w-2xl">
            <ProviderBadge provider={game.provider} />
            <h1 className="mt-4 font-display text-5xl font-semibold tracking-tight">
              {game.title}
            </h1>
            {game.description && (
              <p
                className={`mt-3 max-w-xl text-sm leading-relaxed ${
                  isThemedShell ? 'text-white/70' : 'text-orbit-muted'
                }`}
              >
                {game.description}
              </p>
            )}
            <p className={`mt-3 ${isThemedShell ? 'text-white/60' : 'text-orbit-muted'}`}>
              {game.platform} · {formatPlaytime(game.totalPlaytimeSeconds)} · Last played{' '}
              {formatRelativeDate(game.lastPlayedAt)}
            </p>
          </div>
        </div>
      </div>

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
          <Heart className={`h-4 w-4 ${game.favorite ? 'fill-rose-400 text-rose-400' : ''}`} />
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

      <div className={`mt-10 grid gap-4 md:grid-cols-4 ${isThemedShell ? '' : 'px-10'}`}>
        <MetaCard themed={isThemedShell} icon={<Clock3 className="h-4 w-4" />} label="Playtime" value={formatPlaytime(game.totalPlaytimeSeconds)} />
        <MetaCard themed={isThemedShell} icon={<HardDrive className="h-4 w-4" />} label="Install size" value={formatBytes(game.installSizeBytes)} />
        <MetaCard
          themed={isThemedShell}
          icon={<Trophy className="h-4 w-4" />}
          label="Achievements"
          value={formatAchievementProgress(unlocked, achievements.length)}
        />
        <MetaCard themed={isThemedShell} label="Added" value={formatRelativeDate(game.dateAdded)} />
      </div>

      {achievements.length > 0 && (
        <div className={`mt-10 ${isThemedShell ? '' : 'px-10'}`}>
          <h2 className="font-display text-2xl font-semibold">Achievements</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {achievements.map((achievement, index) => (
              <motion.div
                key={achievement.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.04, duration: 0.3 }}
                className={`orbit-panel rounded-card p-4 ${
                  achievement.unlocked ? 'opacity-100' : 'opacity-55'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{achievement.name}</p>
                    {achievement.description && (
                      <p className="mt-1 text-sm text-orbit-muted">
                        {achievement.description}
                      </p>
                    )}
                  </div>
                  <Trophy
                    className={`h-4 w-4 shrink-0 ${
                      achievement.unlocked ? 'text-amber-300' : 'text-orbit-muted'
                    }`}
                  />
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      )}
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

function MetaCard({
  label,
  value,
  icon,
  themed = false,
}: {
  label: string
  value: string
  icon?: ReactNode
  themed?: boolean
}) {
  return (
    <div
      className={
        themed
          ? 'rounded-2xl bg-white/5 p-5 ring-1 ring-white/10'
          : 'orbit-panel rounded-card p-5'
      }
    >
      <div
        className={`flex items-center gap-2 text-xs uppercase tracking-wider ${
          themed ? 'text-white/55' : 'text-orbit-muted'
        }`}
      >
        {icon}
        {label}
      </div>
      <p className="mt-2 font-display text-2xl font-medium">{value}</p>
    </div>
  )
}
