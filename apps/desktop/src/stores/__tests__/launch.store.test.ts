import { afterEach, expect, it } from 'vitest'
import { useLaunchStore } from '../launch.store'

afterEach(() => useLaunchStore.getState().clear())

it('keeps the title from begin when progress events carry none', () => {
  useLaunchStore.getState().begin('steam-windows:1593500', 'God of War')
  useLaunchStore.getState().apply({
    gameId: 'g1',
    step: 'runtime',
    message: 'Checking Steam for Windows',
    index: 1,
    total: 7,
    failed: false,
  })
  expect(useLaunchStore.getState().launch).toMatchObject({
    gameId: 'g1',
    title: 'God of War',
  })
})

it('prefers the title reported by the backend', () => {
  useLaunchStore.getState().begin('steam-windows:1593500')
  useLaunchStore.getState().apply({
    gameId: 'steam-windows:1593500',
    step: 'resolve',
    message: 'Finding the Windows install',
    index: 0,
    total: 7,
    failed: false,
    title: 'God of War',
  })
  expect(useLaunchStore.getState().launch?.title).toBe('God of War')
})

it('keeps the title when the launch fails', () => {
  useLaunchStore.getState().begin('steam-windows:1593500', 'God of War')
  useLaunchStore
    .getState()
    .fail('steam-windows:1593500', 'resolve', 'Download the game before playing')
  expect(useLaunchStore.getState().launch).toMatchObject({
    failed: true,
    title: 'God of War',
  })
})
