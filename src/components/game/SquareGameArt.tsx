import { clsx } from 'clsx'

interface SquareGameArtProps {
  image?: string
  placeholder?: string
  fit?: 'cover' | 'contain'
  className?: string
  roundedClassName?: string
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
        'square-game-art aspect-square w-full shrink-0 overflow-hidden bg-center bg-no-repeat',
        fit === 'contain' ? 'bg-contain' : 'bg-cover',
        roundedClassName,
        className,
      )}
      style={{
        backgroundImage: image ? `url(${image})` : placeholder,
      }}
    />
  )
}

export const LIBRARY_SQUARE_GRID_CLASS: Record<'orbit' | 'ps5' | 'switch', string> = {
  ps5: 'library-square-grid library-square-grid-ps5',
  switch: 'library-square-grid library-square-grid-switch',
  orbit: 'library-square-grid library-square-grid-orbit',
}
