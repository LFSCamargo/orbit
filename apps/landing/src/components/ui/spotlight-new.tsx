'use client'

import { motion, useReducedMotion } from 'motion/react'

type SpotlightProps = {
  gradientFirst?: string
  gradientSecond?: string
  gradientThird?: string
  translateY?: number
  width?: number
  height?: number
  smallWidth?: number
  duration?: number
  xOffset?: number
}

export function Spotlight({
  gradientFirst = 'radial-gradient(68.54% 68.72% at 55.02% 31.46%, rgba(255, 138, 61, 0.16) 0, rgba(255, 94, 20, 0.05) 50%, rgba(220, 38, 38, 0) 80%)',
  gradientSecond = 'radial-gradient(50% 50% at 50% 50%, rgba(253, 186, 116, 0.12) 0, rgba(249, 115, 22, 0.04) 80%, transparent 100%)',
  gradientThird = 'radial-gradient(50% 50% at 50% 50%, rgba(254, 240, 138, 0.08) 0, rgba(234, 88, 12, 0.03) 80%, transparent 100%)',
  translateY = -350,
  width = 560,
  height = 1380,
  smallWidth = 240,
  duration = 7,
  xOffset = 100,
}: SpotlightProps = {}) {
  const reducedMotion = useReducedMotion()

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: reducedMotion ? 0 : 1.5 }}
      className="pointer-events-none absolute inset-0 h-full w-full overflow-hidden"
      aria-hidden="true"
    >
      {[-1, 1].map((side) => (
        <motion.div
          key={side}
          animate={reducedMotion ? undefined : { x: [0, side * xOffset, 0] }}
          transition={{
            duration,
            repeat: Infinity,
            repeatType: 'reverse',
            ease: 'easeInOut',
          }}
          className={`pointer-events-none absolute top-0 h-full w-full ${side === -1 ? 'left-0' : 'right-0'}`}
        >
          <div
            className={`absolute top-0 ${side === -1 ? 'left-0' : 'right-0'}`}
            style={{
              transform: `translateY(${translateY}px) rotate(${side * 45}deg)`,
              background: gradientFirst,
              width,
              height,
            }}
          />
          <div
            className={`absolute top-0 ${side === -1 ? 'left-0 origin-top-left' : 'right-0 origin-top-right'}`}
            style={{
              transform:
                side === -1
                  ? 'rotate(-45deg) translate(5%, -50%)'
                  : 'rotate(45deg) translate(-5%, -50%)',
              background: gradientSecond,
              width: smallWidth,
              height,
            }}
          />
          <div
            className={`absolute top-0 ${side === -1 ? 'left-0 origin-top-left' : 'right-0 origin-top-right'}`}
            style={{
              transform:
                side === -1
                  ? 'rotate(-45deg) translate(-180%, -70%)'
                  : 'rotate(45deg) translate(180%, -70%)',
              background: gradientThird,
              width: smallWidth,
              height,
            }}
          />
        </motion.div>
      ))}
    </motion.div>
  )
}
