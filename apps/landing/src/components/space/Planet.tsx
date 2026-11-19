'use client'

import dynamic from 'next/dynamic'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { canShow3DGlobe, readGlobeSupport } from '@/lib/globeSupport'
import { planetGeometry } from '@/lib/planetGeometry'

/** Three.js loads only where the globe is shown, after the page is idle. */
const OrbitGlobe = dynamic(() => import('./OrbitGlobe'), { ssr: false })

/** Size before the hero is measured (the design size). */
const DESIGN = { width: 1440, height: 900 }

const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect

const RIM =
  'absolute left-1/2 aspect-square -translate-x-1/2 rounded-full shadow-[0_0_0_1.5px_rgb(255_176_104/0.95),0_-3px_14px_1px_rgb(255_150_70/0.9),0_-16px_60px_6px_rgb(255_104_44/0.55)]'

/** The horizon planet, as in Orbit's splash and onboarding: the Earth photo
 * under a fire rim, an atmosphere and the sun's bloom, its rim peaking at 84%
 * of the hero and leaving through the bottom edge. Where the browser allows
 * it, the real turning 3D globe fades in over the photo once it has drawn. */
export function Planet() {
  const ref = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState(DESIGN)
  const [want3D, setWant3D] = useState(false)
  const [globeReady, setGlobeReady] = useState(false)

  useIsoLayoutEffect(() => {
    const element = ref.current
    if (!element) return
    // Layout size: a transform on an ancestor must not shrink the planet.
    const measure = () => {
      const { offsetWidth: width, offsetHeight: height } = element
      if (width && height) setSize({ width, height })
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!canShow3DGlobe(readGlobeSupport())) return
    const idle =
      window.requestIdleCallback ?? ((run: () => void) => window.setTimeout(run, 400))
    const cancel = window.cancelIdleCallback ?? window.clearTimeout
    const handle = idle(() => setWant3D(true))
    return () => cancel(handle as number)
  }, [])

  const planet = planetGeometry(size.width, size.height)
  return (
    <div
      ref={ref}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      {/* Atmosphere: a wide warm haze centred on the horizon. */}
      <div
        className="glow-breathe absolute left-1/2 h-[56%] w-[120%] -translate-x-1/2 -translate-y-1/2 bg-[radial-gradient(50%_50%_at_50%_50%,rgb(255_120_50/0.4),rgb(255_80_30/0.13)_50%,transparent_75%)]"
        style={{ top: planet.top, ['--period' as string]: '6s' }}
      />
      <div
        className={`planet ${RIM} overflow-hidden bg-[radial-gradient(circle_at_50%_0%,#3a2218,#120c0d_7%,#08070a_20%)] transition-opacity duration-1000`}
        style={{ width: planet.radius * 2, top: planet.top, opacity: globeReady ? 0 : 1 }}
      >
        <div className="planet-turn absolute inset-0">
          {/* eslint-disable-next-line @next/next/no-img-element -- sized from the measured hero */}
          <img
            src="/assets/space/globe.webp"
            alt=""
            draggable={false}
            className="absolute left-1/2 max-w-none -translate-x-1/2 select-none opacity-55 mix-blend-luminosity [filter:grayscale(1)_brightness(0.7)_contrast(1.15)]"
            style={{ width: planet.photoWidth, top: -0.57 * 0.5625 * planet.photoWidth }}
          />
        </div>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgb(255_120_50/0.3),rgb(140_50_20/0.12)_6%,transparent_14%)] mix-blend-screen" />
      </div>
      {want3D && (
        <div
          className="absolute inset-0 transition-opacity duration-1000"
          style={{ opacity: globeReady ? 1 : 0 }}
        >
          <OrbitGlobe
            width={size.width}
            height={size.height}
            onReady={() => setGlobeReady(true)}
          />
          <div className={RIM} style={{ width: planet.radius * 2, top: planet.top }} />
        </div>
      )}
      {/* The sun's bloom just behind the horizon, and its hot core. */}
      <div
        className="glow-breathe absolute left-1/2 h-[26%] w-[70%] -translate-x-1/2 -translate-y-1/2 bg-[radial-gradient(50%_50%_at_50%_50%,rgb(255_200_140/0.55),rgb(255_130_50/0.25)_40%,transparent_72%)] mix-blend-screen"
        style={{
          top: planet.top,
          ['--period' as string]: '4.5s',
          ['--delay' as string]: '-2s',
        }}
      />
      <div
        className="glow-breathe absolute left-1/2 h-[3%] w-[22%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(50%_50%,rgb(255_236_210/0.9),rgb(255_170_100/0.4)_55%,transparent)] blur-[2px]"
        style={{ top: planet.top, ['--period' as string]: '3s' }}
      />
    </div>
  )
}
