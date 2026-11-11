import { useRef, useState } from 'react'
import { clsx } from 'clsx'
import './artwork-image.css'

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
      className={clsx('artwork-image', className)}
      data-state={status}
      data-fit={fit}
      aria-busy={status === 'loading'}
      role={status === 'error' ? 'img' : undefined}
      aria-label={status === 'error' ? `${alt || 'Artwork'} unavailable` : undefined}
    >
      {status === 'loading' && <span className="artwork-skeleton" aria-hidden="true" />}
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
