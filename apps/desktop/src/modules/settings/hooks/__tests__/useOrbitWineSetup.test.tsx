import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { useDownloadStore } from '@/lib/downloadProgress'
import { ORBIT_WINE_KEY, useOrbitWineSetup } from '../useOrbitWineSetup'

vi.mock('@/lib/tauri', () => ({ installOrbitWine: vi.fn() }))

import { installOrbitWine } from '@/lib/tauri'

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
)

afterEach(() => useDownloadStore.setState({ tasks: {}, failures: {} }))

it('tracks the Orbit Wine install and its container as one download', async () => {
  vi.mocked(installOrbitWine).mockImplementation(async (onProgress) => {
    onProgress({
      phase: 'Downloading',
      component: 'Orbit Wine 26.3.0',
      downloadedBytes: 50,
      totalBytes: 100,
    })
    expect(useDownloadStore.getState().tasks[ORBIT_WINE_KEY]?.progress).toMatchObject({
      downloadedBytes: 50,
    })
    onProgress({ phase: 'Installing', component: 'Orbit Wine container' })
    return { version: '26.3.0', path: '/w/wine', containerReady: true }
  })
  const { result } = renderHook(() => useOrbitWineSetup(), { wrapper })
  await act(() => result.current.install())
  const task = useDownloadStore.getState().tasks[ORBIT_WINE_KEY]
  expect(task?.label).toBe('Orbit Wine')
  expect(task?.progress?.phase).toBe('Ready')
  expect(useDownloadStore.getState().failures[ORBIT_WINE_KEY]).toBeUndefined()
})

it('records a failure so Setup can offer a retry', async () => {
  vi.mocked(installOrbitWine).mockRejectedValue('Orbit Wine has not been published yet')
  const { result } = renderHook(() => useOrbitWineSetup(), { wrapper })
  await act(() => result.current.install())
  expect(useDownloadStore.getState().failures[ORBIT_WINE_KEY]).toMatch(
    /not been published/,
  )
})
