import { useRef, useState } from 'react'
import { clsx } from 'clsx'

/** Keep a fixed frame visible until the browser's asynchronous decode completes. */
export function ArtworkImage({
  src,
  alt = '',
  fit = 'cover',
  className,
}: {
  src: string
  alt?: string
  fit?: 'cover' | 'contain'
  className?: string
}) {
  const latest = useRef(src)
  latest.current = src
  const [state, setState] = useState<{
    src: string
    status: 'loading' | 'ready' | 'error'
  }>({ src, status: 'loading' })
  const status = state.src === src ? state.status : 'loading'

  return (
    <span
      className={clsx(
        'artwork-image isolate block overflow-hidden',
        !className?.split(/\s+/).includes('absolute') && 'relative',
        '[&>img]:block [&>img]:size-full [&>img]:object-center [&>img]:opacity-0 [&>img]:transition-opacity [&>img]:duration-[180ms]',
        fit === 'contain' ? '[&>img]:object-contain' : '[&>img]:object-cover',
        'data-[state=ready]:[&>img]:opacity-100',
        'data-[state=error]:[&>img]:invisible',
        'motion-reduce:[&>img]:transition-none',
        className,
      )}
      data-state={status}
      data-fit={fit}
      aria-busy={status === 'loading'}
      role={status === 'error' ? 'img' : undefined}
      aria-label={status === 'error' ? `${alt || 'Artwork'} unavailable` : undefined}
    >
      {status === 'loading' && <ArtworkSkeleton />}
      <img
        key={src}
        src={src}
        alt={alt}
        loading="lazy"
        decoding="async"
        draggable={false}
        onLoad={async (event) => {
          const image = event.currentTarget
          try {
            await image.decode?.()
            if (latest.current === src) setState({ src, status: 'ready' })
          } catch {
            if (latest.current === src) setState({ src, status: 'error' })
          }
        }}
        onError={() => {
          if (latest.current === src) setState({ src, status: 'error' })
        }}
      />
    </span>
  )
}

export function ArtworkSkeleton({ className }: { className?: string }) {
  return (
    <span
      className={clsx(
        'artwork-skeleton absolute inset-0 overflow-hidden rounded-[inherit] bg-orbit-foreground/[0.055]',
        'after:absolute after:inset-0 after:-translate-x-full after:animate-artwork-shimmer after:bg-[linear-gradient(100deg,transparent_15%,rgb(255_255_255/0.11)_48%,transparent_80%)] after:content-[""]',
        'motion-reduce:after:translate-x-0 motion-reduce:after:animate-none motion-reduce:after:opacity-35',
        className,
      )}
      aria-hidden="true"
    />
  )
}
