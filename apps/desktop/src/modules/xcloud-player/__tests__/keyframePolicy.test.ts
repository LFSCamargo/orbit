import { expect, it } from 'vitest'
import { KEYFRAME_MIN_GAP_MS, STALL_MS, keyframeDue } from '../keyframePolicy'

it('asks for a keyframe only when the picture stalls, at most once a gap', () => {
  // Regression: a keyframe every 5 s spiked the bitrate and hitched the stream
  // on a steady beat.
  const base = { paused: false, lastFrameAt: 1_000, lastRequestAt: 0 }
  expect(keyframeDue({ ...base, now: 1_000 + STALL_MS - 1 })).toBe(false)
  expect(keyframeDue({ ...base, now: 1_000 + STALL_MS })).toBe(true)
  expect(
    keyframeDue({
      ...base,
      now: 1_000 + STALL_MS,
      lastRequestAt: 1_000 + STALL_MS - KEYFRAME_MIN_GAP_MS + 1,
    }),
  ).toBe(false)
})

it('never asks while paused or before the first frame', () => {
  expect(
    keyframeDue({ paused: true, lastFrameAt: 0, lastRequestAt: 0, now: 99_999 }),
  ).toBe(false)
  expect(
    keyframeDue({ paused: false, lastFrameAt: null, lastRequestAt: 0, now: 99_999 }),
  ).toBe(false)
})
