import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  formatAchievementProgress,
  formatBytes,
  formatDlcCount,
  formatPlaytime,
  formatRelativeDate,
  placeholderGradient,
  providerLabel,
} from '@/lib/format'

describe('formatPlaytime', () => {
  it('returns Never played for zero or negative', () => {
    expect(formatPlaytime(0)).toBe('Never played')
    expect(formatPlaytime(-10)).toBe('Never played')
  })

  it('formats minutes only under one hour', () => {
    expect(formatPlaytime(60)).toBe('1m')
    expect(formatPlaytime(3599)).toBe('59m')
  })

  it('formats whole hours without minutes', () => {
    expect(formatPlaytime(3600)).toBe('1h')
    expect(formatPlaytime(7200)).toBe('2h')
  })

  it('formats hours and minutes together', () => {
    expect(formatPlaytime(3660)).toBe('1h 1m')
    expect(formatPlaytime(5400)).toBe('1h 30m')
  })
})

describe('formatBytes', () => {
  it('returns em dash for missing or non-positive values', () => {
    expect(formatBytes(undefined)).toBe('—')
    expect(formatBytes(null)).toBe('—')
    expect(formatBytes(0)).toBe('—')
    expect(formatBytes(-1)).toBe('—')
  })

  it('formats bytes without decimals', () => {
    expect(formatBytes(512)).toBe('512 B')
  })

  it('formats KB/MB/GB with appropriate precision', () => {
    expect(formatBytes(1024)).toBe('1.0 KB')
    expect(formatBytes(10 * 1024)).toBe('10 KB')
    expect(formatBytes(1024 * 1024)).toBe('1.0 MB')
    expect(formatBytes(1024 ** 3)).toBe('1.0 GB')
    expect(formatBytes(1024 ** 4)).toBe('1.0 TB')
  })
})

describe('formatAchievementProgress', () => {
  it('returns None detected when total is non-positive', () => {
    expect(formatAchievementProgress(0, 0)).toBe('None detected')
    expect(formatAchievementProgress(3, -1)).toBe('None detected')
  })

  it('formats unlocked over total', () => {
    expect(formatAchievementProgress(3, 10)).toBe('3/10')
    expect(formatAchievementProgress(0, 5)).toBe('0/5')
  })
})

describe('formatRelativeDate', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns em dash for missing or invalid dates', () => {
    expect(formatRelativeDate()).toBe('—')
    expect(formatRelativeDate('')).toBe('—')
    expect(formatRelativeDate('not-a-date')).toBe('—')
  })

  it('returns Today for same calendar day', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-24T15:00:00Z'))
    expect(formatRelativeDate('2026-07-24T08:00:00Z')).toBe('Today')
  })

  it('returns Yesterday for one day ago', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-24T12:00:00Z'))
    expect(formatRelativeDate('2026-07-23T12:00:00Z')).toBe('Yesterday')
  })

  it('returns days ago within a week', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-24T12:00:00Z'))
    expect(formatRelativeDate('2026-07-21T12:00:00Z')).toBe('3 days ago')
  })

  it('returns a locale date string for older dates', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-24T12:00:00Z'))
    const result = formatRelativeDate('2026-06-01T12:00:00Z')
    expect(result).not.toBe('Today')
    expect(result).not.toBe('Yesterday')
    expect(result).not.toMatch(/days ago$/)
    expect(result).toMatch(/2026/)
  })
})

describe('providerLabel', () => {
  it('maps known providers to display labels', () => {
    expect(providerLabel('astris')).toBe('Nintendo Switch')
    expect(providerLabel('steam')).toBe('Steam')
    expect(providerLabel('gamehub')).toBe('GameHub')
    expect(providerLabel('native')).toBe('macOS')
    expect(providerLabel('manual')).toBe('Manual')
  })

  it('returns unknown providers unchanged', () => {
    expect(providerLabel('custom-source')).toBe('custom-source')
  })
})

describe('formatDlcCount', () => {
  it('handles zero, singular, and plural counts', () => {
    expect(formatDlcCount(0)).toBe('No DLC')
    expect(formatDlcCount(-2)).toBe('No DLC')
    expect(formatDlcCount(1)).toBe('1 DLC')
    expect(formatDlcCount(4)).toBe('4 DLC')
  })
})

describe('placeholderGradient', () => {
  it('returns a deterministic gradient for the same seed', () => {
    expect(placeholderGradient('game-a')).toBe(placeholderGradient('game-a'))
  })

  it('returns different gradients for different seeds', () => {
    expect(placeholderGradient('game-a')).not.toBe(placeholderGradient('game-b'))
  })

  it('uses the expected gradient shape', () => {
    expect(placeholderGradient('seed')).toMatch(
      /^linear-gradient\(145deg, hsl\(\d+ 42% 28%\), hsl\(\d+ 55% 14%\) 60%, #07090d\)$/,
    )
  })
})
