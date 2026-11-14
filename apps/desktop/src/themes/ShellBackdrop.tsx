import { clsx } from 'clsx'
import type { useBackdropTransition } from '@/hooks/useBackdropTransition'

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
      className={clsx(
        'macos-hero-backdrop pointer-events-none absolute inset-0 -z-[2] overflow-hidden',
        'before:absolute before:inset-0 before:z-[1] before:bg-[linear-gradient(0deg,rgb(var(--orbit-canvas)/0.92),rgb(var(--orbit-canvas)/0.45))] before:transition-opacity before:duration-[260ms]',
        'after:absolute after:inset-0 after:z-[1] after:bg-[linear-gradient(90deg,rgb(var(--orbit-canvas)/0.86),rgb(var(--orbit-canvas)/0.34)_42%,transparent_78%),linear-gradient(0deg,rgb(var(--orbit-canvas)),rgb(var(--orbit-canvas)/0.75)_20%,rgb(var(--orbit-canvas)/0.13)_62%,transparent)] after:opacity-0 after:transition-opacity after:duration-[260ms]',
        'data-[has-image=true]:before:content-[""] data-[has-image=true]:after:content-[""]',
        'group-data-[console-home=true]/shell:before:opacity-0 group-data-[console-home=true]/shell:after:opacity-100',
      )}
      aria-hidden="true"
      data-has-image={Boolean(active || (!reducedMotion && outgoing))}
    >
      {outgoing && !reducedMotion && (
        <img
          key={outgoing.url}
          className="macos-hero-layer absolute inset-0 size-full object-cover object-[center_35%] data-[layer=leaving]:animate-backdrop-leave"
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
          className="macos-hero-layer absolute inset-0 size-full object-cover object-[center_35%] data-[layer=active]:animate-backdrop-enter"
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
