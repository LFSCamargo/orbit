'use client'

import { motion, useReducedMotion } from 'motion/react'
import { useEffect, useState } from 'react'
import { CheckIcon } from '@/components/ui/icons'

const STAGES = [
  'Downloading Orbit…',
  'Copying to Applications…',
  'Ready to play',
] as const
const CYCLE_MS = 6000

function ApplicationsFolder() {
  return (
    <svg viewBox="0 0 96 80" className="h-full w-full" aria-hidden="true">
      <defs>
        <linearGradient id="folder-back" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#5aa9ff" />
          <stop offset="1" stopColor="#2f7fe0" />
        </linearGradient>
        <linearGradient id="folder-front" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#7cc0ff" />
          <stop offset="1" stopColor="#3d8ff0" />
        </linearGradient>
      </defs>
      <path
        d="M6 14a6 6 0 0 1 6-6h22l8 8h42a6 6 0 0 1 6 6v46a6 6 0 0 1-6 6H12a6 6 0 0 1-6-6z"
        fill="url(#folder-back)"
      />
      <rect x="6" y="24" width="84" height="50" rx="6" fill="url(#folder-front)" />
      <path
        d="M48 34 37 62h6l2.4-6h9.2l2.4 6h6L52 34zm-1 16 3-8 3 8z"
        fill="#fff"
        opacity="0.9"
      />
    </svg>
  )
}

/** The install, animated: Orbit's icon leaves the disk image for the
 * Applications folder, then it is ready to play. Still with reduced motion. */
export function InstallAnimation({ version }: { version: string }) {
  const reduced = useReducedMotion()
  const [stage, setStage] = useState(0)

  useEffect(() => {
    if (reduced) {
      setStage(2)
      return
    }
    let stageTimers: number[] = []
    const run = () => {
      stageTimers.forEach(window.clearTimeout)
      setStage(0)
      stageTimers = [
        window.setTimeout(() => setStage(1), 1500),
        window.setTimeout(() => setStage(2), 3600),
      ]
    }
    run()
    const interval = window.setInterval(run, CYCLE_MS)
    return () => {
      window.clearInterval(interval)
      stageTimers.forEach(window.clearTimeout)
    }
  }, [reduced])

  return (
    <div className="relative mx-auto w-full max-w-[460px]" aria-hidden="true">
      <div className="absolute -inset-10 -z-10 rounded-full bg-[radial-gradient(closest-side,rgb(255_120_50/0.28),transparent)] blur-2xl" />
      <div className="orbit-glass overflow-hidden rounded-[26px] !bg-black/45 shadow-[0_40px_80px_-30px_rgb(0_0_0/0.9)]">
        <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
          <span className="h-3 w-3 rounded-full bg-[#ff5f57]" />
          <span className="h-3 w-3 rounded-full bg-[#febc2e]" />
          <span className="h-3 w-3 rounded-full bg-[#28c840]" />
          <span className="ml-3 truncate font-mono text-[11px] text-white/55">
            Orbit-{version}-aarch64.dmg
          </span>
        </div>
        <div className="relative flex h-56 items-center justify-between px-10 sm:h-64 sm:px-14">
          <div className="relative flex flex-col items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element -- the icon's place in the disk image */}
            <img
              src="/assets/orbit-app-icon.png"
              alt=""
              draggable={false}
              className="absolute left-0 top-0 h-20 w-20 opacity-20 grayscale sm:h-24 sm:w-24"
            />
            <motion.img
              src="/assets/orbit-app-icon.png"
              alt=""
              draggable={false}
              className="h-20 w-20 drop-shadow-[0_12px_24px_rgb(255_110_40/0.45)] sm:h-24 sm:w-24"
              animate={
                reduced
                  ? undefined
                  : {
                      x: [0, 0, 70, 175, 175, 0],
                      y: [0, 0, -46, 0, 0, 0],
                      scale: [1, 1, 0.9, 0.55, 0.55, 1],
                      opacity: [1, 1, 1, 0, 0, 1],
                    }
              }
              transition={{
                duration: CYCLE_MS / 1000,
                times: [0, 0.25, 0.42, 0.6, 0.97, 1],
                ease: 'easeInOut',
                repeat: Infinity,
              }}
            />
            <span className="text-xs text-white/70">Orbit</span>
          </div>
          <svg
            viewBox="0 0 120 24"
            className="mx-2 h-6 flex-1 text-orange-300/70"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <path d="M4 12h104" strokeDasharray="4 7" className="install-dash" />
            <path d="M100 5l9 7-9 7" />
          </svg>
          <div className="relative flex flex-col items-center gap-2">
            <motion.div
              className="h-20 w-24 sm:h-24 sm:w-28"
              animate={reduced ? undefined : { scale: [1, 1, 1, 1.12, 1, 1] }}
              transition={{
                duration: CYCLE_MS / 1000,
                times: [0, 0.5, 0.58, 0.64, 0.72, 1],
                repeat: Infinity,
              }}
            >
              <ApplicationsFolder />
            </motion.div>
            <span className="text-xs text-white/70">Applications</span>
            {stage === 2 && (
              <motion.span
                initial={reduced ? false : { scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="absolute -right-2 -top-2 flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500 text-white shadow-[0_0_24px_rgb(16_185_129/0.7)]"
              >
                <CheckIcon className="h-4 w-4" strokeWidth={3} />
              </motion.span>
            )}
          </div>
        </div>
        <div className="border-t border-white/10 px-5 py-4">
          <div className="flex items-center justify-between text-xs">
            <span className={stage === 2 ? 'text-emerald-300' : 'text-white/70'}>
              {STAGES[stage]}
            </span>
            <span className="font-mono text-white/40">v{version}</span>
          </div>
          <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-white/10">
            <motion.div
              key={reduced ? 'static' : 'bar'}
              className="h-full rounded-full bg-[linear-gradient(90deg,#ff9a3c,#ff5a1a)]"
              initial={{ width: reduced ? '100%' : '0%' }}
              animate={reduced ? undefined : { width: ['0%', '45%', '100%', '100%'] }}
              transition={{
                duration: CYCLE_MS / 1000,
                times: [0, 0.25, 0.6, 1],
                repeat: Infinity,
              }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
