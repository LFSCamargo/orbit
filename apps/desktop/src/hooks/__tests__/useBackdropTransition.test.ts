import { act, renderHook, waitFor } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { prepareBackdrop, type ReadyBackdrop } from '@/lib/backdropImage'
import { useBackdropTransition } from '../useBackdropTransition'

vi.mock('@/lib/backdropImage', () => ({ prepareBackdrop: vi.fn() }))

const ready = (url: string): ReadyBackdrop => ({ url, lighting: null, cors: false })

it('discards an old image that finishes loading after a newer selection', async () => {
  let finishSlow!: (image: ReadyBackdrop) => void
  vi.mocked(prepareBackdrop).mockImplementation(({ url }) =>
    url.endsWith('/slow.jpg')
      ? new Promise((resolve) => {
          finishSlow = resolve
        })
      : Promise.resolve(ready(url)),
  )
  const { result, rerender } = renderHook(
    ({ url }) => useBackdropTransition(undefined, url),
    { initialProps: { url: 'https://example.test/first.jpg' } },
  )
  await waitFor(() => expect(result.current.active?.url).toContain('first.jpg'))
  rerender({ url: 'https://example.test/slow.jpg' })
  expect(result.current.active?.url).toContain('first.jpg')
  rerender({ url: 'https://example.test/latest.jpg' })
  await waitFor(() => expect(result.current.active?.url).toContain('latest.jpg'))
  await act(async () => finishSlow(ready('https://example.test/slow.jpg')))
  expect(result.current.active?.url).toContain('latest.jpg')
  expect(result.current.outgoing?.url).toContain('first.jpg')
  act(() => result.current.finish('https://example.test/latest.jpg'))
  expect(result.current.outgoing).toBeNull()
})
