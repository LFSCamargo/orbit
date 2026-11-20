import {
  xcloudStreamIce,
  xcloudStreamKeepalive,
  xcloudStreamSdp,
  xcloudStreamStart,
  xcloudStreamState,
  xcloudStreamStop,
} from '@/lib/tauri'
import type { XcloudPeer } from './xcloudPeer'

export type StreamStatus = 'starting' | 'queued' | 'connecting' | 'playing'

const STATE_POLL_MS = 1000
/** The cloud queue can be long; give up after this. */
const PROVISION_TIMEOUT_MS = 15 * 60 * 1000
const KEEPALIVE_MS = 30_000

function wait(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(new Error('Stream cancelled'))
    const timer = setTimeout(resolve, ms)
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer)
        reject(new Error('Stream cancelled'))
      },
      { once: true },
    )
  })
}

/**
 * Starts a cloud stream and connects `peer` to it: start → wait for
 * `Provisioned` (Rust sends `/connect` on `ReadyToConnect`) → SDP → ICE →
 * keepalive every 30 s. Resolves with a stop function once playing.
 */
export async function runStream({
  productId,
  peer,
  onStatus,
  onEnded,
  signal,
}: {
  productId: string
  peer: XcloudPeer
  onStatus: (status: StreamStatus) => void
  onEnded?: () => void
  signal?: AbortSignal
}): Promise<() => void> {
  const stop = () => {
    peer.close()
    void xcloudStreamStop().catch(() => undefined)
  }
  try {
    await xcloudStreamStart(productId)
    const deadline = Date.now() + PROVISION_TIMEOUT_MS
    let last: StreamStatus | null = null
    const report = (status: StreamStatus) => {
      if (status !== last) onStatus(status)
      last = status
    }
    for (;;) {
      if (signal?.aborted) throw new Error('Stream cancelled')
      const { state, error } = await xcloudStreamState()
      if (state === 'Provisioned') break
      if (state === 'Failed')
        throw new Error(error || 'Xbox Cloud Gaming could not start this game')
      report(state === 'WaitingForResources' ? 'queued' : 'starting')
      if (Date.now() > deadline)
        throw new Error('Xbox Cloud Gaming took too long to start')
      await wait(STATE_POLL_MS, signal)
    }
    report('connecting')
    await peer.setAnswer(await xcloudStreamSdp(await peer.offer()))
    await peer.addRemoteCandidates(await xcloudStreamIce(await peer.localCandidates()))
    if (signal?.aborted) throw new Error('Stream cancelled')
    report('playing')
  } catch (error) {
    stop()
    throw error
  }
  const keepalive = setInterval(() => {
    void xcloudStreamKeepalive()
      .then((alive) => {
        if (!alive) {
          clearInterval(keepalive)
          onEnded?.()
        }
      })
      .catch(() => undefined)
  }, KEEPALIVE_MS)
  return () => {
    clearInterval(keepalive)
    stop()
  }
}
