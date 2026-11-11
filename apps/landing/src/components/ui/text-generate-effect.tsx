'use client'

import { useEffect } from 'react'
import { motion, stagger, useAnimate, useReducedMotion } from 'motion/react'
import { cn } from '@/lib/utils'

type TextGenerateEffectProps = {
  words: string
  className?: string
  filter?: boolean
  duration?: number
}

export function TextGenerateEffect({
  words,
  className,
  filter = true,
  duration = 0.45,
}: TextGenerateEffectProps) {
  const [scope, animate] = useAnimate()
  const reducedMotion = useReducedMotion()
  const wordsArray = words.split(' ')

  useEffect(() => {
    if (reducedMotion) return
    void animate(
      'span',
      { opacity: 1, filter: filter ? 'blur(0px)' : 'none' },
      { duration, delay: stagger(0.08) },
    )
  }, [animate, duration, filter, reducedMotion])

  return (
    <p className={cn('text-base leading-7 text-orbit-muted', className)}>
      <motion.span ref={scope}>
        {wordsArray.map((word, index) => (
          <motion.span
            key={`${word}-${index}`}
            className="inline"
            style={{
              opacity: reducedMotion ? 1 : 0,
              filter: filter && !reducedMotion ? 'blur(8px)' : 'none',
            }}
          >
            {word}{' '}
          </motion.span>
        ))}
      </motion.span>
    </p>
  )
}
