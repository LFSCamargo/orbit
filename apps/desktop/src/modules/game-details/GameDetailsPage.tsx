import { useState } from 'react'
import {
  ArrowUpRight,
  Eye,
  EyeOff,
  Heart,
  Pencil,
  Play,
  Square,
  Trash2,
  Library,
  Settings2,
} from 'lucide-react'
import { ConfirmDialog } from '@/components/feedback/ConfirmDialog'
import { Focusable } from '@/components/focus/Focusable'
import { focusManager } from '@/controllers/FocusManager'
import { useGame, useGameActions } from '@/hooks/useGames'
import { backTarget, focusRestoreId } from '@/lib/navigation'
import { formatRelativeDate, providerLabel } from '@/lib/format'
import { AchievementList } from './components/AchievementList'
import { DetailsHero } from './components/DetailsHero'
import { MetaGrid } from './components/MetaGrid'
import { useSessionStore } from '@/stores/session.store'
import { useUiStore } from '@/stores/ui.store'
import './details.css'

export function GameDetailsPage() {
  const selectedGameId = useUiStore((s) => s.selectedGameId)
  const previousScreen = useUiStore((s) => s.previousScreen)
  const setScreen = useUiStore((s) => s.setScreen)
  const openGameEdit = useUiStore((s) => s.openGameEdit)
  const setSelectedGameId = useUiStore((s) => s.setSelectedGameId)
  const setHeroGameId = useUiStore((s) => s.setHeroGameId)
  const { data: game, isLoading, error: loadError } = useGame(selectedGameId)
  const { launch, stop, favorite, hide, remove } = useGameActions()
  const activeSession = useSessionStore((s) => s.activeSession)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const goBack = () => {
    const target = backTarget('game-details', previousScreen)
    setScreen(target)
    focusManager.restoreFocus(focusRestoreId(target, game?.id ?? selectedGameId))
  }
  if (isLoading || !game)
    return (
      <section className="game-details details-missing" data-theme="macos">
        <Library size={32} />
        <h1>
          {isLoading
            ? 'Loading your game…'
            : loadError
              ? 'Could not load this game'
              : 'Game not found'}
        </h1>
        <p>
          {isLoading
            ? 'Getting everything ready.'
            : loadError
              ? 'Return to your library and try again.'
              : 'It may have been removed from your library.'}
        </p>
        {!isLoading && (
          <Focusable
            focusId="details-back-missing"
            group="details-actions"
            order={0}
            noScale
            className="details-secondary orbit-glass-control"
            onClick={goBack}
          >
            Back to library
          </Focusable>
        )}
      </section>
    )
  const running = activeSession?.gameId === game.id
  const busy = launch.isPending || stop.isPending
  const error = launch.error || stop.error || favorite.error || hide.error || remove.error
  return (
    <div className="game-details" data-theme="macos">
      <DetailsHero game={game}>
        <div className="details-primary-actions">
          <Focusable
            focusId={running ? 'details-stop' : 'details-play'}
            group="details-actions"
            order={1}
            noScale
            disabled={busy}
            onClick={() =>
              running && activeSession
                ? stop.mutate(activeSession.id)
                : launch.mutate(game.id)
            }
            className="details-play"
          >
            {running ? (
              <Square size={17} fill="currentColor" />
            ) : (
              <Play size={17} fill="currentColor" />
            )}
            <span>
              {busy
                ? running
                  ? 'Finishing…'
                  : 'Launching…'
                : running
                  ? game.provider === 'gamehub'
                    ? 'End tracking'
                    : 'Stop game'
                  : game.totalPlaytimeSeconds > 0
                    ? 'Continue playing'
                    : 'Play now'}
            </span>
          </Focusable>
          <Focusable
            focusId="details-favorite"
            group="details-actions"
            order={2}
            noScale
            disabled={favorite.isPending}
            aria-label={game.favorite ? 'Remove from favorites' : 'Add to favorites'}
            aria-pressed={game.favorite}
            onClick={() => favorite.mutate(game.id)}
            className="details-favorite orbit-glass-control"
          >
            <Heart size={18} fill={game.favorite ? 'currentColor' : 'none'} />
            <span>{game.favorite ? 'Favorited' : 'Favorite'}</span>
          </Focusable>
        </div>
      </DetailsHero>
      <div className="details-content">
        <MetaGrid game={game} />
        {error && (
          <p role="alert" className="details-error orbit-glass-control">
            {String(error)}
          </p>
        )}
        <div className="details-body-grid">
          <div className="details-main-column">
            <section
              className="details-about orbit-glass"
              aria-labelledby="details-about-title"
            >
              <header className="details-section-heading">
                <div>
                  <p className="details-eyebrow">THE WORLD AWAITS</p>
                  <h2 id="details-about-title">About this game</h2>
                </div>
              </header>
              {game.description ? (
                <p className="details-description">{game.description}</p>
              ) : (
                <div className="details-no-description">
                  <p>No description has been added yet.</p>
                  <Focusable
                    focusId="details-add-description"
                    group="details-info"
                    order={0}
                    noScale
                    onClick={() => openGameEdit(game.id)}
                    className="details-inline-link"
                  >
                    Add a description or fetch metadata
                    <ArrowUpRight size={14} />
                  </Focusable>
                </div>
              )}
            </section>
            <AchievementList key={game.id} achievements={game.achievements ?? []} />
          </div>
          <aside
            className="details-library-panel orbit-glass"
            aria-labelledby="details-library-title"
          >
            <header className="details-section-heading">
              <div>
                <p className="details-eyebrow">MAKE IT YOURS</p>
                <h2 id="details-library-title">In your library</h2>
              </div>
              <Settings2 size={18} />
            </header>
            <dl className="details-library-facts">
              <div>
                <dt>Source</dt>
                <dd>{providerLabel(game.provider)}</dd>
              </div>
              <div>
                <dt>Added</dt>
                <dd>{formatRelativeDate(game.dateAdded)}</dd>
              </div>
              <div>
                <dt>Visibility</dt>
                <dd>{game.hidden ? 'Hidden' : 'In library'}</dd>
              </div>
            </dl>
            <div className="details-management">
              <Focusable
                focusId="details-edit"
                group="details-management"
                order={0}
                noScale
                onClick={() => openGameEdit(game.id)}
              >
                <Pencil size={16} />
                <span>
                  Edit properties<small>Artwork, metadata & launch settings</small>
                </span>
                <ArrowUpRight size={14} />
              </Focusable>
              <Focusable
                focusId="details-hide"
                group="details-management"
                order={1}
                noScale
                disabled={hide.isPending}
                onClick={() => hide.mutate({ gameId: game.id, hidden: !game.hidden })}
              >
                {game.hidden ? <Eye size={16} /> : <EyeOff size={16} />}
                <span>
                  {game.hidden ? 'Show in library' : 'Hide from library'}
                  <small>
                    {game.hidden
                      ? 'Return to your collection'
                      : 'Keep the game, clear the clutter'}
                  </small>
                </span>
              </Focusable>
              <Focusable
                focusId="details-delete"
                group="details-management"
                order={2}
                noScale
                disabled={running || remove.isPending}
                onClick={() => setConfirmDelete(true)}
                className="details-remove"
              >
                <Trash2 size={16} />
                <span>
                  Remove from Orbit
                  <small>
                    {running
                      ? 'End your session first'
                      : 'Installed game files stay untouched'}
                  </small>
                </span>
              </Focusable>
            </div>
          </aside>
        </div>
      </div>
      <ConfirmDialog
        open={confirmDelete}
        title={`Remove ${game.title} from Orbit?`}
        description="This removes the game and its Orbit play history. Your installed game files stay untouched, and you can import the game again later."
        confirmLabel="Remove game"
        busy={remove.isPending}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() =>
          remove.mutate(game.id, {
            onSuccess: () => {
              setConfirmDelete(false)
              setSelectedGameId(null)
              setHeroGameId(null)
              setScreen('library')
            },
            onError: () => setConfirmDelete(false),
          })
        }
      />
    </div>
  )
}
