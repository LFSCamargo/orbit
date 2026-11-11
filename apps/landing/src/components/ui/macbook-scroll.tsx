'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  IconBrightnessDown,
  IconBrightnessUp,
  IconCaretDownFilled,
  IconCaretLeftFilled,
  IconCaretRightFilled,
  IconCaretUpFilled,
  IconChevronUp,
  IconCommand,
  IconMicrophone,
  IconMoon,
  IconPlayerSkipForward,
  IconPlayerTrackNext,
  IconPlayerTrackPrev,
  IconSearch,
  IconTable,
  IconVolume,
  IconVolume2,
  IconVolume3,
  IconWorld,
} from '@tabler/icons-react'
import {
  motion,
  useReducedMotion,
  useScroll,
  useTransform,
  type MotionValue,
} from 'motion/react'
import { cn } from '@/lib/utils'

export interface MacbookScrollProps {
  src?: string
  showGradient?: boolean
  title?: ReactNode
  badge?: ReactNode
  className?: string
}

/**
 * Macbook scroll effect adapted from the Aceternity UI `macbook-scroll`
 * registry component. The lid opens and the screen travels forward as the
 * section scrolls through the viewport.
 */
export function MacbookScroll({
  src,
  showGradient,
  title,
  badge,
  className,
}: MacbookScrollProps) {
  const ref = useRef<HTMLDivElement>(null)
  const reducedMotion = useReducedMotion()
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start start', 'end start'],
  })
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    if (window.innerWidth < 768) setIsMobile(true)
  }, [])

  const scaleX = useTransform(scrollYProgress, [0, 0.3], [1.2, isMobile ? 1 : 1.5])
  const scaleY = useTransform(scrollYProgress, [0, 0.3], [0.6, isMobile ? 1 : 1.5])
  const translate = useTransform(scrollYProgress, [0, 1], [0, 1500])
  const rotate = useTransform(scrollYProgress, [0.1, 0.12, 0.3], [-28, -28, 0])
  const textTransform = useTransform(scrollYProgress, [0, 0.3], [0, 100])
  const textOpacity = useTransform(scrollYProgress, [0, 0.2], [1, 0])

  return (
    <div
      ref={ref}
      className={cn(
        'md:scale-60 flex min-h-[50vh] shrink-0 scale-[0.4] transform flex-col items-center justify-start py-4 [perspective:800px] sm:scale-50 lg:scale-[0.7]',
        className,
      )}
    >
      {title ? (
        <motion.h2
          style={
            reducedMotion
              ? undefined
              : {
                  translateY: textTransform,
                  opacity: textOpacity,
                }
          }
          className="mb-6 max-w-3xl text-center text-lg font-medium tracking-[-0.04em] text-white sm:text-xl md:mb-8"
        >
          {title}
        </motion.h2>
      ) : null}

      <Lid
        src={src}
        scaleX={reducedMotion ? 1 : scaleX}
        scaleY={reducedMotion ? 1 : scaleY}
        rotate={reducedMotion ? 0 : rotate}
        translate={reducedMotion ? 0 : translate}
      />

      <div className="relative -z-10 h-[22rem] w-[32rem] overflow-hidden rounded-2xl bg-[#272729]">
        <div className="relative h-10 w-full">
          <div className="absolute inset-x-0 mx-auto h-4 w-[80%] bg-[#050505]" />
        </div>
        <div className="relative flex">
          <div className="mx-auto h-full w-[10%] overflow-hidden">
            <SpeakerGrid />
          </div>
          <div className="mx-auto h-full w-[80%]">
            <Keypad />
          </div>
          <div className="mx-auto h-full w-[10%] overflow-hidden">
            <SpeakerGrid />
          </div>
        </div>
        <Trackpad />
        <div className="absolute inset-x-0 bottom-0 mx-auto h-2 w-20 rounded-tl-3xl rounded-tr-3xl bg-gradient-to-t from-[#272729] to-[#050505]" />
        {showGradient && (
          <div className="absolute inset-x-0 bottom-0 z-50 h-40 w-full bg-gradient-to-t from-black via-black to-transparent" />
        )}
        {badge && <div className="absolute bottom-4 left-4">{badge}</div>}
      </div>
    </div>
  )
}

function Lid({
  scaleX,
  scaleY,
  rotate,
  translate,
  src,
}: {
  scaleX: MotionValue<number> | number
  scaleY: MotionValue<number> | number
  rotate: MotionValue<number> | number
  translate: MotionValue<number> | number
  src?: string
}) {
  return (
    <div className="relative [perspective:800px]">
      <div
        style={{
          transform: 'perspective(800px) rotateX(-25deg) translateZ(0px)',
          transformOrigin: 'bottom',
          transformStyle: 'preserve-3d',
        }}
        className="relative h-[12rem] w-[32rem] rounded-2xl bg-[#010101] p-2"
      >
        <div
          style={{ boxShadow: '0px 2px 0px 2px #171717 inset' }}
          className="absolute inset-0 flex items-center justify-center rounded-lg bg-[#010101]"
        >
          <span className="text-white">
            <OrbitLogo />
          </span>
        </div>
      </div>
      <motion.div
        style={{
          scaleX,
          scaleY,
          rotateX: rotate,
          translateY: translate,
          transformStyle: 'preserve-3d',
          transformOrigin: 'top',
        }}
        className="absolute inset-0 h-96 w-[32rem] rounded-2xl bg-[#010101] p-2"
      >
        <div className="absolute inset-0 rounded-lg bg-[#272729]" />
        {src && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt="Orbit application screen"
            className="absolute inset-0 h-full w-full rounded-lg object-cover object-left-top"
          />
        )}
      </motion.div>
    </div>
  )
}

function Trackpad() {
  return (
    <div
      className="mx-auto my-1 h-32 w-[40%] rounded-xl"
      style={{ boxShadow: '0px 0px 1px 1px #00000020 inset' }}
    />
  )
}

function Keypad() {
  return (
    <div className="mx-1 h-full rounded-md bg-[#050505] p-1 [transform:translateZ(0)] [will-change:transform]">
      <div className="mb-[2px] flex w-full shrink-0 gap-[2px]">
        <KBtn
          className="w-10 items-end justify-start pb-[2px] pl-[4px]"
          childrenClassName="items-start"
        >
          esc
        </KBtn>
        <KBtn>
          <IconBrightnessDown className="h-[6px] w-[6px]" />
          <span className="mt-1 inline-block">F1</span>
        </KBtn>
        <KBtn>
          <IconBrightnessUp className="h-[6px] w-[6px]" />
          <span className="mt-1 inline-block">F2</span>
        </KBtn>
        <KBtn>
          <IconTable className="h-[6px] w-[6px]" />
          <span className="mt-1 inline-block">F3</span>
        </KBtn>
        <KBtn>
          <IconSearch className="h-[6px] w-[6px]" />
          <span className="mt-1 inline-block">F4</span>
        </KBtn>
        <KBtn>
          <IconMicrophone className="h-[6px] w-[6px]" />
          <span className="mt-1 inline-block">F5</span>
        </KBtn>
        <KBtn>
          <IconMoon className="h-[6px] w-[6px]" />
          <span className="mt-1 inline-block">F6</span>
        </KBtn>
        <KBtn>
          <IconPlayerTrackPrev className="h-[6px] w-[6px]" />
          <span className="mt-1 inline-block">F7</span>
        </KBtn>
        <KBtn>
          <IconPlayerSkipForward className="h-[6px] w-[6px]" />
          <span className="mt-1 inline-block">F8</span>
        </KBtn>
        <KBtn>
          <IconPlayerTrackNext className="h-[6px] w-[6px]" />
          <span className="mt-1 inline-block">F9</span>
        </KBtn>
        <KBtn>
          <IconVolume3 className="h-[6px] w-[6px]" />
          <span className="mt-1 inline-block">F10</span>
        </KBtn>
        <KBtn>
          <IconVolume2 className="h-[6px] w-[6px]" />
          <span className="mt-1 inline-block">F11</span>
        </KBtn>
        <KBtn>
          <IconVolume className="h-[6px] w-[6px]" />
          <span className="mt-1 inline-block">F12</span>
        </KBtn>
        <KBtn>
          <div className="h-4 w-4 rounded-full bg-gradient-to-b from-neutral-900 from-20% via-black via-50% to-neutral-900 to-95% p-px">
            <div className="h-full w-full rounded-full bg-black" />
          </div>
        </KBtn>
      </div>

      <div className="mb-[2px] flex w-full shrink-0 gap-[2px]">
        <KBtn>
          <span className="block">~</span>
          <span className="block">`</span>
        </KBtn>
        <KBtn>
          <span className="block">!</span>
          <span className="block">1</span>
        </KBtn>
        <KBtn>
          <span className="block">@</span>
          <span className="block">2</span>
        </KBtn>
        <KBtn>
          <span className="block">#</span>
          <span className="block">3</span>
        </KBtn>
        <KBtn>
          <span className="block">$</span>
          <span className="block">4</span>
        </KBtn>
        <KBtn>
          <span className="block">%</span>
          <span className="block">5</span>
        </KBtn>
        <KBtn>
          <span className="block">^</span>
          <span className="block">6</span>
        </KBtn>
        <KBtn>
          <span className="block">&</span>
          <span className="block">7</span>
        </KBtn>
        <KBtn>
          <span className="block">*</span>
          <span className="block">8</span>
        </KBtn>
        <KBtn>
          <span className="block">(</span>
          <span className="block">9</span>
        </KBtn>
        <KBtn>
          <span className="block">)</span>
          <span className="block">0</span>
        </KBtn>
        <KBtn>
          <span className="block">—</span>
          <span className="block">_</span>
        </KBtn>
        <KBtn>
          <span className="block">+</span>
          <span className="block">=</span>
        </KBtn>
        <KBtn
          className="w-10 items-end justify-end pb-[2px] pr-[4px]"
          childrenClassName="items-end"
        >
          delete
        </KBtn>
      </div>

      <div className="mb-[2px] flex w-full shrink-0 gap-[2px]">
        <KBtn
          className="w-10 items-end justify-start pb-[2px] pl-[4px]"
          childrenClassName="items-start"
        >
          tab
        </KBtn>
        {['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'].map((key) => (
          <KBtn key={key}>
            <span className="block">{key}</span>
          </KBtn>
        ))}
        <KBtn>
          <span className="block">{'{'}</span>
          <span className="block">{'['}</span>
        </KBtn>
        <KBtn>
          <span className="block">{'}'}</span>
          <span className="block">{']'}</span>
        </KBtn>
        <KBtn>
          <span className="block">{'|'}</span>
          <span className="block">{'\\'}</span>
        </KBtn>
      </div>

      <div className="mb-[2px] flex w-full shrink-0 gap-[2px]">
        <KBtn
          className="w-[2.8rem] items-end justify-start pb-[2px] pl-[4px]"
          childrenClassName="items-start"
        >
          caps lock
        </KBtn>
        {['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'].map((key) => (
          <KBtn key={key}>
            <span className="block">{key}</span>
          </KBtn>
        ))}
        <KBtn>
          <span className="block">:</span>
          <span className="block">;</span>
        </KBtn>
        <KBtn>
          <span className="block">"</span>
          <span className="block">'</span>
        </KBtn>
        <KBtn
          className="w-[2.85rem] items-end justify-end pb-[2px] pr-[4px]"
          childrenClassName="items-end"
        >
          return
        </KBtn>
      </div>

      <div className="mb-[2px] flex w-full shrink-0 gap-[2px]">
        <KBtn
          className="w-[3.65rem] items-end justify-start pb-[2px] pl-[4px]"
          childrenClassName="items-start"
        >
          shift
        </KBtn>
        {['Z', 'X', 'C', 'V', 'B', 'N', 'M'].map((key) => (
          <KBtn key={key}>
            <span className="block">{key}</span>
          </KBtn>
        ))}
        <KBtn>
          <span className="block">{'<'}</span>
          <span className="block">,</span>
        </KBtn>
        <KBtn>
          <span className="block">{'>'}</span>
          <span className="block">.</span>
        </KBtn>
        <KBtn>
          <span className="block">?</span>
          <span className="block">/</span>
        </KBtn>
        <KBtn
          className="w-[3.65rem] items-end justify-end pb-[2px] pr-[4px]"
          childrenClassName="items-end"
        >
          shift
        </KBtn>
      </div>

      <div className="mb-[2px] flex w-full shrink-0 gap-[2px]">
        <KBtn childrenClassName="h-full justify-between py-[4px]">
          <div className="flex w-full justify-end pr-1">
            <span className="block">fn</span>
          </div>
          <div className="flex w-full justify-start pl-1">
            <IconWorld className="h-[6px] w-[6px]" />
          </div>
        </KBtn>
        <KBtn childrenClassName="h-full justify-between py-[4px]">
          <div className="flex w-full justify-end pr-1">
            <IconChevronUp className="h-[6px] w-[6px]" />
          </div>
          <div className="flex w-full justify-start pl-1">
            <span className="block">control</span>
          </div>
        </KBtn>
        <KBtn childrenClassName="h-full justify-between py-[4px]">
          <div className="flex w-full justify-end pr-1">
            <OptionKey className="h-[6px] w-[6px]" />
          </div>
          <div className="flex w-full justify-start pl-1">
            <span className="block">option</span>
          </div>
        </KBtn>
        <KBtn className="w-8" childrenClassName="h-full justify-between py-[4px]">
          <div className="flex w-full justify-end pr-1">
            <IconCommand className="h-[6px] w-[6px]" />
          </div>
          <div className="flex w-full justify-start pl-1">
            <span className="block">command</span>
          </div>
        </KBtn>
        <KBtn className="w-[8.2rem]" />
        <KBtn className="w-8" childrenClassName="h-full justify-between py-[4px]">
          <div className="flex w-full justify-start pl-1">
            <IconCommand className="h-[6px] w-[6px]" />
          </div>
          <div className="flex w-full justify-start pl-1">
            <span className="block">command</span>
          </div>
        </KBtn>
        <KBtn childrenClassName="h-full justify-between py-[4px]">
          <div className="flex w-full justify-start pl-1">
            <OptionKey className="h-[6px] w-[6px]" />
          </div>
          <div className="flex w-full justify-start pl-1">
            <span className="block">option</span>
          </div>
        </KBtn>
        <div className="mt-[2px] flex h-6 w-[4.9rem] flex-col items-center justify-end rounded-[4px] p-[0.5px]">
          <KBtn className="h-3 w-6">
            <IconCaretUpFilled className="h-[6px] w-[6px]" />
          </KBtn>
          <div className="flex">
            <KBtn className="h-3 w-6">
              <IconCaretLeftFilled className="h-[6px] w-[6px]" />
            </KBtn>
            <KBtn className="h-3 w-6">
              <IconCaretDownFilled className="h-[6px] w-[6px]" />
            </KBtn>
            <KBtn className="h-3 w-6">
              <IconCaretRightFilled className="h-[6px] w-[6px]" />
            </KBtn>
          </div>
        </div>
      </div>
    </div>
  )
}

function KBtn({
  className,
  children,
  childrenClassName,
  backlit = true,
}: {
  className?: string
  children?: ReactNode
  childrenClassName?: string
  backlit?: boolean
}) {
  return (
    <div
      className={cn(
        'rounded-[4px] p-[0.5px] [transform:translateZ(0)] [will-change:transform]',
        backlit && 'bg-white/[0.2] shadow-xl shadow-white',
      )}
    >
      <div
        className={cn(
          'flex h-6 w-6 items-center justify-center rounded-[3.5px] bg-[#0A090D]',
          className,
        )}
        style={{
          boxShadow: '0px -0.5px 2px 0 #0D0D0F inset, -0.5px 0px 2px 0 #0D0D0F inset',
        }}
      >
        <div
          className={cn(
            'flex w-full flex-col items-center justify-center text-[5px] text-neutral-200',
            childrenClassName,
            backlit && 'text-white',
          )}
        >
          {children}
        </div>
      </div>
    </div>
  )
}

function SpeakerGrid() {
  return (
    <div
      className="mt-2 flex h-40 gap-[2px] px-[0.5px]"
      style={{
        backgroundImage: 'radial-gradient(circle, #08080A 0.5px, transparent 0.5px)',
        backgroundSize: '3px 3px',
      }}
    />
  )
}

function OptionKey({ className }: { className: string }) {
  return (
    <svg
      fill="none"
      version="1.1"
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 32 32"
      className={className}
    >
      <rect stroke="currentColor" strokeWidth={2} x="18" y="5" width="10" height="2" />
      <polygon
        stroke="currentColor"
        strokeWidth={2}
        points="10.6,5 4,5 4,7 9.4,7 18.4,27 28,27 28,25 19.6,25"
      />
      <rect width="32" height="32" stroke="none" />
    </svg>
  )
}

function OrbitLogo() {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src="/assets/orbit-icon.png" alt="" className="h-8 w-8 rounded-lg" />
  )
}
