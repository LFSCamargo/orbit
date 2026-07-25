import { clsx } from 'clsx'
import { cssUrl } from '@/lib/media'

interface SquareGameArtProps {
  image?: string
  placeholder?: string
  fit?: 'cover' | 'contain'
  className?: string
  roundedClassName?: string
}

function backgroundImageValue(image?: string, placeholder?: string): string | undefined {
  if (image) {
    return cssUrl(image)
  }
  return placeholder
}

/** Normalized 1:1 game tile with either full-bleed cover or contained icon artwork. */
export function SquareGameArt({
  image,
  placeholder,
  fit = 'cover',
  className,
  roundedClassName = 'rounded-xl',
}: SquareGameArtProps) {
  return (
    <div
      className={clsx(
        // Do not force `w-full` here — home carousels pass fixed `h-* w-*` sizes inside
        // flex rows, and `w-full` collapses those tiles to zero width.
        'square-game-art shrink-0 overflow-hidden bg-center bg-no-repeat',
        fit === 'contain' ? 'bg-contain' : 'bg-cover',
        roundedClassName,
        className,
      )}
      style={{
        backgroundImage: backgroundImageValue(image, placeholder),
      }}
    />
  )
}

export const LIBRARY_SQUARE_GRID_CLASS: Record<'orbit' | 'ps5' | 'switch', string> = {
  ps5: 'library-square-grid library-square-grid-ps5',
  switch: 'library-square-grid library-square-grid-switch',
  orbit: 'library-square-grid library-square-grid-orbit',
}
