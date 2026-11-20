import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { runStream } from '../runStream'
import type { XcloudPeer } from '../xcloudPeer'
import {
  xcloudStreamIce,
  xcloudStreamKeepalive,
  xcloudStreamSdp,
  xcloudStreamStart,
  xcloudStreamState,
  xcloudStreamStop,
} from '@/lib/tauri'

vi.mock('@/lib/tauri', () => ({
  xcloudStreamStart: vi.fn(),
  xcloudStreamState: vi.fn(),
  xcloudStreamSdp: vi.fn(),
  xcloudStreamIce: vi.fn(),
  xcloudStreamKeepalive: vi.fn(),
  xcloudStreamStop: vi.fn(),
}))

function fakePeer(): XcloudPeer {
  return {
    offer: vi.fn().mockResolvedValue('v=0 offer'),
    setAnswer: vi.fn().mockResolvedValue(undefined),
    localCandidates: vi
      .fn()
      .mockResolvedValue([{ candidate: 'a=candidate:1', sdpMid: '0', sdpMLineIndex: 0 }]),
    addRemoteCandidates: vi.fn().mockResolvedValue(undefined),
    setPaused: vi.fn(),
    close: vi.fn(),
  }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.mocked(xcloudStreamStart).mockResolvedValue(undefined)
  vi.mocked(xcloudStreamSdp).mockResolvedValue('v=0 answer')
  vi.mocked(xcloudStreamIce).mockResolvedValue([
    { candidate: 'a=candidate:2', sdpMid: '0', sdpMLineIndex: 0 },
  ])
  vi.mocked(xcloudStreamKeepalive).mockResolvedValue(true)
  vi.mocked(xcloudStreamStop).mockResolvedValue(undefined)
})

afterEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
})

it("waits through the queue, then connects the peer through Orbit's signalling", async () => {
  vi.mocked(xcloudStreamState)
    .mockResolvedValueOnce({ state: 'WaitingForResources', error: null })
    .mockResolvedValueOnce({ state: 'ReadyToConnect', error: null })
    .mockResolvedValueOnce({ state: 'Provisioned', error: null })
  const peer = fakePeer()
  const statuses: string[] = []
  const running = runStream({
    productId: '9NBLGGH4R315',
    peer,
    onStatus: (status) => statuses.push(status),
  })
  // Three state polls a second apart; the keepalive repeats, so step time.
  await vi.advanceTimersByTimeAsync(5000)
  const stop = await running
  expect(xcloudStreamStart).toHaveBeenCalledWith('9NBLGGH4R315')
  expect(statuses).toEqual(['queued', 'starting', 'connecting', 'playing'])
  expect(peer.setAnswer).toHaveBeenCalledWith('v=0 answer')
  expect(xcloudStreamIce).toHaveBeenCalledWith([
    { candidate: 'a=candidate:1', sdpMid: '0', sdpMLineIndex: 0 },
  ])
  expect(peer.addRemoteCandidates).toHaveBeenCalled()
  await vi.advanceTimersByTimeAsync(30_000)
  expect(xcloudStreamKeepalive).toHaveBeenCalled()
  stop()
  expect(peer.close).toHaveBeenCalled()
  expect(xcloudStreamStop).toHaveBeenCalled()
})

it("reports Microsoft's reason when the stream fails", async () => {
  vi.mocked(xcloudStreamState).mockResolvedValue({ state: 'Failed', error: 'No servers' })
  const peer = fakePeer()
  const running = runStream({ productId: 'X', peer, onStatus: () => undefined })
  const outcome = expect(running).rejects.toThrow('No servers')
  await vi.runAllTimersAsync()
  await outcome
  expect(peer.close).toHaveBeenCalled()
  expect(xcloudStreamStop).toHaveBeenCalled()
})

it('stops cleanly when the player is closed while waiting', async () => {
  vi.mocked(xcloudStreamState).mockResolvedValue({
    state: 'WaitingForResources',
    error: null,
  })
  const controller = new AbortController()
  const peer = fakePeer()
  const running = runStream({
    productId: 'X',
    peer,
    onStatus: () => undefined,
    signal: controller.signal,
  })
  await vi.advanceTimersByTimeAsync(2500)
  controller.abort()
  const outcome = expect(running).rejects.toThrow('cancelled')
  await vi.runAllTimersAsync()
  await outcome
  expect(xcloudStreamSdp).not.toHaveBeenCalled()
  expect(xcloudStreamStop).toHaveBeenCalled()
})
