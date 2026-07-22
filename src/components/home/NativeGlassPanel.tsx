import type { ReactNode } from 'react'
import { clsx } from 'clsx'

interface NativeGlassPanelProps {
  /** Hero image shown behind the panel — blurred via CSS filter (works with local/Tauri assets). */
  imageSrc: string | null
  /** Orbit uses backdrop-filter over in-frame hero art; Switch/PS5 use native blur bitmaps. */
  variant?: 'switch' | 'ps5' | 'orbit'
  className?: string
  contentClassName?: string
  children: ReactNode
}

/**
 * Frosted panel.
 * Switch/PS5: viewport-aligned blurred hero bitmap clipped to the panel (no backdrop-filter).
 * Orbit: backdrop-filter over hero art already painted behind the panel in the DOM.
 */
export function NativeGlassPanel({
  imageSrc,
  variant = 'switch',
  className,
  contentClassName,
  children,
}: NativeGlassPanelProps) {
  const useBackdrop = variant === 'orbit'
  const showBlur = Boolean(imageSrc) && !useBackdrop

  return (
    <div
      className={clsx(
        'native-glass-panel relative overflow-hidden',
        useBackdrop && 'native-glass-backdrop',
        className,
      )}
      data-glass-variant={variant}
    >
      {showBlur && imageSrc && (
        <div className="native-glass-blur-wrap pointer-events-none absolute inset-0 overflow-hidden">
          <img
            key={imageSrc}
            src={imageSrc}
            alt=""
            aria-hidden
            draggable={false}
            className={clsx(
              'native-glass-blur absolute h-[100vh] w-[100vw] max-w-none scale-[1.12] object-cover',
              variant === 'ps5'
                ? 'native-glass-blur-bottom left-1/2 bottom-0 -translate-x-1/2 object-[center_bottom]'
                : 'native-glass-blur-center left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 object-center',
            )}
          />
        </div>
      )}
      <div className="native-glass-tint pointer-events-none absolute inset-0" aria-hidden />
      <div className="native-glass-sheen pointer-events-none absolute inset-0 z-[1]" aria-hidden />
      <div className={clsx('relative z-10', contentClassName)}>{children}</div>
    </div>
  )
}
