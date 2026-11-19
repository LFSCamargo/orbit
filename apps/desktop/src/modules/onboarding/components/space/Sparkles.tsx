// Adapted from Aceternity UI "Sparkles" (https://ui.aceternity.com/components/sparkles):
// the tsParticles field, trimmed to the options that change anything, with
// clicks no longer adding particles, and still when motion is reduced.
import type { ISourceOptions } from '@tsparticles/engine'
import Particles, { initParticlesEngine } from '@tsparticles/react'
import { loadSlim } from '@tsparticles/slim'
import { clsx } from 'clsx'
import { motion, useAnimation } from 'framer-motion'
import { useEffect, useId, useMemo, useState } from 'react'

let engine: Promise<void> | null = null
/** The particles engine loads once for the whole app. */
function loadEngine() {
  engine ??= initParticlesEngine(loadSlim)
  return engine
}

export function Sparkles({
  className,
  color = '#ffffff',
  density = 90,
  minSize = 0.4,
  maxSize = 1.4,
  speed = 2,
  still = false,
}: {
  className?: string
  color?: string
  /** Particles per 400 × 400 px. */
  density?: number
  minSize?: number
  maxSize?: number
  /** How fast each particle fades in and out. */
  speed?: number
  still?: boolean
}) {
  const id = useId()
  const [ready, setReady] = useState(false)
  const controls = useAnimation()

  useEffect(() => {
    let live = true
    void loadEngine().then(() => live && setReady(true))
    return () => {
      live = false
    }
  }, [])

  const options = useMemo<ISourceOptions>(
    () => ({
      background: { color: { value: 'transparent' } },
      fullScreen: { enable: false },
      fpsLimit: 60,
      detectRetina: true,
      interactivity: {
        events: { onClick: { enable: false }, onHover: { enable: false } },
      },
      particles: {
        color: { value: color },
        number: { density: { enable: true, width: 400, height: 400 }, value: density },
        move: {
          enable: !still,
          direction: 'none',
          outModes: { default: 'out' },
          speed: { min: 0.05, max: 0.45 },
        },
        opacity: {
          value: { min: 0.1, max: 1 },
          animation: { enable: !still, speed, sync: false, startValue: 'random' },
        },
        size: { value: { min: minSize, max: maxSize } },
        shape: { type: 'circle' },
      },
    }),
    [color, density, minSize, maxSize, speed, still],
  )

  return (
    <motion.div animate={controls} className={clsx('opacity-0', className)}>
      {ready && (
        <Particles
          id={`sparkles-${id.replace(/:/g, '')}`}
          className="size-full"
          options={options}
          particlesLoaded={async (container) => {
            if (container)
              await controls.start({ opacity: 1, transition: { duration: 1 } })
          }}
        />
      )}
    </motion.div>
  )
}
