// Adapted from Aceternity UI "Meteors" (https://ui.aceternity.com/components/meteors):
// warm-tinted streaks spread across the container's width, with fixed
// (seeded) timings so renders match, and hidden when motion is reduced.
import type { CSSProperties } from 'react'

function seeded(seed: number) {
  return () => {
    seed = (seed * 16807) % 2147483647
    return (seed - 1) / 2147483646
  }
}

export function meteorField(count: number, seed = 5) {
  const random = seeded(seed)
  return Array.from({ length: count }, (_, index) => ({
    // Spread across the width (and a little past the right edge, since
    // they travel down-left).
    left: (index / count) * 120 - 5,
    top: -5 - random() * 20,
    delay: random() * 8,
    duration: 5 + random() * 6,
  }))
}

export function Meteors({ count = 14 }: { count?: number }) {
  return meteorField(count).map((meteor, index) => (
    <span
      key={index}
      className="meteor absolute size-[3px] rounded-full bg-[rgb(255_214_170)] shadow-[0_0_6px_2px_rgb(255_150_80/0.45)] before:absolute before:top-1/2 before:h-px before:w-[80px] before:-translate-y-1/2 before:bg-[linear-gradient(90deg,rgb(255_190_130),transparent)] before:content-['']"
      style={
        {
          left: `${meteor.left}%`,
          top: `${meteor.top}%`,
          animationDelay: `${meteor.delay}s`,
          animationDuration: `${meteor.duration}s`,
        } as CSSProperties
      }
    />
  ))
}
