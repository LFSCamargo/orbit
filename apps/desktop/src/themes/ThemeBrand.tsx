import { clsx } from 'clsx'
import { mediaSrc } from '@/lib/media'
import type { ThemeBranding } from '@/themes/types'
import './brand.css'

/** Render actual artwork; never imitate a game logo with text. */
export function ThemeBrand({
  branding,
  className,
}: {
  branding?: ThemeBranding
  className?: string
}) {
  const logoSrc = branding?.logoImage ? mediaSrc(branding.logoImage) : undefined
  if (logoSrc) {
    return (
      <span className={clsx('theme-brand', className)} data-brand="image">
        <img src={logoSrc} alt={branding?.artworkQuery ?? 'Theme logo'} />
      </span>
    )
  }

  return (
    <span
      className={clsx('theme-brand', className)}
      data-brand="orbit"
      aria-label="Orbit"
    >
      ORBIT
    </span>
  )
}

/** Small uppercase Orbit signature shown at the bottom of branded themes. */
export function OrbitMark() {
  return (
    <span className="theme-orbit-mark" aria-label="Orbit">
      ORBIT
    </span>
  )
}
