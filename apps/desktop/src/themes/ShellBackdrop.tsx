import type { useBackdropTransition } from '@/hooks/useBackdropTransition'
import './backdrop.css'

export function ShellBackdrop({
  backdrop,
  reducedMotion,
}: {
  backdrop: ReturnType<typeof useBackdropTransition>
  reducedMotion: boolean
}) {
  const { active, outgoing, finish } = backdrop
  return (
    <div
      className="macos-hero-backdrop"
      aria-hidden="true"
      data-has-image={Boolean(active || (!reducedMotion && outgoing))}
    >
      {outgoing && !reducedMotion && (
        <img
          key={outgoing.url}
          className="macos-hero-layer"
          data-layer={active ? 'outgoing' : 'leaving'}
          src={outgoing.url}
          crossOrigin={outgoing.cors ? 'anonymous' : undefined}
          alt=""
          onAnimationEnd={() => {
            if (!active) finish(outgoing.url)
          }}
        />
      )}
      {active && (
        <img
          key={active.url}
          className="macos-hero-layer"
          data-layer="active"
          src={active.url}
          crossOrigin={active.cors ? 'anonymous' : undefined}
          alt=""
          onAnimationEnd={() => finish(active.url)}
        />
      )}
    </div>
  )
}
