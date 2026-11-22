import { create } from 'zustand'

interface XcloudStreamRequest {
  /** Microsoft Store product id; Rust maps it to xCloud's title id. */
  productId: string
  title: string
}

interface XcloudPlayerState {
  /** The cloud game streaming in Orbit's player, or null. */
  stream: XcloudStreamRequest | null
  /** In the background: the connection stays up, video hidden and muted,
   * no input sent to the game, Orbit usable. */
  paused: boolean
  open: (stream: XcloudStreamRequest) => void
  pause: () => void
  resume: () => void
  /** Ends the stream. */
  close: () => void
}

export const useXcloudPlayerStore = create<XcloudPlayerState>((set) => ({
  stream: null,
  paused: false,
  open: (stream) => set({ stream, paused: false }),
  pause: () => set((state) => (state.stream ? { paused: true } : {})),
  resume: () => set({ paused: false }),
  close: () => set({ stream: null, paused: false }),
}))
