import { expect, it } from 'vitest'
import { filterSteamOwnedGames } from '@/lib/steamOwnedFilter'
import type { SteamOwnedGame } from '@/types/steam'

function game(appId: string, title: string, installed = false): SteamOwnedGame {
  return {
    appId,
    title,
    description: null,
    coverUrl: '',
    heroUrl: '',
    installed,
  }
}

it('keeps God of War when the owned list is longer than 30 titles', () => {
  const games = Array.from({ length: 40 }, (_, index) =>
    game(String(index + 1), `Title ${String(index + 1).padStart(2, '0')}`),
  )
  games[31] = game('1593500', 'God of War')
  const visible = filterSteamOwnedGames(games, '', 'all')
  expect(visible).toHaveLength(40)
  expect(visible.some((item) => item.title === 'God of War')).toBe(true)
  expect(
    filterSteamOwnedGames(games, 'god of war', 'all').map((item) => item.appId),
  ).toEqual(['1593500'])
  expect(filterSteamOwnedGames(games, '1593500', 'all')[0]?.title).toBe('God of War')
})

it('hides installed games from the not-installed view', () => {
  const games = [game('570', 'Dota 2', true), game('1593500', 'God of War')]
  expect(
    filterSteamOwnedGames(games, '', 'not-installed').map((item) => item.appId),
  ).toEqual(['1593500'])
  expect(filterSteamOwnedGames(games, '', 'installed').map((item) => item.appId)).toEqual(
    ['570'],
  )
})
