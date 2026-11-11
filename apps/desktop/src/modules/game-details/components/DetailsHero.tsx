import { useLayoutEffect, type ReactNode } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { Heart } from 'lucide-react'
import { ProviderBadge } from '@/components/game/ProviderBadge'
import { LiquidGlass } from '@/components/ui/liquid-glass'
import { gameHeroImage, gameTileImage, artworkPlaceholder } from '@/lib/artwork'
import { useActiveTheme } from '@/hooks/useActiveTheme'
import { cssUrl, mediaSrc } from '@/lib/media'
import { providerLabel } from '@/lib/format'
import type { Game } from '@/types/game'

const platforms: Record<Game['platform'], string> = {
  macos: 'macOS',
  windows: 'Windows',
  linux: 'Linux',
  'nintendo-switch': 'Nintendo Switch',
  unknown: 'Platform not specified',
}
export function DetailsHero({ game, children }: { game: Game; children?: ReactNode }) {
  const reduce = useReducedMotion()
  const theme = useActiveTheme()
  const heroRaw = theme.branding?.wallpaper ?? gameHeroImage(game.artwork)
  const hero = heroRaw ? mediaSrc(heroRaw) : undefined
  const cover = gameTileImage(game.artwork, 'portrait')
  useLayoutEffect(() => {
    const shell = document.querySelector<HTMLElement>('[data-macos-shell]')
    if (!shell) return
    shell.style.setProperty(
      '--macos-details-image',
      hero ? cssUrl(hero) : artworkPlaceholder(game.id),
    )
    shell.dataset.detailsArtwork = 'true'
    return () => {
      shell.style.removeProperty('--macos-details-image')
      delete shell.dataset.detailsArtwork
    }
  }, [game.id, hero])
  return (
    <section className="details-hero" aria-labelledby="details-title">
      <div
        className="details-hero-art"
        aria-hidden
        style={{ backgroundImage: hero ? cssUrl(hero) : artworkPlaceholder(game.id) }}
      />
      <div className="details-hero-shade" aria-hidden />
      <motion.div
        className="details-hero-content"
        initial={reduce ? false : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: reduce ? 0 : 0.4 }}
      >
        <div className="details-identity">
          <p className="details-eyebrow">IN YOUR COLLECTION</p>
          <div className="details-source">
            <ProviderBadge provider={game.provider} />
            <span>{platforms[game.platform]}</span>
            {game.hidden && (
              <span className="details-hidden-label">Hidden from library</span>
            )}
          </div>
          <h1 id="details-title">{game.title}</h1>
          <p className="details-hero-caption">
            {game.totalPlaytimeSeconds > 0
              ? 'An adventure worth coming back to.'
              : 'Your next adventure starts here.'}
          </p>
          <LiquidGlass surface="toolbar" className="details-command-bar" radius={999}>
            {children}
          </LiquidGlass>
        </div>
        <div className="details-cover-wrap" aria-hidden>
          <div
            className="details-cover"
            style={{
              backgroundImage: cover ? cssUrl(cover) : artworkPlaceholder(game.id),
            }}
          />
          <div className="details-cover-caption">
            <span>{providerLabel(game.provider)}</span>
            {game.favorite && <Heart size={13} fill="currentColor" />}
          </div>
        </div>
      </motion.div>
    </section>
  )
}
