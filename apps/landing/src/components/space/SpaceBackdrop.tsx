import type { CSSProperties } from 'react'
import { Meteors } from './Meteors'

/** Small deterministic PRNG, so the server and client draw the same sky. */
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
  glow: number
  period: number
  delay: number
}

/** Far stars are many, tiny and dim; near ones (the sparkles) are brighter
 * and twinkle on their own rhythm. Above the horizon only. */
function starField(count: number, seed: number, near: boolean): Star[] {
  const random = seeded(seed)
  return Array.from({ length: count }, () => ({
    x: random() * 100,
    y: random() * 78,
    size: near ? 1.2 + random() * 1.8 : 0.6 + random() * 0.7,
    glow: near ? 0.45 + random() * 0.5 : 0.18 + random() * 0.25,
    period: 2 + random() * 3.5,
    delay: -random() * 8,
  }))
}

const FAR_STARS = starField(90, 7, false)
const SPARKLES = starField(40, 42, true)

const EMBERS = (() => {
  const random = seeded(11)
  return Array.from({ length: 18 }, () => ({
    x: 30 + random() * 40,
    size: 1.5 + random() * 2.5,
    period: 7 + random() * 7,
    delay: -random() * 14,
    sway: (random() - 0.5) * 80,
    glow: 0.5 + random() * 0.5,
  }))
})()

const timing = (period: number, delay = 0) =>
  ({ '--period': `${period}s`, '--delay': `${delay}s` }) as CSSProperties

/** Orbit's space scene, as in the app's onboarding and splash: drifting
 * nebula glows, a deep star field with twinkling sparkles, meteors, and
 * embers lifting off the horizon (`horizon`, a CSS length from the top). All
 * motion stops with reduced motion (globals.css). */
export function SpaceBackdrop({
  horizon = '84%',
  embers = true,
}: {
  horizon?: string
  /** Embers rise off a planet's horizon; off where there is none. */
  embers?: boolean
}) {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      <div
        className="nebula-drift absolute -left-[15%] -top-[20%] h-[75%] w-[65%] rounded-full bg-[radial-gradient(closest-side,rgb(255_90_45/0.32),rgb(200_50_30/0.11)_55%,transparent)] blur-[24px]"
        style={timing(16)}
      />
      <div
        className="nebula-drift absolute -right-[12%] -top-[18%] h-[65%] w-[55%] rounded-full bg-[radial-gradient(closest-side,rgb(255_160_80/0.22),rgb(180_90_40/0.08)_55%,transparent)] blur-[28px]"
        style={timing(20, -7)}
      />
      <div
        className="nebula-drift absolute left-[22%] top-[6%] h-[50%] w-[52%] rounded-full bg-[radial-gradient(closest-side,rgb(120_80_200/0.13),transparent)] blur-[34px]"
        style={timing(26, -13)}
      />
      <div className="space-drift absolute inset-[-6%]">
        {FAR_STARS.map((star, index) => (
          <span
            key={index}
            className="absolute rounded-full bg-white"
            style={{
              left: `${star.x}%`,
              top: `${star.y}%`,
              width: star.size,
              height: star.size,
              opacity: star.glow,
            }}
          />
        ))}
      </div>
      {SPARKLES.map((star, index) => (
        <span
          key={index}
          className="sparkle space-twinkle absolute rounded-full bg-[#fff3e6]"
          style={
            {
              left: `${star.x}%`,
              top: `${star.y}%`,
              width: star.size,
              height: star.size,
              opacity: star.glow,
              '--star': star.glow,
              boxShadow: `0 0 ${star.size * 3}px rgb(255 236 220 / 0.6)`,
              ...timing(star.period, star.delay),
            } as CSSProperties
          }
        />
      ))}
      <div className="absolute inset-x-0 top-0 h-[80%] overflow-hidden">
        <Meteors count={16} />
      </div>
      {embers &&
        EMBERS.map((ember, index) => (
          <span
            key={index}
            className="ember-rise absolute rounded-full bg-[rgb(255_190_120)] opacity-0"
            style={
              {
                left: `${ember.x}%`,
                top: `calc(${horizon} - 2%)`,
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
