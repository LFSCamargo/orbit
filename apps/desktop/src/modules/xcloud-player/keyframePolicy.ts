/** No new video frame for this long counts as a frozen picture. */
export const STALL_MS = 1000
/** Keyframes are large; never ask for them closer together than this. */
export const KEYFRAME_MIN_GAP_MS = 2000

export interface KeyframeCheck {
  now: number
  paused: boolean
  /** When the last video frame was shown, or null before the first. */
  lastFrameAt: number | null
  lastRequestAt: number
}

/**
 * Whether to ask the server for a keyframe: only when the picture froze
 * (packet loss the decoder cannot recover from), never on a timer. O(1).
 */
export function keyframeDue({ now, paused, lastFrameAt, lastRequestAt }: KeyframeCheck) {
  if (paused || lastFrameAt === null) return false
  return now - lastFrameAt >= STALL_MS && now - lastRequestAt >= KEYFRAME_MIN_GAP_MS
}
