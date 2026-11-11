'use client'

import { motion, useReducedMotion } from 'motion/react'
import { type ReactNode } from 'react'

type RevealProps = {
  children: ReactNode
  className?: string
  delay?: number
  direction?: 'up' | 'down' | 'left' | 'right'
}

export function Reveal({
  children,
  className,
  delay = 0,
  direction = 'up',
}: RevealProps) {
  const reduced = useReducedMotion()
  const distance = 24
  const initial = {
    opacity: 0,
    y: direction === 'up' ? distance : direction === 'down' ? -distance : 0,
    x: direction === 'left' ? distance : direction === 'right' ? -distance : 0,
  }

  return (
    <motion.div
      initial={initial}
      whileInView={reduced ? undefined : { opacity: 1, y: 0, x: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  )
}
