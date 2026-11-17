import { useInfiniteCarousel, shouldLoopCarousel } from '../hooks/useInfiniteCarousel'
import { HeroLogo } from './HeroLogo'
import { useEffect, useMemo, useRef } from 'react'
import { useFittedTitle } from '../hooks/useFittedTitle'
import { useShelfEdgeFade } from '../hooks/useShelfEdgeFade'
import { shelfFadeMaskClass, SHELF_FOOTER_DISSOLVE_MASK } from '../lib/carouselFade'
import {
  animateScrollBy,
  focusKeepInViewDelta,
  prefersReducedMotion,
} from '../lib/shelfScroll'
import { clsx } from 'clsx'
import { ArrowUpRight, Clock3, Heart, Play, Square } from 'lucide-react'
import { focusManager } from '@/controllers/FocusManager'
import { Focusable } from '@/components/focus/Focusable'
import { CarouselArtwork } from './CarouselArtwork'
import { LiquidGlass } from '@/components/ui/liquid-glass'
import { artworkPlaceholder, gameLogoImage, gameSquareTileImage } from '@/lib/artwork'
import { formatPlaytime, providerLabel, formatRelativeDate } from '@/lib/format'
import { homeLaunchId } from '../lib/homeHero'
import { isWindowsSteamPlay } from '@/lib/playLibraryEntry'
import { useUiStore } from '@/stores/ui.store'
import { createHomeGameHandlers, type ThemeHomeProps } from '../hooks/useHomeGameActions'

export function MacosHome({
  entries,
  heroEntry,
  activeSession,
  onPlay,
  onStop,
  onFavorite,
  view = 'recent',
  onView,
  shelfEntries = entries,
  shelfPending = false,
  shelfError = false,
  onRetry,
  showFavorites = false,
  steamReady = true,
}: ThemeHomeProps) {
  const setHero = useUiStore((s) => s.setHeroGameId)
  const details = useUiStore((s) => s.openGameDetails)
  const navigate = useUiStore((s) => s.setScreen)
  const setSettingsTab = useUiStore((s) => s.setSettingsTab)
  const titleRef = useFittedTitle(heroEntry.game.title)
  const shelfRef = useRef<HTMLDivElement>(null)
  const stopShelfScroll = useRef(() => {})
  useEffect(() => () => stopShelfScroll.current(), [])
  const heroGame = heroEntry.game
  const { selectGame } = createHomeGameHandlers(
    activeSession,
    setHero,
    onPlay,
    onStop,
    heroEntry.id,
    steamReady,
  )
  const running = activeSession?.gameId === homeLaunchId(heroEntry)
  const steamBlocked = isWindowsSteamPlay(heroEntry) && !steamReady && !running
  const visible = useMemo(() => entries.filter((entry) => !entry.game.hidden), [entries])
  const tiles = useMemo(
    () => shelfEntries.filter((entry) => !entry.game.hidden).slice(0, 12),
    [shelfEntries],
  )
  const displayedTiles = useMemo(
    () => (!shelfPending && !shelfError ? tiles : []),
    [tiles, shelfPending, shelfError],
  )
  const shelfLooping = shouldLoopCarousel(displayedTiles.length)
  const carouselCards = useInfiniteCarousel(shelfRef, displayedTiles)
  const edgeFade = useShelfEdgeFade(shelfRef, shelfLooping, displayedTiles.length)
  const logoImage = gameLogoImage(
    heroGame.artwork,
    heroEntry.steamAppId ?? heroGame.sourceId,
  )

  return (
    <div className={clsx('macos-home', 'min-w-0 px-[var(--console-gutter)] pb-5')}>
      <HeroLogo src={logoImage} />
      <div
        className={clsx(
          'macos-feature-grid',
          'relative flex min-h-[clamp(300px,43vh,660px)] items-center',
          'max-[900px]:min-h-[42vh] max-[520px]:min-h-[390px]',
          '[@media(max-height:740px)_and_(min-width:900px)]:min-h-[260px]',
        )}
      >
        <section
          className={clsx('macos-feature', 'flex min-h-[inherit] w-full items-center')}
          aria-labelledby="macos-feature-title"
        >
          <div
            className={clsx(
              'macos-feature-content',
              'relative max-w-[560px] py-8',
              'max-[900px]:max-w-[75%] max-[520px]:max-w-full max-[520px]:pt-[55px]',
              '[@media(max-height:740px)_and_(min-width:900px)]:py-3.5',
            )}
          >
            <p
              className={clsx(
                'macos-eyebrow',
                'text-[10px] font-semibold tracking-[0.22em] text-[#ffffff9c]',
              )}
            >
              {running ? 'NOW PLAYING' : 'CONTINUE YOUR ADVENTURE'}
            </p>
            <span
              className={clsx(
                'macos-provider',
                'mt-5 inline-block text-[11px] tracking-[0.02em] text-[#ffffff9c]',
                '[@media(max-height:740px)_and_(min-width:900px)]:mt-3',
              )}
            >
              {providerLabel(heroGame.provider)}
            </span>
            <h2
              id="macos-feature-title"
              ref={titleRef}
              className={clsx(
                'mb-[18px] mt-3 max-w-full whitespace-nowrap text-[4.2vw] font-semibold leading-[1.02] tracking-[-0.055em] text-white [text-shadow:0_3px_35px_#0002]',
                'max-[520px]:max-w-[90%]',
              )}
            >
              {heroGame.title}
            </h2>
            <p
              className={clsx(
                'line-clamp-2 max-w-[480px] overflow-hidden text-[13px] leading-[1.8] text-[#ffffffaa]',
                'min-[1600px]:text-base',
                '[@media(max-height:740px)_and_(min-width:900px)]:line-clamp-1',
              )}
            >
              {heroGame.description || 'An entire world, just one click away.'}
            </p>
            <LiquidGlass
              surface="toolbar"
              className={clsx(
                'macos-action-glass',
                'mt-[26px] inline-block max-w-full',
                '[@media(max-height:740px)_and_(min-width:900px)]:mt-[18px]',
              )}
              radius={999}
            >
              <div
                className={clsx(
                  'macos-feature-actions',
                  'flex items-center gap-1.5 p-1.5',
                )}
              >
                <Focusable
                  focusId="macos-play"
                  group="macos-feature"
                  order={0}
                  noScale
                  onClick={() => {
                    if (running) onStop()
                    else if (steamBlocked) {
                      setSettingsTab('steam')
                      navigate('settings')
                    } else onPlay(heroEntry)
                  }}
                  className={clsx(
                    'macos-play',
                    'flex min-h-12 items-center gap-[11px] rounded-full bg-[linear-gradient(#ffffffed,#dce9fce0)] px-[26px] text-[13px] font-[650] text-orbit-canvas shadow-play hover:bg-white',
                    'max-[520px]:px-5',
                  )}
                >
                  {running ? (
                    <Square size={16} />
                  ) : (
                    <Play size={16} fill="currentColor" />
                  )}
                  {running
                    ? 'Stop game'
                    : steamBlocked
                      ? 'Sign in to Steam'
                      : 'Jump back in'}
                </Focusable>
                <Focusable
                  focusId="macos-details"
                  group="macos-feature"
                  order={1}
                  noScale
                  onClick={() => details(heroEntry.id)}
                  className={clsx(
                    'macos-details orbit-glass-control',
                    'flex min-h-12 items-center gap-2.5 rounded-full px-5 text-xs text-white hover:bg-[#ffffff12]',
                    'max-[520px]:px-[15px]',
                  )}
                >
                  Details
                  <ArrowUpRight size={15} />
                </Focusable>
              </div>
            </LiquidGlass>
            <div
              className={clsx(
                'macos-game-meta',
                'mt-[18px] flex flex-wrap items-center gap-5 text-[10px] text-[#ffffff70]',
                '[@media(max-height:740px)_and_(min-width:900px)]:mt-3',
              )}
            >
              <span className="flex items-center gap-1.5">
                <Clock3 size={14} />
                {formatPlaytime(heroGame.totalPlaytimeSeconds)}
              </span>
              <span className="flex items-center gap-1.5">
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
            onClick={() => onFavorite(heroEntry)}
            aria-label={heroGame.favorite ? 'Remove from favorites' : 'Add to favorites'}
            aria-pressed={heroGame.favorite}
            className={clsx(
              'macos-favorite orbit-glass-control',
              'absolute right-0 top-8 grid size-[42px] place-items-center rounded-full border border-[#ffffff25] bg-[#ffffff0c] text-white aria-pressed:text-[#ffc8da]',
              'max-[520px]:top-3.5',
              '[@media(prefers-reduced-transparency:reduce)]:bg-orbit-panel [@media(prefers-reduced-transparency:reduce)]:backdrop-blur-none',
            )}
          >
            <Heart size={19} fill={heroGame.favorite ? 'currentColor' : 'none'} />
          </Focusable>
        </section>
      </div>
      <section
        className={clsx('macos-recents', 'relative z-[1] pt-2')}
        aria-labelledby="macos-recents-title"
      >
        <header
          className={clsx(
            'mb-5 flex items-center gap-6',
            'max-[520px]:flex-wrap max-[520px]:gap-2.5',
          )}
        >
          <h2
            id="macos-recents-title"
            className={clsx(
              'mr-auto text-lg font-[550] tracking-[-0.035em]',
              'max-[520px]:text-base min-[1600px]:text-[22px]',
            )}
          >
            Your next escape
            <span className="mt-1.5 block text-[10px] font-normal tracking-normal text-[#ffffff65]">
              {visible.length} games in your collection
            </span>
          </h2>
          <div
            className={clsx(
              'macos-segments orbit-glass-control',
              'flex rounded-full border border-[#ffffff17] bg-[#ffffff08] p-1',
              '[@media(prefers-reduced-transparency:reduce)]:bg-orbit-panel [@media(prefers-reduced-transparency:reduce)]:backdrop-blur-none',
            )}
            role="group"
            aria-label="Games to show"
          >
            {(showFavorites
              ? (['recent', 'installed', 'favorites'] as const)
              : (['recent', 'installed'] as const)
            ).map((item, i) => (
              <Focusable
                key={item}
                focusId={`macos-view-${item}`}
                group="macos-view"
                order={i}
                noScale
                aria-pressed={view === item}
                onClick={() => onView?.(item)}
                className={clsx(
                  'rounded-full px-4 py-2 text-[11px] text-[#ffffff80]',
                  'aria-pressed:bg-[#ffffff1c] aria-pressed:text-white aria-pressed:shadow-[inset_0_1px_#ffffff18]',
                  'max-[520px]:px-3',
                )}
              >
                {item === 'recent'
                  ? 'Recent'
                  : item === 'installed'
                    ? 'Installed'
                    : 'Favorites'}
              </Focusable>
            ))}
          </div>
          <Focusable
            focusId="macos-view-library"
            group="macos-view"
            order={showFavorites ? 3 : 2}
            noScale
            onClick={() => navigate('library')}
            className={clsx(
              'macos-view-all',
              'flex items-center gap-2 p-2 text-[11px] text-[#ffffffa6]',
              'max-[520px]:hidden',
            )}
          >
            View library
            <ArrowUpRight size={14} />
          </Focusable>
        </header>
        {!shelfPending && !shelfError && !tiles.length && (
          <p className="py-8 text-sm text-orbit-muted">
            {view === 'favorites'
              ? 'Favorite a game to keep it close at hand.'
              : view === 'installed'
                ? 'No installed games yet.'
                : 'No recent games yet.'}
          </p>
        )}
        {shelfPending && (
          <p role="status" className="py-8 text-orbit-muted">
            Loading games…
          </p>
        )}
        {shelfError && (
          <div role="alert">
            Could not load games.{' '}
            <Focusable focusId="home-retry" group="macos-games" onClick={onRetry}>
              Try again
            </Focusable>
          </div>
        )}
        <div
          className={clsx(
            'macos-shelf-viewport-fade relative',
            shelfLooping && '-mx-[var(--console-gutter)]',
            shelfLooping && SHELF_FOOTER_DISSOLVE_MASK,
          )}
        >
          <div
            ref={shelfRef}
            aria-busy={shelfPending}
            data-shelf-looping={shelfLooping ? 'true' : 'false'}
            className={clsx(
              'macos-game-grid',
              'scrollbar-none flex w-full min-w-0 gap-[22px] overflow-x-auto pb-[22px] pt-[9px]',
              shelfFadeMaskClass(edgeFade),
              'max-[900px]:gap-[18px]',
            )}
          >
            {carouselCards.map(({ entry, copy, focusId }, index) => {
              const tileImage = gameSquareTileImage(entry.game.artwork)
              return (
                <Focusable
                  key={focusId}
                  focusId={focusId}
                  data-loop-copy={copy}
                  data-loop-entry={entry.id}
                  group="macos-games"
                  order={index}
                  noRing
                  className={clsx(
                    'macos-game-tile orbit-art-focus group/tile',
                    'min-w-0 flex-[0_0_clamp(135px,13vw,218px)] rounded-[var(--shelf-radius)] text-left [--shelf-radius:clamp(22px,2vw,36px)]',
                    'data-[focused=true]:z-10',
                    '!duration-500 motion-reduce:data-[focused=true]:transform-none',
                    'max-[900px]:flex-[0_0_145px] max-[520px]:flex-[0_0_135px]',
                    '[@media(max-height:740px)_and_(min-width:900px)]:flex-[0_0_130px]',
                  )}
                  onFocusSelect={() => {
                    selectGame(entry)
                    const shelf = shelfRef.current
                    const node = focusManager.getFocusedNode()?.element
                    if (!shelf || !node || !shelf.contains(node)) return
                    if (node.dataset.loopRebased) {
                      delete node.dataset.loopRebased
                      return
                    }
                    const box = node.getBoundingClientRect()
                    const delta = focusKeepInViewDelta(box, innerWidth, shelf.clientWidth)
                    stopShelfScroll.current()
                    stopShelfScroll.current = animateScrollBy(shelf, delta, {
                      reduceMotion: prefersReducedMotion(),
                    })
                  }}
                  onFocus={() => focusManager.setFocus(focusId, { scroll: false })}
                  onClick={() => details(entry.id)}
                  aria-label={`${entry.game.title}${entry.id === heroEntry.id ? ', selected' : ''}`}
                  aria-pressed={entry.id === heroEntry.id}
                >
                  <div className="orbit-art-focus-target rounded-[var(--shelf-radius)]">
                    <CarouselArtwork
                      key={tileImage ?? entry.id}
                      image={tileImage}
                      fit="cover"
                      placeholder={artworkPlaceholder(entry.id)}
                      className={clsx(
                        'aspect-square w-full border border-[#ffffff28] shadow-tile transition-shadow duration-300',
                        'group-aria-pressed/tile:border-[#ffc8da] group-aria-pressed/tile:shadow-tile-selected',
                        'group-data-[focused=true]/tile:shadow-tile-focus',
                      )}
                      roundedClassName="rounded-[var(--shelf-radius)]"
                    />
                  </div>
                  <span
                    className={clsx(
                      'macos-tile-name',
                      'mt-3 block truncate text-xs font-[550] text-[#ffffffe0]',
                      'min-[1600px]:text-sm',
                    )}
                  >
                    {entry.game.title}
                  </span>
                  <span
                    className={clsx(
                      'macos-tile-provider',
                      'mt-1 block text-[9px] text-[#ffffff60]',
                    )}
                  >
                    {providerLabel(entry.game.provider)}
                  </span>
                </Focusable>
              )
            })}
          </div>
        </div>
      </section>
    </div>
  )
}
