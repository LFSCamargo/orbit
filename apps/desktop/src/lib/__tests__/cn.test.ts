import { expect, it } from 'vitest'
import { cn } from '../cn'

it('lets later utilities override earlier ones', () => {
  expect(cn('relative h-[500px] w-full', 'absolute h-full')).toBe(
    'w-full absolute h-full',
  )
  expect(cn('a', false && 'b', 'c')).toBe('a c')
})
