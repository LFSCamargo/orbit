import { describe, expect, it } from 'vitest'
import { formatBytes, formatReleaseDate } from '../format'

describe('formatBytes', () => {
  it('uses the largest whole unit', () => {
    expect(formatBytes(180)).toBe('180 B')
    expect(formatBytes(12_582_912)).toBe('12.0 MB')
    expect(formatBytes(1536)).toBe('1.5 KB')
  })
})

describe('formatReleaseDate', () => {
  it('formats ISO dates in UTC', () => {
    expect(formatReleaseDate('2026-11-01T23:30:00Z')).toBe('Nov 1, 2026')
  })

  it('returns null for missing or invalid dates', () => {
    expect(formatReleaseDate(null)).toBeNull()
    expect(formatReleaseDate('nope')).toBeNull()
  })
})
