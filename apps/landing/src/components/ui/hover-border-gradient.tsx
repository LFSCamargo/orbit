'use client'

import {
  useEffect,
  useState,
  type ComponentPropsWithoutRef,
  type ElementType,
  type ReactNode,
} from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { cn } from '@/lib/utils'

type Direction = 'TOP' | 'LEFT' | 'BOTTOM' | 'RIGHT'
const DIRECTIONS: Direction[] = ['TOP', 'LEFT', 'BOTTOM', 'RIGHT']

export type HoverBorderGradientProps<T extends ElementType> = {
  as?: T
  containerClassName?: string
  className?: string
  duration?: number
  clockwise?: boolean
  children: ReactNode
} & Omit<ComponentPropsWithoutRef<T>, 'as' | 'children' | 'className'>

const movingMap: Record<Direction, string> = {
  TOP: 'radial-gradient(20.7% 50% at 50% 0%, #fb923c 0%, rgba(251, 146, 60, 0) 100%)',
  LEFT: 'radial-gradient(16.6% 43.1% at 0% 50%, #fb923c 0%, rgba(251, 146, 60, 0) 100%)',
  BOTTOM:
    'radial-gradient(20.7% 50% at 50% 100%, #fb923c 0%, rgba(251, 146, 60, 0) 100%)',
  RIGHT:
    'radial-gradient(16.2% 41.2% at 100% 50%, #fb923c 0%, rgba(251, 146, 60, 0) 100%)',
}

const highlight =
  'radial-gradient(75% 181% at 50% 50%, #f97316 0%, rgba(249, 115, 22, 0) 100%)'

export function HoverBorderGradient<T extends ElementType = 'button'>({
  children,
  containerClassName,
  className,
  as,
  duration = 1,
  clockwise = true,
  ...props
}: HoverBorderGradientProps<T>) {
  const Tag = as ?? 'button'
  const reducedMotion = useReducedMotion()
  const [hovered, setHovered] = useState(false)
  const [direction, setDirection] = useState<Direction>('TOP')

  useEffect(() => {
    if (hovered || reducedMotion) return undefined
    const interval = window.setInterval(() => {
      setDirection((current) => {
        const currentIndex = DIRECTIONS.indexOf(current)
        const nextIndex = clockwise
          ? (currentIndex - 1 + DIRECTIONS.length) % DIRECTIONS.length
          : (currentIndex + 1) % DIRECTIONS.length
        return DIRECTIONS[nextIndex] ?? 'TOP'
      })
    }, duration * 1000)
    return () => window.clearInterval(interval)
  }, [hovered, clockwise, duration, reducedMotion])

  return (
    <Tag
      {...props}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={cn(
        'relative inline-flex w-fit content-center items-center justify-center overflow-visible rounded-full border border-white/15 p-px transition duration-500',
        containerClassName,
      )}
    >
      <span
        className={cn(
          'relative z-10 inline-flex items-center gap-2 rounded-[inherit] bg-orbit-canvas px-5 py-2.5 text-sm font-medium text-orbit-foreground',
          className,
        )}
      >
        {children}
      </span>
      <motion.span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 rounded-[inherit] blur-[2px]"
        initial={{ background: movingMap[direction] }}
        animate={{
          background: reducedMotion
            ? movingMap[direction]
            : hovered
              ? [movingMap[direction], highlight]
              : movingMap[direction],
        }}
        transition={{ ease: 'linear', duration: reducedMotion ? 0 : duration }}
      />
      <span
        aria-hidden="true"
        className="absolute inset-px z-0 rounded-[inherit] bg-orbit-canvas"
      />
    </Tag>
  )
}
