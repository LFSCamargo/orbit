import { useReducedMotion } from 'framer-motion'
import {
  lazy,
  Suspense,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react'
import globe from '@/assets/onboarding/globe.webp'
import { graphicsTier } from '../lib/graphicsSupport'
import { planetGeometry } from '../lib/planetGeometry'
import { Meteors } from './space/Meteors'

/** Three.js and tsParticles load only when onboarding shows, not with the
 * rest of Orbit. */
const SpaceGlobe = lazy(() => import('./space/SpaceGlobe'))
const Sparkles = lazy(() =>
  import('./space/Sparkles').then((module) => ({ default: module.Sparkles })),
)

/** Small deterministic PRNG, so the star field is the same on every render. */
function seeded(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

type Star = {
  x: number
  y: number
  size: number
  brightness: number
  period: number
  delay: number
}

/** Stars above the horizon only: far ones are many, tiny and dim; near ones
 * are fewer and brighter, and twinkle on their own rhythm. */
function starField(count: number, seed: number, near: boolean): Star[] {
  const random = seeded(seed)
  return Array.from({ length: count }, () => ({
    x: random() * 100,
    y: random() * 78,
    size: near ? 1.2 + random() * 1.8 : 0.6 + random() * 0.7,
    brightness: near ? 0.45 + random() * 0.5 : 0.18 + random() * 0.25,
    period: 2 + random() * 3.5,
    delay: -random() * 8,
  }))
}

const FAR_STARS = starField(70, 7, false)
const NEAR_STARS = starField(30, 42, true)

/** Where the horizon peaks, from the top of the card. */
const HORIZON = '84cqh'
/** Card size before it is measured (the design size). */
const DESIGN_SIZE = { width: 1080, height: 700 }

/** The card's size in pixels, kept current as it resizes. */
function useCardSize() {
  const ref = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState(DESIGN_SIZE)
  useLayoutEffect(() => {
    const element = ref.current
    if (!element) return
    const measure = () => {
      const { width, height } = element.getBoundingClientRect()
      if (width && height) setSize({ width, height })
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  return [ref, size] as const
}

/** Per-element timing for the animation classes in styles/index.css. */
function timing(period: number, delay = 0): CSSProperties {
  return { '--period': `${period}s`, '--delay': `${delay}s` } as CSSProperties
}

type Ember = {
  x: number
  size: number
  period: number
  delay: number
  sway: number
  glow: number
}

/** Embers rising off the sunlit middle of the horizon. */
function embers(count: number, seed: number): Ember[] {
  const random = seeded(seed)
  return Array.from({ length: count }, () => ({
    x: 30 + random() * 40,
    size: 1.5 + random() * 2.5,
    period: 7 + random() * 7,
    delay: -random() * 14,
    sway: (random() - 0.5) * 80,
    glow: 0.5 + random() * 0.5,
  }))
}

const EMBERS = embers(18, 11)

function StarDots({ stars, twinkle }: { stars: Star[]; twinkle: boolean }) {
  return stars.map((star, index) => (
    <span
      key={index}
      className={`star absolute rounded-full bg-white ${twinkle ? 'space-twinkle' : ''}`}
      style={
        {
          left: `${star.x}%`,
          top: `${star.y}%`,
          width: star.size,
          height: star.size,
          opacity: star.brightness,
          '--star': star.brightness,
          ...(twinkle && timing(star.period, star.delay)),
          boxShadow: twinkle
            ? `0 0 ${star.size * 3}px rgb(255 236 220 / 0.6)`
            : undefined,
        } as CSSProperties
      }
    />
  ))
}

/** Rim line and glow along the planet's edge. Over the 3D globe it is only
 * the edge (the sphere draws its own surface); alone it is the whole CSS
 * planet, used where WebGL is unavailable. */
const RIM =
  'absolute left-1/2 aspect-square -translate-x-1/2 rounded-full shadow-[0_0_0_1.5px_rgb(255_176_104/0.95),0_-3px_14px_1px_rgb(255_150_70/0.9),0_-16px_60px_6px_rgb(255_104_44/0.55)]'

/** The card's scenery, behind its content: drifting nebula glows, a deep
 * star field with Aceternity's sparkles and meteors, embers lifting off the
 * horizon, and a planet: a real turning 3D globe (Aceternity's globe, night
 * side) on a GPU, else a CSS planet. The atmosphere
 * and the sun's bloom breathe. CSS animations live in styles/index.css; all
 * motion stops with reduced motion. Sizes use container units, and the planet
 * is sized from the measured card so its rim always leaves through the
 * bottom edge.
 */
export function OnboardingEffects() {
  const [ref, size] = useCardSize()
  const planet = planetGeometry(size.width, size.height)
  const still = useReducedMotion() ?? false
  // The WebGL globe and particle canvas need a GPU; otherwise CSS stands in.
  const gpu = useMemo(() => graphicsTier() === 'gpu', [])
  return (
    <div
      ref={ref}
      aria-hidden="true"
      className="onboarding-effects pointer-events-none absolute inset-0 z-0 overflow-hidden"
    >
      {/* Nebula: warm gas top left and right, a cold violet haze between. */}
      <div
        className="nebula-drift absolute -left-[15cqw] -top-[20cqh] h-[75cqh] w-[65cqw] rounded-full bg-[radial-gradient(closest-side,rgb(255_90_45/0.34),rgb(200_50_30/0.12)_55%,transparent)] blur-[20px]"
        style={timing(16)}
      />
      <div
        className="nebula-drift absolute -right-[12cqw] -top-[18cqh] h-[65cqh] w-[55cqw] rounded-full bg-[radial-gradient(closest-side,rgb(255_160_80/0.24),rgb(180_90_40/0.08)_55%,transparent)] blur-[24px]"
        style={timing(20, -7)}
      />
      <div
        className="nebula-drift absolute left-[22cqw] top-[6cqh] h-[50cqh] w-[52cqw] rounded-full bg-[radial-gradient(closest-side,rgb(120_80_200/0.14),transparent)] blur-[30px]"
        style={timing(26, -13)}
      />

      {/* Far stars drift; near ones sparkle (CSS twinkle without a GPU). */}
      <div className="space-drift absolute inset-[-6%]">
        <StarDots stars={FAR_STARS} twinkle={false} />
      </div>
      {gpu ? (
        <Suspense fallback={null}>
          <Sparkles
            className="absolute inset-x-0 top-0 h-[86%]"
            color="#fff3e6"
            density={10}
            minSize={0.4}
            maxSize={1.6}
            speed={2.5}
            still={still}
          />
        </Suspense>
      ) : (
        <div className="absolute inset-0">
          <StarDots stars={NEAR_STARS} twinkle />
        </div>
      )}

      <div className="absolute inset-x-0 top-0 h-[80%] overflow-hidden">
        <Meteors count={14} />
      </div>

      {/* Atmosphere: a wide warm haze centred on the horizon, fading out in
          every direction so it never leaves an edge where the planet curves away. */}
      <div
        className="glow-breathe absolute left-1/2 h-[56cqh] w-[120cqw] -translate-x-1/2 -translate-y-1/2 bg-[radial-gradient(50%_50%_at_50%_50%,rgb(255_120_50/0.4),rgb(255_80_30/0.13)_50%,transparent_75%)]"
        style={{ top: HORIZON, ...timing(6) }}
      />
      {gpu ? (
        <>
          <Suspense fallback={null}>
            <SpaceGlobe width={size.width} height={size.height} still={still} />
          </Suspense>
          <div className={RIM} style={{ width: planet.radius * 2, top: planet.top }} />
        </>
      ) : (
        <div
          className={`planet ${RIM} overflow-hidden bg-[radial-gradient(circle_at_50%_0%,#3a2218,#120c0d_7%,#08070a_20%)]`}
          style={{ width: planet.radius * 2, top: planet.top }}
        >
          <div className="planet-surface planet-turn absolute inset-0">
            <img
              src={globe}
              alt=""
              draggable={false}
              className="absolute left-1/2 max-w-none -translate-x-1/2 select-none opacity-50 mix-blend-luminosity [filter:grayscale(1)_brightness(0.65)_contrast(1.15)]"
              style={{
                width: planet.photoWidth,
                top: -0.57 * 0.5625 * planet.photoWidth,
              }}
            />
          </div>
          {/* Sunlit warmth on the surface near the rim, fading into night. */}
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgb(255_120_50/0.3),rgb(140_50_20/0.12)_6%,transparent_14%)] mix-blend-screen" />
        </div>
      )}
      {/* Bloom where the sun sits just behind the horizon, and its hot core. */}
      <div
        className="glow-breathe absolute left-1/2 h-[26cqh] w-[70cqw] -translate-x-1/2 -translate-y-1/2 bg-[radial-gradient(50%_50%_at_50%_50%,rgb(255_200_140/0.55),rgb(255_130_50/0.25)_40%,transparent_72%)] mix-blend-screen"
        style={{ top: HORIZON, ...timing(4.5, -2) }}
      />
      <div
        className="glow-breathe absolute left-1/2 h-[3cqh] w-[22cqw] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(50%_50%,rgb(255_236_210/0.9),rgb(255_170_100/0.4)_55%,transparent)] blur-[2px]"
        style={{ top: HORIZON, ...timing(3) }}
      />
      {/* Embers lifting off the horizon. */}
      {EMBERS.map((ember, index) => (
        <span
          key={index}
          className="ember-rise absolute rounded-full bg-[rgb(255_190_120)] opacity-0"
          style={
            {
              left: `${ember.x}%`,
              top: `calc(${HORIZON} - 2cqh)`,
              width: ember.size,
              height: ember.size,
              boxShadow: `0 0 ${ember.size * 3}px rgb(255 140 60 / 0.9)`,
              '--ember': ember.glow,
              '--sway': `${ember.sway}px`,
              ...timing(ember.period, ember.delay),
            } as CSSProperties
          }
        />
      ))}
    </div>
  )
}
