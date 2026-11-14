import { clsx } from 'clsx'
import { mediaSrc } from '@/lib/media'
import type { ThemeBranding } from '@/themes/types'

/** Render actual artwork; never imitate a game logo with text. */
export function ThemeBrand({
  branding,
  className,
  preview = false,
}: {
  branding?: ThemeBranding
  className?: string
  preview?: boolean
}) {
  const logoSrc = branding?.logoImage ? mediaSrc(branding.logoImage) : undefined
  if (logoSrc) {
    return (
      <span
        className={clsx(
          'theme-brand inline-flex items-center leading-none text-white',
          preview
            ? 'absolute inset-4 min-h-0 max-w-full whitespace-normal [&_img]:block [&_img]:h-12 [&_img]:max-h-12 [&_img]:w-auto [&_img]:max-w-full [&_img]:object-contain [&_img]:drop-shadow-[0_4px_18px_#0007]'
            : 'min-h-11 max-w-[min(34vw,420px)] whitespace-nowrap max-[900px]:max-w-[24vw] [&_img]:block [&_img]:h-16 [&_img]:max-h-16 [&_img]:w-auto [&_img]:max-w-full [&_img]:object-contain [&_img]:drop-shadow-[0_4px_18px_#0007] max-[900px]:[&_img]:h-9 max-[900px]:[&_img]:max-h-9',
          className,
        )}
        data-brand="image"
      >
        <img src={logoSrc} alt={branding?.artworkQuery ?? 'Theme logo'} />
      </span>
    )
  }

  return (
    <span
      className={clsx(
        'theme-brand inline-flex items-center leading-none tracking-[0.1em] text-white',
        preview
          ? 'absolute inset-4 min-h-0 max-w-full whitespace-normal text-[22px] leading-snug'
          : 'min-h-11 max-w-[min(34vw,420px)] whitespace-nowrap text-[36px] max-[900px]:max-w-[24vw] max-[900px]:text-base',
        className,
      )}
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
    <span
      className="theme-orbit-mark text-[9px] font-semibold tracking-[0.42em] text-white/35"
      aria-label="Orbit"
    >
      ORBIT
    </span>
  )
}
