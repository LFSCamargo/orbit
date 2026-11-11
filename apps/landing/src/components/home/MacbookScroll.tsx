'use client'

import Image from 'next/image'
import { useRef } from 'react'
import { motion, useReducedMotion, useScroll, useTransform } from 'motion/react'

export function MacbookScroll() {
  const container = useRef<HTMLElement>(null)
  const reducedMotion = useReducedMotion()
  const { scrollYProgress } = useScroll({
    target: container,
    offset: ['start end', 'end start'],
  })
  const rotateX = useTransform(scrollYProgress, [0, 0.48], [24, 0])
  const scale = useTransform(scrollYProgress, [0, 0.48], [0.82, 1])
  const translateY = useTransform(scrollYProgress, [0, 0.48], [70, 0])
  const motionStyle = reducedMotion ? undefined : { rotateX, scale, y: translateY }

  return (
    <section
      ref={container}
      aria-label="Orbit application preview"
      className="relative mx-auto -mt-4 max-w-7xl px-4 pb-24 sm:px-6"
    >
      <div className="pointer-events-none absolute left-1/2 top-1/2 -z-10 h-96 w-4/5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-orange-600/10 blur-[120px]" />
      <motion.div
        style={motionStyle}
        className="mx-auto max-w-6xl origin-top [transform-perspective:1400px]"
      >
        <div className="rounded-t-[1.4rem] border border-white/15 bg-gradient-to-b from-zinc-700 to-zinc-900 p-2 shadow-[0_50px_120px_-30px_rgba(0,0,0,0.9)] sm:p-3">
          <div className="relative overflow-hidden rounded-t-[0.9rem] border border-black bg-black">
            <div className="absolute left-1/2 top-1.5 z-10 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-zinc-800 ring-1 ring-zinc-700" />
            <Image
              src="/screenshots/orbit-home.png"
              alt="Orbit home screen with a featured game and a row of recent games"
              width={1440}
              height={900}
              priority
              className="aspect-[16/10] h-auto w-full object-cover"
            />
          </div>
        </div>
        <div className="relative mx-auto h-4 w-[108%] max-w-[110%] -translate-x-[3.7%] rounded-b-[1.5rem] border border-white/10 bg-gradient-to-b from-zinc-500 via-zinc-700 to-zinc-900 shadow-2xl sm:h-5">
          <div className="mx-auto h-1.5 w-24 rounded-b-lg bg-zinc-900/80" />
        </div>
      </motion.div>
      <div className="mt-8 flex justify-between font-mono text-[10px] uppercase tracking-[0.2em] text-orbit-muted">
        <span>Your library, in focus</span>
        <span className="hidden sm:inline">Controller ready · Keyboard friendly</span>
      </div>
    </section>
  )
}
