import { expect, it } from 'vitest'
import type { Game } from '@/types/game'
import { gameSource, groupBySource, SOURCE_LABELS } from '../gameSource'

const game = (provider: Game['provider'], platform: Game['platform']) =>
  ({ provider, platform }) as Game

it('tells Steam for Mac, Steam for Windows and Astris apart', () => {
  expect(gameSource(game('steam', 'macos'))).toBe('steam-mac')
  expect(gameSource(game('steam', 'windows'))).toBe('steam-windows')
  expect(gameSource(game('astris', 'nintendo-switch'))).toBe('astris')
  expect(gameSource(game('native', 'macos'))).toBe('other')
  expect(gameSource(game('manual', 'windows'))).toBe('other')
  expect(SOURCE_LABELS['steam-windows']).toBe('Steam · Windows')
})

it('groups entries into sections in a fixed order and keeps their order', () => {
  const entry = (id: string, provider: Game['provider'], platform: Game['platform']) => ({
    id,
    game: game(provider, platform),
  })
  const sections = groupBySource([
    entry('gow', 'steam', 'windows'),
    entry('zelda', 'astris', 'nintendo-switch'),
    entry('dota', 'steam', 'macos'),
    entry('re2', 'steam', 'windows'),
  ])
  expect(sections.map((section) => section.source)).toEqual([
    'steam-mac',
    'steam-windows',
    'astris',
  ])
  expect(sections[1].entries.map((e) => e.id)).toEqual(['gow', 're2'])
})
