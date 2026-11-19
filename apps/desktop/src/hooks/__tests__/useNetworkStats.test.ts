import { expect, it } from 'vitest'
import { pushSample } from '../useNetworkStats'

it('keeps the newest forty rates for the sparkline', () => {
  let samples: number[] = []
  for (let rate = 1; rate <= 45; rate += 1) samples = pushSample(samples, rate)
  expect(samples).toHaveLength(40)
  expect(samples[0]).toBe(6)
  expect(samples[samples.length - 1]).toBe(45)
})
