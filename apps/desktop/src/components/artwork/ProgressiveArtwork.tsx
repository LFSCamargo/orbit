import { clsx } from 'clsx'
import { useRef, useState } from 'react'
import type { ArtworkSources } from '@/lib/artworkSources'

type Status = 'empty' | 'loading' | 'ready' | 'error'

/** Game art that never pops in: the placeholder paints at once, a small
 * preview fades in blurred, and the full image (2x on Retina) replaces it
 * only after it has decoded. A failed full image leaves the preview.
 */
export function ProgressiveArtwork({
  sources,
  placeholder,
  alt = '',
  fit = 'cover',
  className,
}: {
  sources: ArtworkSources
  /** CSS background shown before and behind any image, e.g. a gradient. */
  placeholder?: string
  alt?: string
  fit?: 'cover' | 'contain'
  className?: string
}) {
  const { low, high, high2x } = sources
  const latest = useRef(high)
  latest.current = high
  const [loaded, setLoaded] = useState<{ src?: string; status: Status }>({
    status: 'loading',
  })
  const status: Status = !high ? 'empty' : loaded.src === high ? loaded.status : 'loading'
  const settle = (next: Status) => {
    if (latest.current === high) setLoaded({ src: high, status: next })
  }

  return (
    <span
      className={clsx(
        'progressive-artwork relative isolate block overflow-hidden bg-black bg-cover bg-center',
        '[&>img]:absolute [&>img]:inset-0 [&>img]:size-full [&>img]:object-center',
        fit === 'contain' ? '[&>img]:object-contain' : '[&>img]:object-cover',
        className,
      )}
      style={{ backgroundImage: placeholder }}
      data-state={status}
      aria-busy={status === 'loading'}
    >
      {low && status !== 'ready' && (
        <img
          key={`low-${low}`}
          src={low}
          alt=""
          aria-hidden="true"
          decoding="async"
          draggable={false}
          className="progressive-artwork-preview scale-110 opacity-80 blur-[14px] motion-reduce:blur-none"
        />
      )}
      {high && (
        <img
          key={high}
          src={high}
          srcSet={high2x ? `${high} 1x, ${high2x} 2x` : undefined}
          alt={alt}
          loading="lazy"
          decoding="async"
          draggable={false}
          className={clsx(
            'progressive-artwork-full transition-[opacity,filter] duration-500 ease-out motion-reduce:transition-none',
            status === 'ready' ? 'opacity-100 blur-0' : 'opacity-0 blur-[6px]',
          )}
          onLoad={async (event) => {
            try {
              await event.currentTarget.decode?.()
              settle('ready')
            } catch {
              settle('error')
            }
          }}
          onError={() => settle('error')}
        />
      )}
    </span>
  )
}
