import { describe, expect, it } from 'vitest'
import { cn } from '@/lib/utils'

describe('cn', () => {
  it('merges class names and resolves Tailwind conflicts', () => {
    expect(cn('px-2 py-1', 'px-4')).toBe('py-1 px-4')
  })

  it('ignores falsy values', () => {
    expect(cn('px-2', false && 'py-1', 'py-3')).toBe('px-2 py-3')
  })
})
