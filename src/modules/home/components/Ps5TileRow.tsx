import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { clsx } from 'clsx'
import { Focusable } from '@/components/focus/Focusable'
import { gameTileImage } from '@/lib/artwork'
import { placeholderGradient } from '@/lib/format'
import type { Game } from '@/types/game'

interface Ps5TileRowProps {
  carouselGames: Game[]
  heroGame: Game
  selectGame: (game: Game) => void
  activateGame: (game: Game) => void
}

export function Ps5TileRow({
  carouselGames,
  heroGame,
  selectGame,
  activateGame,
}: Ps5TileRowProps) {
  const selectedIndex = Math.max(
    0,
    carouselGames.findIndex((game) => game.id === heroGame.id),
  )
  const hasNextTile = selectedIndex < carouselGames.length - 1
  const rowRef = useRef<HTMLDivElement>(null)
  const [titleLeftPx, setTitleLeftPx] = useState(0)

  useLayoutEffect(() => {
    const row = rowRef.current
    if (!row) return

    const measureTitleLeft = () => {
      const selected = row.querySelector(
        '[data-ps5-tile="selected"]',
      ) as HTMLElement | null
      const slot = row.querySelector('.ps5-tile-title-slot') as HTMLElement | null
      if (!selected || !slot) return

      const art =
        (selected.querySelector('.ps5-tile-art') as HTMLElement | null) ?? selected
      const tiles = [
        ...row.querySelectorAll('[data-focus-id^="ps5-tile-"]'),
      ] as HTMLElement[]
      const index = tiles.indexOf(selected)
      const next = index >= 0 ? tiles[index + 1] : null
      const slotLeft = !next
        ? slot.getBoundingClientRect().left + 160
        : slot.getBoundingClientRect().left

      if (next) {
        const nextArt =
          (next.querySelector('.ps5-tile-art') as HTMLElement | null) ?? next
        setTitleLeftPx(Math.round(nextArt.getBoundingClientRect().left - slotLeft))
        return
      }

      // Last item: no neighbor on the right — pin to the left edge of the focused cover.
      setTitleLeftPx(Math.round(art.getBoundingClientRect().left - slotLeft))
    }

    const selected = row.querySelector('[data-ps5-tile="selected"]') as HTMLElement | null
    selected?.scrollIntoView({
      behavior: 'auto',
      inline: 'nearest',
      block: 'nearest',
    })

    measureTitleLeft()
    const frame = window.requestAnimationFrame(measureTitleLeft)
    const afterGrow = window.setTimeout(measureTitleLeft, 320)

    const track = row.querySelector('.ps5-game-row-track')
    track?.addEventListener('scroll', measureTitleLeft, { passive: true })
    window.addEventListener('resize', measureTitleLeft)

    const observer =
      typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measureTitleLeft) : null
    if (selected) observer?.observe(selected)

    return () => {
      window.cancelAnimationFrame(frame)
      window.clearTimeout(afterGrow)
      track?.removeEventListener('scroll', measureTitleLeft)
      window.removeEventListener('resize', measureTitleLeft)
      observer?.disconnect()
    }
  }, [heroGame.id, selectedIndex, hasNextTile, carouselGames.length])

  return (
    <div
      ref={rowRef}
      className="ps5-game-row shrink-0 px-8 pt-4"
      style={
        {
          '--ps5-selected-index': selectedIndex,
          '--ps5-title-under-next': hasNextTile ? 1 : 0,
          '--ps5-title-left': `${titleLeftPx}px`,
        } as CSSProperties
      }
      data-ps5-title-mode={hasNextTile ? 'next' : 'last'}
    >
      <div className="ps5-game-row-track scrollbar-none flex items-start gap-3 overflow-x-auto overflow-y-visible">
        {carouselGames.map((game, index) => {
          const icon = gameTileImage(game.artwork, 'square')
          const selected = heroGame.id === game.id
          return (
            <Focusable
              key={game.id}
              focusId={`ps5-tile-${game.id}`}
              group="ps5-tiles"
              order={index}
              noScale
              noRing
              onFocusSelect={() => selectGame(game)}
              onClick={() => activateGame(game)}
              className={clsx('ps5-tile shrink-0', selected && 'ps5-tile-selected')}
              data-ps5-tile={selected ? 'selected' : 'idle'}
            >
              <div
                className="ps5-tile-art square-game-art overflow-hidden rounded-[10px] bg-cover bg-center"
                style={{
                  backgroundImage: icon
                    ? `url(${icon})`
                    : placeholderGradient(game.id),
                }}
              />
            </Focusable>
          )
        })}
      </div>

      <div className="ps5-tile-title-slot" aria-live="polite">
        <AnimatePresence mode="wait" initial={false}>
          <motion.h1
            key={heroGame.id}
            className={clsx(
              'ps5-tile-title ps5-hero-title truncate font-normal',
              !hasNextTile && 'ps5-tile-title-last',
            )}
            style={{ left: titleLeftPx }}
            initial={{ opacity: 0, x: hasNextTile ? -10 : 10, y: 6 }}
            animate={{ opacity: 1, x: 0, y: 0 }}
            exit={{ opacity: 0, x: hasNextTile ? 8 : -8, y: 4 }}
            transition={{ duration: 0.28, ease: [0.2, 0.8, 0.2, 1] }}
          >
            {heroGame.title}
          </motion.h1>
        </AnimatePresence>
      </div>
    </div>
  )
}
