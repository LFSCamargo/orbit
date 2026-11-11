import { useMemo, useState } from 'react'
import { ArrowUpRight, Clock3, Heart, Play, Square } from 'lucide-react'
import { Focusable } from '@/components/focus/Focusable'
import { SquareGameArt } from '@/components/game/SquareGameArt'
import { LiquidGlass } from '@/components/ui/liquid-glass'
import { artworkPreview, gameTileImage, artworkPlaceholder } from '@/lib/artwork'
import { formatPlaytime, providerLabel, formatRelativeDate } from '@/lib/format'
import { useUiStore } from '@/stores/ui.store'
import { createHomeGameHandlers, type ThemeHomeProps } from '../hooks/useHomeGameActions'

export function MacosHome({
  games,
  heroGame,
  activeSession,
  onPlay,
  onStop,
  onFavorite,
}: ThemeHomeProps) {
  const setHero = useUiStore((s) => s.setHeroGameId)
  const details = useUiStore((s) => s.openGameDetails)
  const navigate = useUiStore((s) => s.setScreen)
  const [view, setView] = useState<'recent' | 'favorites'>('recent')
  const { selectGame, activateGame } = createHomeGameHandlers(
    activeSession,
    setHero,
    onPlay,
    onStop,
    heroGame.id,
  )
  const running = activeSession?.gameId === heroGame.id
  const visible = useMemo(() => games.filter((game) => !game.hidden), [games])
  const tiles = useMemo(
    () =>
      visible
        .filter((game) => view !== 'favorites' || game.favorite)
        .slice()
        .sort((a, b) =>
          (b.lastPlayedAt ?? b.dateAdded).localeCompare(a.lastPlayedAt ?? a.dateAdded),
        )
        .slice(0, 12),
    [visible, view],
  )
  const logoImage = artworkPreview(heroGame.artwork, 'logo')

  return (
    <div className="macos-home">
      {logoImage && (
        <img
          src={logoImage}
          alt=""
          className="macos-hero-logo"
          aria-hidden="true"
          draggable={false}
        />
      )}
      <div className="macos-feature-grid">
        <section className="macos-feature" aria-labelledby="macos-feature-title">
          <div className="macos-feature-content">
            <p className="macos-eyebrow">
              {running ? 'NOW PLAYING' : 'CONTINUE YOUR ADVENTURE'}
            </p>
            <span className="macos-provider">{providerLabel(heroGame.provider)}</span>
            <h2 id="macos-feature-title">{heroGame.title}</h2>
            <p>{heroGame.description || 'An entire world, just one click away.'}</p>
            <LiquidGlass surface="toolbar" className="macos-action-glass" radius={999}>
              <div className="macos-feature-actions">
                <Focusable
                  focusId="macos-play"
                  group="macos-feature"
                  order={0}
                  noScale
                  onClick={() => (running ? onStop() : onPlay(heroGame))}
                  className="macos-play"
                >
                  {running ? (
                    <Square size={16} />
                  ) : (
                    <Play size={16} fill="currentColor" />
                  )}
                  {running ? 'Stop game' : 'Jump back in'}
                </Focusable>
                <Focusable
                  focusId="macos-details"
                  group="macos-feature"
                  order={1}
                  noScale
                  onClick={() => details(heroGame.id)}
                  className="macos-details orbit-glass-control"
                >
                  Details
                  <ArrowUpRight size={15} />
                </Focusable>
              </div>
            </LiquidGlass>
            <div className="macos-game-meta">
              <span>
                <Clock3 size={14} />
                {formatPlaytime(heroGame.totalPlaytimeSeconds)}
              </span>
              <span>
                {heroGame.lastPlayedAt
                  ? `Last played ${formatRelativeDate(heroGame.lastPlayedAt)}`
                  : 'Ready when you are'}
              </span>
            </div>
          </div>
          <Focusable
            focusId="macos-favorite"
            group="macos-feature"
            order={2}
            noScale
            onClick={() => onFavorite(heroGame)}
            aria-label={heroGame.favorite ? 'Remove from favorites' : 'Add to favorites'}
            aria-pressed={heroGame.favorite}
            className="macos-favorite orbit-glass-control"
          >
            <Heart size={19} fill={heroGame.favorite ? 'currentColor' : 'none'} />
          </Focusable>
        </section>
      </div>
      <section className="macos-recents" aria-labelledby="macos-recents-title">
        <header>
          <h2 id="macos-recents-title">
            Your next escape<span>{visible.length} games in your collection</span>
          </h2>
          <div
            className="macos-segments orbit-glass-control"
            role="group"
            aria-label="Games to show"
          >
            {(['recent', 'favorites'] as const).map((item, i) => (
              <Focusable
                key={item}
                focusId={`macos-view-${item}`}
                group="macos-view"
                order={i}
                noScale
                aria-pressed={view === item}
                onClick={() => setView(item)}
              >
                {item === 'recent' ? 'Recent' : 'Favorites'}
              </Focusable>
            ))}
          </div>
          <Focusable
            focusId="macos-view-library"
            group="macos-view"
            order={2}
            noScale
            onClick={() => navigate('library')}
            className="macos-view-all"
          >
            View library
            <ArrowUpRight size={14} />
          </Focusable>
        </header>
        {!tiles.length && (
          <p className="py-8 text-sm text-orbit-muted">
            Favorite a game to keep it close at hand.
          </p>
        )}
        <div className="macos-game-grid">
          {tiles.map((game, index) => (
            <Focusable
              key={game.id}
              focusId={`macos-game-${game.id}`}
              group="macos-games"
              order={index}
              noScale
              onFocusSelect={() => selectGame(game)}
              onClick={() => activateGame(game)}
              aria-label={`${game.title}${game.id === heroGame.id ? ', selected' : ''}`}
              aria-pressed={game.id === heroGame.id}
              className="macos-game-tile"
            >
              <SquareGameArt
                image={gameTileImage(game.artwork, 'square')}
                placeholder={artworkPlaceholder(game.id)}
                className="aspect-square w-full"
                roundedClassName="macos-shelf-art"
              />
              <span className="macos-tile-name">{game.title}</span>
              <span className="macos-tile-provider">{providerLabel(game.provider)}</span>
            </Focusable>
          ))}
        </div>
      </section>
    </div>
  )
}
